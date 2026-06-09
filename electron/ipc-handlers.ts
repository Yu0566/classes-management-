import { ipcMain, app, shell } from 'electron'
import { queryAll, queryOne, executeRun, executeTransaction } from './database/query-helpers'
import { startServer, stopServer, getServerStatus, setDeviceName } from './lan-server'
import { checkForUpdates, downloadUpdate, quitAndInstall } from './updater'
import { mainWindow } from './main'
import { showNotificationWindow } from './notify-window'
import { closeWidget, openWidget, isWidgetOpen, refreshWidget } from './dashboard-widget'
import { startTunnel, stopTunnel, getTunnelStatus, onTunnelStatusChange } from './tunnel'


export function registerIpcHandlers(): void {
  // 查询多行
  ipcMain.handle('db:query', (_event, sql: string, params?: unknown[]) => {
    try {
      return { success: true, data: queryAll(sql, params) }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // 执行写操作
  ipcMain.handle('db:run', (_event, sql: string, params?: unknown[]) => {
    try {
      const result = executeRun(sql, params)
      return { success: true, ...result }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // 查询单行
  ipcMain.handle('db:get', (_event, sql: string, params?: unknown[]) => {
    try {
      return { success: true, data: queryOne(sql, params) }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // 事务
  ipcMain.handle('db:transaction', (_event, operations: { sql: string; params?: unknown[] }[]) => {
    try {
      executeTransaction(operations)
      return { success: true }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // LAN 服务器控制
  ipcMain.handle('lan:start', async (_event, port: number) => {
    try {
      const result = await startServer(port)
      return { success: true, ip: result.ip, port: result.port }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('lan:stop', () => {
    stopServer()
    return { success: true }
  })

  ipcMain.handle('lan:status', () => {
    return getServerStatus()
  })

  ipcMain.handle('device-name:set', (_event, name: string) => {
    setDeviceName(name)
    return { success: true }
  })

  // Cloudflare Tunnel 控制
  ipcMain.handle('tunnel:start', async (_event, port: number) => {
    try {
      await startTunnel(port)
      return { success: true }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('tunnel:stop', () => {
    stopTunnel()
    return { success: true }
  })

  ipcMain.handle('tunnel:status', () => {
    return getTunnelStatus()
  })

  // 隧道状态推送
  onTunnelStatusChange((state) => {
    mainWindow?.webContents.send('tunnel:statusChange', state)
  })

  // 通知
  ipcMain.handle('notify:send', (_event, message: string, mode?: string, duration?: number, imagesJson?: string, urgency?: string, confirmMode?: string, confirmStudentsJson?: string, lanPort?: number) => {
    try {
      if (!message) {
        return { success: false, error: '内容不能为空' }
      }
      let images: string[] = []
      if (imagesJson) {
        try { images = JSON.parse(imagesJson) } catch { /* ignore */ }
      }
      let confirmStudents: string[] = []
      if (confirmStudentsJson) {
        try { confirmStudents = JSON.parse(confirmStudentsJson) } catch { /* ignore */ }
      }
      const cMode = (confirmMode === 'any' || confirmMode === 'specific') ? confirmMode : 'none'
      showNotificationWindow(
        `ipc-${Date.now()}`,
        message,
        (mode === 'top' ? 'top' : 'fullscreen'),
        duration,
        images,
        (urgency === '重要' || urgency === '紧急' ? urgency : '普通'),
        cMode,
        confirmStudents,
        lanPort || 3456,
      )
      return { success: true }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // 应用信息
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })

  // 自动更新
  ipcMain.handle('app:checkUpdate', async () => {
    try {
      await checkForUpdates()
      return { success: true }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('app:downloadUpdate', async () => {
    try {
      await downloadUpdate()
      return { success: true }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('app:quitAndInstall', () => {
    quitAndInstall()
    return { success: true }
  })

  ipcMain.handle('app:openExternal', async (_event, url: string) => {
    return shell.openExternal(url)
  })

  // 桌面看板便签
  ipcMain.handle('widget:close', () => {
    closeWidget()
    return { success: true }
  })

  ipcMain.handle('widget:open', () => {
    openWidget()
    return { success: true }
  })

  ipcMain.handle('widget:isOpen', () => {
    return { open: isWidgetOpen() }
  })

  ipcMain.handle('widget:openMain', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    return { success: true }
  })

  // 数据变更时通知便签和主窗口刷新
  ipcMain.handle('data:changed', () => {
    refreshWidget()
    mainWindow?.webContents.send('main:refresh')
    return { success: true }
  })

}
