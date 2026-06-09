import { app, BrowserWindow, Menu, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { initDatabase, getDatabase, closeDatabase, checkOldData } from './database/connection'
import { registerIpcHandlers } from './ipc-handlers'
import { stopServer, setNotifier } from './lan-server'
import { stopTunnel } from './tunnel'
import { initUpdater } from './updater'
import { showNotificationWindow } from './notify-window'
import { createDashboardWidget, closeWidget } from './dashboard-widget'


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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    // 从 .vite-tmp/port 读取 Vite 实际端口
    let port = 5173
    try {
      const portFile = path.join(process.cwd(), '.vite-tmp', 'port')
      if (fs.existsSync(portFile)) {
        port = parseInt(fs.readFileSync(portFile, 'utf-8').trim(), 10) || 5173
      }
    } catch { /* fallback to default */ }
    mainWindow.loadURL(`http://localhost:${port}`)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

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

// 重新导出供 ipc-handlers 使用
export { showNotificationWindow }

app.whenReady().then(async () => {
  // 初始化数据库（开发模式使用独立数据库，避免测试数据污染正式版）
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

  await initDatabase(dbPath)

  // 注册 IPC 处理器
  registerIpcHandlers()

  // 创建窗口
  createWindow()

  // 创建桌面看板便签（右侧停靠）
  createDashboardWidget(isDev)

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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeWidget()
  stopTunnel()
  stopServer()
  closeDatabase()
})

export { mainWindow }
