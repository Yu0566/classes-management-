import { BrowserWindow, screen, ipcMain } from 'electron'
import path from 'path'

let floatWin: BrowserWindow | null = null
const BALL_SIZE = 60
const PANEL_WIDTH = 340
const PANEL_HEIGHT = 560

export function createFloatBall() {
  if (floatWin) return

  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize

  floatWin = new BrowserWindow({
    width: BALL_SIZE,
    height: BALL_SIZE,
    x: screenW - BALL_SIZE - 20,
    y: Math.round(screenH * 0.4),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  floatWin.loadFile(path.join(__dirname, '../dist/float-ball.html'))
  floatWin.setVisibleOnAllWorkspaces(true)

  floatWin.on('closed', () => { floatWin = null })

  // 展开面板
  ipcMain.removeHandler('float:expand')
  ipcMain.handle('float:expand', () => {
    if (!floatWin) return
    const [x, y] = floatWin.getPosition()
    const { width: sw } = screen.getPrimaryDisplay().workAreaSize
    const newX = (x + PANEL_WIDTH > sw) ? sw - PANEL_WIDTH - 10 : x
    floatWin.setBounds({ x: newX, y: y - 20, width: PANEL_WIDTH, height: PANEL_HEIGHT })
  })

  // 收起面板
  ipcMain.removeHandler('float:collapse')
  ipcMain.handle('float:collapse', () => {
    if (!floatWin) return
    const [x, y] = floatWin.getPosition()
    const { width: sw } = screen.getPrimaryDisplay().workAreaSize
    const newX = Math.min(x, sw - BALL_SIZE - 10)
    floatWin.setBounds({ x: newX, y: y + 20, width: BALL_SIZE, height: BALL_SIZE })
  })

  // 拖拽移动
  ipcMain.removeHandler('float:move')
  ipcMain.handle('float:move', (_e, dx: number, dy: number) => {
    if (!floatWin) return
    const [x, y] = floatWin.getPosition()
    floatWin.setPosition(x + dx, y + dy)
  })
}

export function closeFloatBall() {
  if (floatWin) {
    floatWin.close()
    floatWin = null
  }
}

export function isFloatBallOpen(): boolean {
  return floatWin !== null
}
