import { app, BrowserWindow, Menu, dialog, screen, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { initDatabase, getDatabase, closeDatabase, checkOldData, type RecoveryDecision } from './database/connection'
import { registerIpcHandlers } from './ipc-handlers'
import { startServer, stopServer, setNotifier } from './lan-server'
import { startTunnel, stopTunnel, ensureCloudflared } from './tunnel'
import { initUpdater } from './updater'
import { showNotificationWindow } from './notify-window'
import { createFloatBall, closeFloatBall } from './float-ball'


// 防止未捕获异常导致进程崩溃
process.on('uncaughtException', (err) => {
  console.error('[Main] 未捕获异常:', err.message, err.stack)
})

// 禁用 GPU 加速以解决 Windows 上的兼容性问题
app.disableHardwareAcceleration()

// 单实例锁定：防止重复启动
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let isQuitting = false
let closeDialogOpen = false
const isDev = !app.isPackaged

// 开发模式使用独立的 userData 目录，与正式版数据完全隔离
if (isDev) {
  const devUserData = path.join(app.getPath('userData'), '..', 'class-management-dev')
  app.setPath('userData', devUserData)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: '课堂管理系统',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 点叉关闭 → 拦截，弹出应用内自定义确认弹窗（引导最小化，避免误退出断开 LAN 连接）
  mainWindow.on('close', (e) => {
    if (isQuitting) return
    e.preventDefault()
    // 第二次点叉（弹窗可能未正常显示）→ 直接最小化兜底
    if (closeDialogOpen) {
      mainWindow!.minimize()
      return
    }
    const wc = mainWindow!.webContents
    // 渲染进程不可用（崩溃/销毁）→ 退回最小化，避免无法关闭
    if (wc.isDestroyed() || wc.isCrashed()) {
      mainWindow!.minimize()
      return
    }
    closeDialogOpen = true
    wc.send('app:close-request')
  })

  // 主窗口关闭时退出应用
  mainWindow.on('closed', () => {
    mainWindow = null
    app.quit()
  })

  // 初始化自动更新
  initUpdater(mainWindow)

  // 通知转发：LAN 服务器收到通知 → 弹出桌面窗口
  setNotifier(({ notificationId, message, mode, duration, images, urgency, confirmMode, confirmStudents, lanPort }) => {
    showNotificationWindow(notificationId, message, mode, duration, images, urgency, confirmMode, confirmStudents, lanPort)
  })
}

// 渲染端关闭确认弹窗的回传：最小化 / 退出 / 取消
ipcMain.on('app:close-response', (_e, decision: 'minimize' | 'quit' | 'cancel') => {
  closeDialogOpen = false
  if (!mainWindow) return
  if (decision === 'quit') {
    isQuitting = true
    app.quit()
  } else if (decision === 'minimize') {
    mainWindow.minimize()
  }
  // cancel：什么都不做，窗口保持打开
})

function loadApp() {
  if (!mainWindow) return
  if (isDev) {
    const portFile = path.join(process.cwd(), '.vite-tmp', 'port')
    if (fs.existsSync(portFile)) {
      let port = 5173
      try {
        port = parseInt(fs.readFileSync(portFile, 'utf-8').trim(), 10) || 5173
      } catch { /* fallback */ }
      mainWindow.loadURL(`http://localhost:${port}`)
    } else {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  mainWindow.maximize()
  mainWindow.show()

}

// 重新导出供 ipc-handlers 使用
export { showNotificationWindow }

app.whenReady().then(async () => {
  // 先创建窗口（空白），确保窗口始终可见，再初始化数据库
  createWindow()

  const dbFileName = app.isPackaged ? 'class-management.db' : 'class-management-dev.db'
  const dbPath = path.join(app.getPath('userData'), dbFileName)

  // 检测旧版本数据（仅在打包版提示，开发模式跳过以免干扰调试）
  if (app.isPackaged) {
    const { hasOldData, studentCount } = await checkOldData(dbPath)
    if (hasOldData) {
      const result = await dialog.showMessageBox({
        type: 'question',
        title: '检测到旧版本数据',
        message: `检测到旧版本数据（${studentCount} 名学生）`,
        detail: '是否同步旧数据到新版本？\n\n选择"同步"将保留所有历史数据（班级、积分、考勤、值日、成长记录等）。\n选择"全新开始"将以空白状态启动，旧数据将被备份为 .bak 文件。',
        buttons: ['同步旧数据', '全新开始'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })

      if (result.response === 1) {
        // 用户选择"全新开始"——备份旧数据库
        const bakPath = dbPath + '.' + Date.now() + '.bak'
        fs.renameSync(dbPath, bakPath)
        console.log('旧数据已备份到:', bakPath)
      }
      // 用户选择"同步"，直接使用现有数据库
    }
  }

  await initDatabase(dbPath, async ({ backups, lastFailed }): Promise<RecoveryDecision> => {
    // 数据库损坏且无法静默恢复 → 弹出原生修复对话框（不依赖前端界面）
    while (true) {
      const buttons: string[] = []
      if (backups.length > 0) buttons.push('从最新备份恢复')
      buttons.push('选择备份文件…')
      buttons.push('全新开始')

      const detail =
        (lastFailed ? `所选备份「${lastFailed}」也已损坏，请另选。\n\n` : '') +
        '请选择恢复方式：\n\n' +
        (backups.length > 0 ? '• 从最新备份恢复：使用最近一次自动备份的数据\n' : '') +
        '• 选择备份文件…：手动挑选某一份备份文件\n' +
        '• 全新开始：以空白数据启动（损坏文件会被备份保留为 .corrupted-*.bak）'

      const r = await dialog.showMessageBox({
        type: 'warning',
        title: '数据库损坏',
        message: '检测到数据库文件损坏，无法直接打开。',
        detail,
        buttons,
        defaultId: 0,
        cancelId: buttons.length - 1,
        noLink: true,
      })

      const label = buttons[r.response]
      if (label === '从最新备份恢复') return { action: 'restore', backupPath: backups[0].path }
      if (label === '全新开始') return { action: 'fresh' }

      // 选择备份文件…
      const pick = await dialog.showOpenDialog({
        title: '选择要恢复的备份文件',
        defaultPath: path.join(path.dirname(dbPath), 'backups'),
        properties: ['openFile'],
        filters: [{ name: '数据库备份', extensions: ['db'] }],
      })
      if (!pick.canceled && pick.filePaths[0]) return { action: 'restore', backupPath: pick.filePaths[0] }
      // 取消选择 → 回到主对话框
    }
  })

  // 注册 IPC 处理器
  registerIpcHandlers()

  // 数据库就绪后加载前端应用
  loadApp()

  // 悬浮球（课堂加分快捷入口）
  createFloatBall()

  // 后台预下载 cloudflared（不阻塞启动）
  if (app.isPackaged) {
    ensureCloudflared().catch(() => {})
  }

  // 自动启动 LAN + 隧道（不阻塞主流程）
  const DEFAULT_PORT = 3456
  startServer(DEFAULT_PORT, isDev).then(({ port }) => {
    console.log(`[Main] LAN 服务器已自动启动，端口 ${port}`)
    // 若页面从 file:// 加载，切换到 LAN 服务器，确保 /api/ 请求可达
    if (mainWindow && mainWindow.webContents.getURL().startsWith('file:')) {
      mainWindow.loadURL(`http://localhost:${port}`)
    }
    // LAN 启动成功后，延迟启动隧道（仅打包版，开发模式不连避免跟生产环境冲突）
    if (app.isPackaged) {
      setTimeout(() => {
        startTunnel(port).catch(err => {
          console.error('[Main] 隧道自动启动失败:', err?.message || err)
        })
      }, 3000)
    }
  }).catch(err => {
    console.error('[Main] LAN 自动启动失败:', err?.message || err)
  })

  // 确保主窗口获取焦点，widget 不抢在最前
  if (mainWindow) {
    mainWindow.focus()
    mainWindow.setAlwaysOnTop(false)
  }

  // 移除菜单栏（Windows下需窗口创建后再移除）
  Menu.setApplicationMenu(null)
  mainWindow?.setMenu(null)


  // 当用户尝试启动第二个实例时，聚焦现有窗口
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}).catch(async (err) => {
  console.error('[Main] 启动失败:', err)
  await dialog.showErrorBox('启动失败', err.message || '未知错误')
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  closeFloatBall()
  stopTunnel()
  stopServer()
  closeDatabase()
})

export { mainWindow }
