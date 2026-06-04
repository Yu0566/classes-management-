import { BrowserWindow, screen } from 'electron'
import path from 'path'
import fs from 'fs'

let widgetWindow: BrowserWindow | null = null
let _isDev = false

function getDevPort(): number {
  try {
    const portFile = path.join(process.cwd(), '.vite-tmp', 'port')
    if (fs.existsSync(portFile)) {
      return parseInt(fs.readFileSync(portFile, 'utf-8').trim(), 10) || 5173
    }
  } catch { /* fallback */ }
  return 5173
}

function createWidgetWindow(): void {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  const widgetWidth = 340
  const widgetHeight = Math.min(screenHeight - 80, 750)

  widgetWindow = new BrowserWindow({
    width: widgetWidth,
    height: widgetHeight,
    x: screenWidth - widgetWidth,
    y: Math.round((screenHeight - widgetHeight) / 2),
    frame: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    resizable: true,
    minHeight: 360,
    maxHeight: screenHeight - 60,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    backgroundColor: '#f1f5f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 确保不置顶、不抢焦点
  widgetWindow.setAlwaysOnTop(false)
  widgetWindow.blur()

  if (_isDev) {
    const port = getDevPort()
    console.log('[Widget] Loading dev URL on port:', port)
    widgetWindow.loadURL(`http://localhost:${port}/#/dashboard-widget`)
  } else {
    widgetWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/dashboard-widget' })
  }

  widgetWindow.on('closed', () => {
    widgetWindow = null
  })

  // 防止窗口被意外置顶
  widgetWindow.on('focus', () => {
    widgetWindow?.setAlwaysOnTop(false)
  })
}

export function createDashboardWidget(isDev: boolean): void {
  _isDev = isDev
  createWidgetWindow()
}

export function openWidget(): void {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    // 已存在则聚焦
    widgetWindow.focus()
  } else {
    createWidgetWindow()
  }
}

export function getWidgetWindow(): BrowserWindow | null {
  return widgetWindow
}

export function isWidgetOpen(): boolean {
  return widgetWindow !== null && !widgetWindow.isDestroyed()
}

export function refreshWidget(): void {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send('widget:refresh')
  }
}

export function closeWidget(): void {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.close()
  }
}
