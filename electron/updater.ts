import { autoUpdater } from 'electron-updater'
import { BrowserWindow, app } from 'electron'
import https from 'https'

let mainWindow: BrowserWindow | null = null

const GITEE_API = 'https://gitee.com/api/v5/repos/yu0566/class-management/releases'
const GITEE_DOWNLOAD = 'https://gitee.com/yu0566/class-management/releases/download'

function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'electron-updater' } }, (res) => {
      let data = ''
      res.on('data', (chunk: string) => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`))
        }
      })
    }).on('error', reject)
  })
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (partsA[i] > partsB[i]) return 1
    if (partsA[i] < partsB[i]) return -1
  }
  return 0
}

function translateError(msg: string): string {
  if (msg.includes('超时')) return msg
  if (msg.includes('No published versions') || msg.includes('no published versions'))
    return 'Gitee 上未找到已发布的版本，请先发布新版本'
  if (msg.includes('latest.yml'))
    return 'Gitee Release 缺少 latest.yml，请重新发布'
  if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo') || msg.includes('ECONNREFUSED'))
    return '无法连接到 Gitee，请检查网络连接'
  if (msg.includes('404') || msg.includes('Not Found'))
    return '找不到 Gitee 仓库或 Release，请检查仓库配置'
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
    // 1. 从 Gitee API 获取最新 Release（按创建时间降序，取最高的版本号）
    const releases: any[] = await Promise.race([
      fetchJSON(`${GITEE_API}?per_page=5&direction=desc`),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('连接Gitee超时（15秒），请检查网络连接')), TIMEOUT)
      ),
    ])
    if (!releases || releases.length === 0) {
      mainWindow?.webContents.send('update:not-available', { version: app.getVersion() })
      return
    }

    // 过滤掉预发布版本，按版本号降序排列，取最高版本
    const stableReleases = releases.filter((r: any) => !r.prerelease)
    if (stableReleases.length === 0) {
      mainWindow?.webContents.send('update:not-available', { version: app.getVersion() })
      return
    }
    stableReleases.sort((a: any, b: any) => {
      const va = a.tag_name.replace(/^[vV]/, '')
      const vb = b.tag_name.replace(/^[vV]/, '')
      return compareVersions(vb, va)
    })
    const latestRelease = stableReleases[0]
    const tagName: string = latestRelease.tag_name // e.g., "V2.9.0"
    const latestVersion = tagName.replace(/^[vV]/, '') // "2.9.0"
    const currentVersion = app.getVersion()

    // 2. 版本比较
    if (compareVersions(latestVersion, currentVersion) <= 0) {
      mainWindow?.webContents.send('update:not-available', { version: currentVersion })
      return
    }

    // 3. 有新版本，设置 feed URL 指向具体 Release
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: `${GITEE_DOWNLOAD}/${tagName}`,
    })

    // 4. 检查更新（获取 latest.yml）
    await autoUpdater.checkForUpdates()
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
