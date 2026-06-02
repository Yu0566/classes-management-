import { autoUpdater } from 'electron-updater'
import { BrowserWindow, app } from 'electron'

let mainWindow: BrowserWindow | null = null

function translateError(msg: string): string {
  if (msg.includes('超时')) return msg
  if (msg.includes('No published versions') || msg.includes('no published versions'))
    return 'GitHub 上未找到已发布的版本，请先发布新版本'
  if (msg.includes('latest.yml'))
    return 'GitHub Release 缺少 latest.yml，请重新发布'
  if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo') || msg.includes('ECONNREFUSED'))
    return '无法连接到 GitHub，请检查网络连接'
  if (msg.includes('404') || msg.includes('Not Found'))
    return '找不到 GitHub 仓库或 Release，请检查仓库配置'
  if (msg.includes('rate limit'))
    return 'GitHub API 请求次数超限，请稍后再试'
  return `更新检查失败：${msg}`
}

export function initUpdater(win: BrowserWindow): void {
  mainWindow = win

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = true
  }

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update:checking')
  })

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:available', info)
  })

  autoUpdater.on('update-not-available', (info) => {
    mainWindow?.webContents.send('update:not-available', info)
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update:download-progress', progress)
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update:downloaded', info)
  })

  autoUpdater.on('error', (error) => {
    mainWindow?.webContents.send('update:error', translateError(error.message))
  })
}

export async function checkForUpdates(): Promise<void> {
  const TIMEOUT = 15000
  try {
    await Promise.race([
      autoUpdater.checkForUpdates(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('连接GitHub超时（15秒），请检查网络或使用代理')), TIMEOUT)
      ),
    ])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    mainWindow?.webContents.send('update:error', translateError(msg))
    throw err
  }
}

export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate()
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
