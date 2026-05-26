import { app, BrowserWindow, Menu } from 'electron'
import path from 'path'
import { initDatabase, getDatabase, closeDatabase } from './database/connection'
import { registerIpcHandlers } from './ipc-handlers'

// 禁用 GPU 加速以解决 Windows 上的兼容性问题
app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | null = null
const isDev = !app.isPackaged

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
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(async () => {
  // 初始化数据库
  const dbPath = path.join(app.getPath('userData'), 'class-management.db')
  await initDatabase(dbPath)

  // 注册 IPC 处理器
  registerIpcHandlers()

  // 创建窗口
  createWindow()

  // 移除菜单栏（Windows下需窗口创建后再移除）
  Menu.setApplicationMenu(null)
  mainWindow?.setMenu(null)

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
  closeDatabase()
})

export { mainWindow }
