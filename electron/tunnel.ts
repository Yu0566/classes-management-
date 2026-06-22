import { ChildProcess, spawn, execSync } from 'child_process'
import { app } from 'electron'
import https from 'https'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { getDeviceName } from './lan-server'

type TunnelStatus = 'stopped' | 'connecting' | 'connected' | 'error'

export interface TunnelState {
  status: TunnelStatus
  url: string
  error?: string
}

const PERMANENT_URL = 'https://classmanagement.top'
const TUNNEL_ID = 'aaa8079a-169e-4fc1-bdda-2f473a1efa02'

let tunnelProcess: ChildProcess | null = null
let tunnelPid: number | null = null
let currentStatus: TunnelStatus = 'stopped'
let currentError = ''
let statusCallbacks: Array<(state: TunnelState) => void> = []
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let currentPort: number = 3456

// 自动重连相关
let restartCount = 0
let restartWindowStart = 0
const MAX_RESTARTS = 3
const RESTART_WINDOW_MS = 5 * 60 * 1000 // 5分钟内最多重启3次

function notify() {
  const state: TunnelState = {
    status: currentStatus,
    url: PERMANENT_URL,
    error: currentError || undefined,
  }
  statusCallbacks.forEach(cb => cb(state))
}

function setStatus(status: TunnelStatus, error?: string) {
  currentStatus = status
  if (error !== undefined) currentError = error
  else if (status !== 'error') currentError = ''
  notify()
}

const CLOUDFLARED_DOWNLOAD_URL = 'https://gitee.com/yu0566/class-management/releases/download/cloudflared-bin/cloudflared.exe'

function getCloudflaredPath(): string {
  if (!app.isPackaged) {
    return path.join(process.cwd(), 'cloudflared.exe')
  }
  return path.join(app.getPath('userData'), 'cloudflared', 'cloudflared.exe')
}

function prepareRunnableCopy(srcPath: string): string {
  const dir = path.dirname(srcPath)
  for (let i = 0; i < 3; i++) {
    const runPath = path.join(dir, i === 0 ? 'cloudflared-run.exe' : `cloudflared-run${i + 1}.exe`)
    try {
      fs.copyFileSync(srcPath, runPath)
      return runPath
    } catch (e: any) {
      if (e.code === 'EBUSY' || e.code === 'EPERM') {
        continue
      }
      throw e
    }
  }
  return srcPath
}

export async function ensureCloudflared(): Promise<boolean> {
  const targetPath = getCloudflaredPath()
  if (fs.existsSync(targetPath)) return true

  const dir = path.dirname(targetPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  console.log('[Tunnel] cloudflared.exe 不存在，开始下载...')
  try {
    await downloadFile(CLOUDFLARED_DOWNLOAD_URL, targetPath)
    console.log('[Tunnel] cloudflared.exe 下载完成')
    return true
  } catch (err) {
    console.error('[Tunnel] cloudflared.exe 下载失败:', err)
    return false
  }
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmpPath = dest + '.tmp'
    const file = fs.createWriteStream(tmpPath)
    const request = (reqUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) { reject(new Error('Too many redirects')); return }
      const mod = reqUrl.startsWith('https') ? https : require('http')
      mod.get(reqUrl, { timeout: 30000 }, (res: any) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(res.headers.location, redirectCount + 1)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        res.pipe(file)
        file.on('finish', () => {
          file.close()
          fs.renameSync(tmpPath, dest)
          resolve()
        })
      }).on('error', (err: Error) => {
        fs.unlink(tmpPath, () => {})
        reject(err)
      })
    }
    request(url)
  })
}

function getSourceCredentialPath(filename: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tunnel', filename)
  }
  return path.join(process.cwd(), 'tunnel', filename)
}

function ensureTunnelDir(): string {
  const dir = path.join(app.getPath('userData'), 'cloudflared')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function copyIfMissing(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(src, dest)
  }
}

function generateConfig(port: number): string {
  const dir = ensureTunnelDir()
  const certPemSrc = getSourceCredentialPath('cert.pem')
  const credJsonSrc = getSourceCredentialPath('credentials.json')
  const certPemDest = path.join(dir, 'cert.pem')
  const credJsonDest = path.join(dir, 'credentials.json')

  copyIfMissing(certPemSrc, certPemDest)
  copyIfMissing(credJsonSrc, credJsonDest)

  const configPath = path.join(dir, 'config.yml')
  const yml = [
    `tunnel: ${TUNNEL_ID}`,
    `credentials-file: ${credJsonDest.replace(/\\/g, '/')}`,
    `origin-cert: ${certPemDest.replace(/\\/g, '/')}`,
    '',
    'ingress:',
    '  - hostname: classmanagement.top',
    `    service: http://localhost:${port}`,
    '  - hostname: class.classmanagement.top',
    `    service: http://localhost:${port}`,
    '  - service: http_status:404',
    '',
  ].join('\n')

  fs.writeFileSync(configPath, yml, 'utf-8')
  return configPath
}

function checkTunnelConflict(): Promise<void> {
  return new Promise((resolve, reject) => {
    const localDevice = getDeviceName()
    console.log('[Tunnel] 冲突检测，本机设备名:', JSON.stringify(localDevice))

    const req = https.get(`${PERMANENT_URL}/api/health`, { timeout: 10000 }, (res) => {
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => {
        try {
          const data = JSON.parse(body)
          const remoteDevice = data.deviceName || ''
          const remoteHost = data.hostname || ''

          // 远端有设备在运行
          if (localDevice && remoteDevice && remoteDevice !== localDevice) {
            reject(new Error(`域名已被 "${remoteDevice}" 占用，请先关闭那台电脑的隧道`))
            return
          }
          if (!localDevice && remoteDevice) {
            reject(new Error(`检测到设备 "${remoteDevice}" 正在使用隧道，本机未设置设备名称无法区分身份`))
            return
          }
          if (!localDevice && !remoteDevice && remoteHost && remoteHost !== os.hostname()) {
            reject(new Error(`域名已被 "${remoteHost}" 占用，请先关闭那台电脑的隧道`))
            return
          }
          // 是自身残留或者无人使用
          resolve()
        } catch {
          resolve()
        }
      })
    })

    req.on('error', (err: NodeJS.ErrnoException) => {
      const code = err.code || ''
      if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT') {
        resolve()
      } else {
        reject(new Error(`网络错误（${code || err.message}），请检查网络后重试`))
      }
    })

    req.setTimeout(10000, () => {
      req.destroy()
      // 超时视为无人占用（可能是 Cloudflare 还没路由过去）
      resolve()
    })
  })
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isProcessAlive(): boolean {
  if (!tunnelProcess) return false
  try {
    if (tunnelProcess.pid) process.kill(tunnelProcess.pid, 0)
    return true
  } catch {
    return false
  }
}

function killTunnelProcess(): void {
  if (tunnelProcess) {
    tunnelProcess.kill()
    tunnelProcess = null
  }
  if (tunnelPid) {
    try { process.kill(tunnelPid) } catch {}
    tunnelPid = null
  }
  if (process.platform === 'win32') {
    try { execSync('taskkill /IM cloudflared-run.exe /F', { stdio: 'ignore' }) } catch {}
    try { execSync('taskkill /IM cloudflared-run2.exe /F', { stdio: 'ignore' }) } catch {}
    try { execSync('taskkill /IM cloudflared-run3.exe /F', { stdio: 'ignore' }) } catch {}
  }
}

function startHeartbeat(): void {
  stopHeartbeat()
  heartbeatTimer = setInterval(() => {
    if (currentStatus !== 'connected') return
    if (!isProcessAlive()) {
      console.log('[Tunnel] 心跳检测到进程已退出，尝试自动重连...')
      tunnelProcess = null
      tunnelPid = null
      stopHeartbeat()
      attemptRestart()
    }
  }, 15000)
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

async function attemptRestart(): Promise<void> {
  const now = Date.now()
  // 重置计数窗口
  if (now - restartWindowStart > RESTART_WINDOW_MS) {
    restartCount = 0
    restartWindowStart = now
  }

  if (restartCount >= MAX_RESTARTS) {
    setStatus('error', `隧道进程反复崩溃（${MAX_RESTARTS}次），已停止自动重连。请手动重新连接`)
    return
  }

  restartCount++
  console.log(`[Tunnel] 自动重连 (${restartCount}/${MAX_RESTARTS})...`)
  setStatus('connecting')

  await delay(3000)

  try {
    await spawnTunnelProcess()
    startHeartbeat()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Tunnel] 自动重连失败:', msg)
    setStatus('error', `自动重连失败: ${msg}`)
  }
}

async function spawnTunnelProcess(): Promise<void> {
  const cloudflaredPath = getCloudflaredPath()
  if (!fs.existsSync(cloudflaredPath)) {
    const ok = await ensureCloudflared()
    if (!ok) throw new Error('cloudflared.exe 下载失败')
  }

  const configPath = generateConfig(currentPort)
  let runnablePath: string
  try {
    runnablePath = prepareRunnableCopy(cloudflaredPath)
  } catch (err) {
    throw new Error(`无法准备 cloudflared 副本: ${err instanceof Error ? err.message : err}`)
  }

  await new Promise<void>((resolve, reject) => {
    tunnelProcess = spawn(runnablePath, ['tunnel', '--config', configPath, 'run', '--protocol', 'quic'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    tunnelPid = tunnelProcess.pid ?? null

    let hasConnected = false
    const timeout = setTimeout(() => {
      if (!hasConnected) {
        if (tunnelProcess) { tunnelProcess.kill(); tunnelProcess = null }
        tunnelPid = null
        reject(new Error('隧道连接超时（60秒）'))
      }
    }, 60000)

    const onData = (data: Buffer) => {
      const text = data.toString()
      console.log('[Tunnel]', text.trim().slice(0, 200))
      if (!hasConnected && text.includes('Registered tunnel connection')) {
        hasConnected = true
        clearTimeout(timeout)
        setStatus('connected')
        resolve()
      }
    }

    tunnelProcess.stdout?.on('data', onData)
    tunnelProcess.stderr?.on('data', onData)

    tunnelProcess.on('error', (err) => {
      clearTimeout(timeout)
      tunnelProcess = null
      tunnelPid = null
      if (!hasConnected) reject(err)
    })

    tunnelProcess.on('exit', (code) => {
      clearTimeout(timeout)
      const proc = tunnelProcess
      tunnelProcess = null
      tunnelPid = null
      if (!hasConnected) {
        reject(new Error(code ? `隧道进程退出 (code=${code})` : '隧道进程意外退出'))
      } else if (proc) {
        // 已连接后退出 → 心跳会检测到并触发重连
        console.log(`[Tunnel] 进程退出 code=${code}，等待心跳触发重连`)
      }
    })
  })
}

export async function startTunnel(port: number): Promise<void> {
  killTunnelProcess()
  stopHeartbeat()
  await delay(2000)

  currentPort = port
  restartCount = 0
  restartWindowStart = Date.now()
  setStatus('connecting')

  // 简单冲突检测
  try {
    await checkTunnelConflict()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setStatus('error', msg)
    throw err
  }

  // 凭据检查
  const certSrc = getSourceCredentialPath('cert.pem')
  const credSrc = getSourceCredentialPath('credentials.json')
  if (!fs.existsSync(certSrc) || !fs.existsSync(credSrc)) {
    const err = '隧道凭证文件缺失，请重新安装'
    setStatus('error', err)
    throw new Error(err)
  }

  // 启动进程（最多重试2次）
  let lastError: Error | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      console.log(`[Tunnel] 第${attempt + 1}次重试...`)
      await delay(3000)
    }
    try {
      await spawnTunnelProcess()
      startHeartbeat()
      console.log('[Tunnel] 隧道已连接，公网地址:', PERMANENT_URL)
      return
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.log(`[Tunnel] 第${attempt + 1}次尝试失败:`, lastError.message)
      killTunnelProcess()
      // 冲突类错误不重试
      if (lastError.message.includes('占用') || lastError.message.includes('正在使用')) {
        break
      }
    }
  }

  const finalMsg = lastError?.message || '隧道连接失败'
  setStatus('error', finalMsg)
  throw lastError || new Error(finalMsg)
}

export function stopTunnel(): void {
  stopHeartbeat()
  killTunnelProcess()
  restartCount = MAX_RESTARTS // 阻止自动重连
  setStatus('stopped')
}

export function getTunnelStatus(): TunnelState {
  if (currentStatus === 'connected' && !isProcessAlive()) {
    currentStatus = 'stopped'
    currentError = '隧道进程已退出'
    tunnelProcess = null
    tunnelPid = null
    stopHeartbeat()
  }
  return { status: currentStatus, url: PERMANENT_URL, error: currentError || undefined }
}

export function onTunnelStatusChange(callback: (state: TunnelState) => void): void {
  statusCallbacks.push(callback)
}
