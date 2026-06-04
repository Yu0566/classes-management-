import http from 'http'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { queryAll, queryOne, executeRun, executeTransaction } from './database/query-helpers'

type Notifier = (notification: { title: string; message: string; mode?: 'fullscreen' | 'top'; duration?: number; images?: string[]; urgency?: '普通' | '重要' | '紧急' }) => void

let server: http.Server | null = null
let serverPort = 3456
let notifyRenderer: Notifier | null = null

export function setNotifier(fn: Notifier): void {
  notifyRenderer = fn
}

export function getLanIP(): string {
  const interfaces = os.networkInterfaces()
  const candidates: { addr: string; name: string; priority: number }[] = []

  for (const name of Object.keys(interfaces)) {
    // 跳过虚拟/容器网桥
    const lname = name.toLowerCase()
    if (lname.startsWith('docker') || lname.startsWith('br-') || lname.startsWith('veth') ||
        lname.startsWith('vmnet') || lname.startsWith('vbox') || lname.includes('virtual') ||
        lname.startsWith('hyper-v') || lname.startsWith('wsl')) {
      continue
    }
    for (const info of interfaces[name] || []) {
      if (info.family !== 'IPv4' || info.internal) continue
      const addr = info.address
      // 跳过 APIPA 自动私有地址（无法跨机通信）
      if (addr.startsWith('169.254.')) continue
      // 局域网地址优先
      const priority = addr.startsWith('192.168.') ? 3 :
                       addr.startsWith('10.') ? 2 :
                       addr.startsWith('172.') && parseInt(addr.split('.')[1]) >= 16 && parseInt(addr.split('.')[1]) <= 31 ? 1 :
                       0
      if (priority > 0 || addr !== '127.0.0.1') {
        candidates.push({ addr, name, priority })
      }
    }
  }

  // 按优先级降序：192.168.x.x > 10.x.x.x > 其他
  candidates.sort((a, b) => b.priority - a.priority)
  if (candidates.length > 0) return candidates[0].addr

  return '127.0.0.1'
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

let isDevMode = false
let VITE_DEV_URL = 'http://localhost:5173'

function updateDevUrl() {
  try {
    const portFile = path.join(process.cwd(), '.vite-tmp', 'port')
    if (fs.existsSync(portFile)) {
      const port = parseInt(fs.readFileSync(portFile, 'utf-8').trim(), 10) || 5173
      VITE_DEV_URL = `http://localhost:${port}`
    }
  } catch { /* keep default */ }
}

function getDistPath(): string {
  return path.join(__dirname, '../dist')
}

function distExists(): boolean {
  const distPath = getDistPath()
  const indexPath = path.join(distPath, 'index.html')
  try {
    fs.accessSync(indexPath)
    console.log('[LAN] 检测到生产构建:', indexPath)
    return true
  } catch {
    console.log('[LAN] 未找到生产构建:', indexPath, '，使用 dev 代理模式')
    return false
  }
}

function proxyToVite(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url || '/'
  const targetUrl = VITE_DEV_URL + url

  console.log('[LAN] proxy', req.method, url)

  const proxyReq = http.get(targetUrl, (proxyRes) => {
    const headers: Record<string, string | string[] | number> = {}
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      const lk = key.toLowerCase()
      if (!['transfer-encoding', 'connection', 'keep-alive'].includes(lk) && value !== undefined) {
        headers[key] = value
      }
    }
    res.writeHead(proxyRes.statusCode || 200, headers)
    proxyRes.on('error', (err) => { console.error('[LAN] proxy response error:', err.message); res.destroy() })
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    console.error('[LAN] proxy error for', url, ':', err.message)
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Vite 开发服务器未响应: ' + err.message)
  })
}

function serveStatic(res: http.ServerResponse, urlPath: string): void {
  const distPath = getDistPath()
  const cleanPath = urlPath.split('?')[0]
  let filePath = path.join(distPath, cleanPath === '/' ? 'index.html' : cleanPath)

  if (!filePath.startsWith(distPath)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  const ext = path.extname(filePath).toLowerCase()
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream'

  try {
    const content = fs.readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': mimeType })
    res.end(content)
  } catch {
    try {
      const indexPath = path.join(distPath, 'index.html')
      const indexContent = fs.readFileSync(indexPath)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(indexContent)
    } catch {
      res.writeHead(404)
      res.end('Not Found')
    }
  }
}

function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function sendJSON(res: http.ServerResponse, data: Record<string, unknown>, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

async function handleAPI(req: http.IncomingMessage, res: http.ServerResponse, endpoint: string): Promise<void> {
  try {
    const body = await parseBody(req)

    switch (endpoint) {
      case 'query': {
        const result = queryAll(body.sql as string, (body.params as unknown[]) || [])
        sendJSON(res, { success: true, data: result })
        break
      }
      case 'get': {
        const result = queryOne(body.sql as string, (body.params as unknown[]) || [])
        sendJSON(res, { success: true, data: result })
        break
      }
      case 'run': {
        const result = executeRun(body.sql as string, (body.params as unknown[]) || [])
        sendJSON(res, { success: true, changes: result.changes })
        break
      }
      case 'transaction': {
        executeTransaction((body.operations as { sql: string; params?: unknown[] }[]) || [])
        sendJSON(res, { success: true })
        break
      }
      default:
        sendJSON(res, { success: false, error: `Unknown endpoint: ${endpoint}` }, 404)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sendJSON(res, { success: false, error: msg }, 500)
  }
}

async function handleNotify(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const body = await parseBody(req)
    const message = String(body.message || '').trim()
    const mode = (body.mode === 'top' ? 'top' : 'fullscreen') as 'fullscreen' | 'top'
    const duration = typeof body.duration === 'number' && (body.duration === 0 || (body.duration >= 3 && body.duration <= 300))
      ? body.duration : undefined
    let images: string[] | undefined
    if (Array.isArray(body.images)) {
      images = body.images.filter((img: unknown) => typeof img === 'string' && (img as string).startsWith('data:image/'))
      if (images.length === 0) images = undefined
    } else if (typeof body.image === 'string' && body.image.startsWith('data:image/')) {
      images = [body.image]
    }
    const urgency = (body.urgency === '重要' || body.urgency === '紧急') ? body.urgency : '普通'
    if (!message) {
      sendJSON(res, { success: false, error: '内容不能为空' }, 400)
      return
    }
    if (notifyRenderer) {
      notifyRenderer({ title: '', message, mode, duration, images, urgency })
      sendJSON(res, { success: true, delivered: true })
    } else {
      sendJSON(res, { success: true, delivered: false, note: '通知接收端未就绪' })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sendJSON(res, { success: false, error: msg }, 500)
  }
}

function addFirewallRule(port: number): void {
  if (process.platform !== 'win32') return
  const ruleName = '课堂管理系统 LAN'
  const cmd = `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${port}`
  exec(cmd, (err, stdout) => {
    if (err) {
      console.log('[LAN] 防火墙规则添加失败（可能已存在或权限不足）:', err.message)
    } else {
      console.log('[LAN] 防火墙规则已确保存在')
    }
  })
}

export function startServer(port: number, devMode?: boolean): Promise<{ ip: string; port: number }> {
  return new Promise((resolve, reject) => {
    if (server) {
      reject(new Error('服务器已在运行中'))
      return
    }

    serverPort = port
    isDevMode = devMode ?? !distExists()
    if (isDevMode) updateDevUrl()

    // 注册 Windows 防火墙入站规则
    addFirewallRule(port)

    // WebSocket 代理（转发到 Vite HMR）
    function handleUpgrade(req: http.IncomingMessage, socket: import('stream').Duplex, head: Buffer) {
      if (!isDevMode) {
        socket.destroy()
        return
      }
      const targetUrl = new URL(VITE_DEV_URL)
      const proxyReq = http.request({
        hostname: targetUrl.hostname,
        port: targetUrl.port,
        path: req.url,
        method: req.method || 'GET',
        headers: { ...req.headers, host: targetUrl.host },
      })
      proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
        const resHeaders = Object.entries(proxyRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n')
        socket.write(`HTTP/1.1 101 Switching Protocols\r\n${resHeaders}\r\n\r\n`)
        if (proxyHead.length > 0) socket.write(proxyHead)
        proxySocket.pipe(socket)
        socket.pipe(proxySocket)
      })
      proxyReq.on('error', (err) => {
        console.error('[LAN] WS proxy error:', err.message)
        socket.destroy()
      })
      socket.on('error', () => proxyReq.destroy())
      proxyReq.end()
    }

    server = http.createServer((req, res) => {
      // 防止客户端断开连接导致进程崩溃
      res.on('error', (err) => { console.error('[LAN] response error:', err.message) })
      req.on('error', (err) => { console.error('[LAN] request error:', err.message) })

      const url = req.url || '/'
      const method = (req.method || 'GET').toUpperCase()

      console.log(`[LAN] ${method} ${url}`)

      // API routes
      if (url.startsWith('/api/db/')) {
        const endpoint = url.replace('/api/db/', '')
        if (method === 'POST') {
          handleAPI(req, res, endpoint)
        } else {
          sendJSON(res, { success: false, error: 'Method not allowed' }, 405)
        }
        return
      }

      if (url === '/api/notify') {
        if (method === 'POST') {
          handleNotify(req, res)
        } else {
          sendJSON(res, { success: false, error: 'Method not allowed' }, 405)
        }
        return
      }

      // Static file serving or proxy
      if (method === 'GET') {
        if (isDevMode) {
          proxyToVite(req, res)
        } else {
          serveStatic(res, url)
        }
      } else {
        res.writeHead(405)
        res.end('Method not allowed')
      }
    })

    server.on('upgrade', (req, socket, head) => handleUpgrade(req, socket, head))

    server.on('error', (err: NodeJS.ErrnoException) => {
      server = null
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`端口 ${port} 已被占用，请更换端口`))
      } else {
        reject(err)
      }
    })

    // 处理客户端连接错误，防止进程崩溃
    server.on('clientError', (err, socket) => {
      console.error('[LAN] client error:', err.message)
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
    })

    server.listen(port, '0.0.0.0', () => {
      const ip = getLanIP()
      console.log(`[LAN] 服务器已启动 http://${ip}:${port} (${isDevMode ? 'dev代理模式' : '生产模式'})`)
      resolve({ ip, port })
    })
  })
}

export function stopServer(): void {
  if (server) {
    server.close()
    server = null
  }
}

export function getServerStatus(): { running: boolean; ip: string; port: number; mode: string } {
  return {
    running: server !== null,
    ip: getLanIP(),
    port: serverPort,
    mode: isDevMode ? 'dev代理模式' : '生产模式',
  }
}
