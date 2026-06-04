import { BrowserWindow, app, screen } from 'electron'
import path from 'path'
import fs from 'fs'

const isDev = !app.isPackaged

function getDevPort(): number {
  try {
    const portFile = path.join(process.cwd(), '.vite-tmp', 'port')
    if (fs.existsSync(portFile)) {
      return parseInt(fs.readFileSync(portFile, 'utf-8').trim(), 10) || 5173
    }
  } catch { /* fallback */ }
  return 5173
}

export type NotifyMode = 'fullscreen' | 'top'
export type Urgency = '普通' | '重要' | '紧急'

interface NotifyItem {
  message: string
  mode: NotifyMode
  duration: number
  images: string[]
  urgency: Urgency
}

const queue: NotifyItem[] = []
let activeWin: BrowserWindow | null = null

function createNotifyWindow(item: NotifyItem): BrowserWindow {
  console.log('[NotifyWindow] createNotifyWindow item.urgency:', item.urgency, 'item:', JSON.stringify({ message: item.message, mode: item.mode, duration: item.duration, urgency: item.urgency }))
  const isTop = item.mode === 'top'
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  const win = new BrowserWindow({
    ...(isTop
      ? {
          x: 0,
          y: 0,
          width: screenWidth,
          height: Math.floor(screenHeight / 3),
          resizable: false,
          movable: false,
        }
      : {
          fullscreen: true,
          resizable: false,
        }
    ),
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
    },
  })

  const baseUrl = isDev
    ? `http://localhost:${getDevPort()}/notify.html`
    : `file://${path.join(__dirname, '../dist/notify.html').replace(/\\/g, '/')}`

  const params = new URLSearchParams()
  params.set('message', item.message)
  params.set('mode', item.mode)
  params.set('duration', String(item.duration))
  params.set('urgency', item.urgency)
  if (item.images && item.images.length > 0) {
    win.webContents.on('did-finish-load', () => {
      if (!win.isDestroyed()) {
        win.webContents.executeJavaScript(`
          window.__notifyImages = ${JSON.stringify(item.images)};
          updateImages();
        `).catch(err => console.error('[NotifyWindow] executeJavaScript failed:', err))
      }
    })
  }

  win.loadURL(`${baseUrl}?${params.toString()}&_t=${Date.now()}`)

  if (item.duration > 0) {
    const durationMs = item.duration * 1000
    setTimeout(() => {
      if (!win.isDestroyed()) win.close()
    }, durationMs)
  }

  return win
}

function showNext(): void {
  if (queue.length === 0) {
    activeWin = null
    return
  }
  const item = queue.shift()!
  activeWin = createNotifyWindow(item)
  activeWin.on('closed', () => {
    activeWin = null
    showNext()
  })
}

export function showNotificationWindow(
  _title: string,
  message: string,
  mode: NotifyMode = 'fullscreen',
  duration?: number,
  images?: string[],
  urgency: Urgency = '普通'
): void {
  const effectiveDuration = duration ?? (mode === 'top' ? 8 : 30)
  const item: NotifyItem = { message, mode, duration: effectiveDuration, images: images || [], urgency }

  if (activeWin && !activeWin.isDestroyed()) {
    if (mode === 'top') {
      queue.unshift(item)
      activeWin.close()
    } else {
      queue.push(item)
    }
  } else if (queue.length > 0) {
    queue.push(item)
  } else {
    activeWin = createNotifyWindow(item)
    activeWin.on('closed', () => {
      activeWin = null
      showNext()
    })
  }
}
