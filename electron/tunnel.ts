import { ChildProcess, spawn, execSync } from 'child_process'
import { app } from 'electron'
import https from 'https'
import os from 'os'
import path from 'path'
import fs from 'fs'

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

function getCloudflaredPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'cloudflared.exe')
  }
  return path.join(process.cwd(), 'cloudflared.exe')
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
    const req = https.get(`${PERMANENT_URL}/api/health`, { timeout: 5000 }, (res) => {
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => {
        try {
          const data = JSON.parse(body)
          if (data.hostname && data.hostname !== os.hostname()) {
            reject(new Error(`域名 ${PERMANENT_URL} 已被 "${data.hostname}" 占用，请先关闭那台电脑的隧道`))
            return
          }
          // hostname 相同 = 我们自己之前连的（残留），可以重新连接
          console.log('[Tunnel] 检测到自身残留连接，将重新连接')
          resolve()
        } catch { resolve() }
      })
    })
    req.on('error', (err) => {
      console.log('[Tunnel] 域名健康检查不通，视为空闲:', (err as any)?.code || err.message)
      resolve()
    })
    req.setTimeout(5000, () => { req.destroy(); resolve() })
  })
}

export async function startTunnel(port: number): Promise<void> {
  // 先清理可能残留的隧道进程
  stopTunnel()
  setStatus('connecting')

  // 先做冲突检测，等结果再决定是否启动
  try {
    await checkTunnelConflict()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setStatus('error', msg)
    throw err
  }

  const cloudflaredPath = getCloudflaredPath()
  if (!fs.existsSync(cloudflaredPath)) {
    const err = 'cloudflared.exe 未找到，请检查安装'
    setStatus('error', err)
    throw new Error(err)
  }

  const certSrc = getSourceCredentialPath('cert.pem')
  const credSrc = getSourceCredentialPath('credentials.json')
  if (!fs.existsSync(certSrc) || !fs.existsSync(credSrc)) {
    const err = '隧道凭证文件缺失，请重新安装'
    setStatus('error', err)
    throw new Error(err)
  }

  let configPath: string
  try {
    configPath = generateConfig(port)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setStatus('error', msg)
    throw new Error(msg)
  }

  return new Promise((resolve, reject) => {
    tunnelProcess = spawn(cloudflaredPath, ['tunnel', '--config', configPath, 'run', '--protocol', 'http2'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    tunnelPid = tunnelProcess.pid ?? null

    let hasConnected = false
    const timeout = setTimeout(() => {
      if (!hasConnected) {
        setStatus('error', '隧道连接超时（30秒），请检查网络')
        reject(new Error('Tunnel connection timeout'))
      }
    }, 30000)

    // cloudflared 在 Windows 上将日志打到 stderr，stdout 基本为空
    // 所以两个流用同一个 handler 监听
    const onData = (data: Buffer) => {
      const text = data.toString()
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
      let msg = err.message
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        msg = '未找到 cloudflared.exe，可能被杀毒软件拦截'
      }
      setStatus('error', msg)
      tunnelProcess = null
      tunnelPid = null
      if (!hasConnected) reject(new Error(msg))
    })

    tunnelProcess.on('exit', (code) => {
      clearTimeout(timeout)
      tunnelProcess = null
      tunnelPid = null
      if (hasConnected) {
        setStatus('stopped', code ? `隧道意外退出 (code=${code})` : undefined)
      } else {
        setStatus('error', `隧道启动失败 (code=${code})`)
      }
    })
  })
}

export function stopTunnel(): void {
  // 优先杀子进程
  if (tunnelProcess) {
    tunnelProcess.kill()
    tunnelProcess = null
  }
  // 也按 PID 杀一次，防止子进程引用丢失
  if (tunnelPid) {
    try { process.kill(tunnelPid) } catch { /* 已退出 */ }
    tunnelPid = null
  }
  // Windows 兜底：杀掉所有 cloudflared 残留进程
  if (process.platform === 'win32') {
    try {
      execSync('taskkill /IM cloudflared.exe /F', { stdio: 'ignore' })
    } catch { /* 没有残留进程时会报错，忽略 */ }
  }
  setStatus('stopped')
}

export function getTunnelStatus(): TunnelState {
  return { status: currentStatus, url: PERMANENT_URL, error: currentError || undefined }
}

export function onTunnelStatusChange(callback: (state: TunnelState) => void): void {
  statusCallbacks.push(callback)
}
