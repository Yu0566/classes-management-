import http from 'http'
import fs from 'fs'
import path from 'path'
import os from 'os'
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
  for (const name of Object.keys(interfaces)) {
    for (const info of interfaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) {
        return info.address
      }
    }
  }
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
  try {
    fs.accessSync(path.join(getDistPath(), 'index.html'))
    return true
  } catch {
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
    const title = String(body.title || '').trim()
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
    console.log('[LAN] handleNotify received body.urgency:', body.urgency, '→ parsed urgency:', urgency)
    if (!title || !message) {
      sendJSON(res, { success: false, error: '标题和内容不能为空' }, 400)
      return
    }
    if (notifyRenderer) {
      notifyRenderer({ title, message, mode, duration, images, urgency })
      sendJSON(res, { success: true, delivered: true })
    } else {
      sendJSON(res, { success: true, delivered: false, note: '通知接收端未就绪' })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sendJSON(res, { success: false, error: msg }, 500)
  }
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

    server = http.createServer((req, res) => {
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

    server.on('error', (err: NodeJS.ErrnoException) => {
      server = null
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`端口 ${port} 已被占用，请更换端口`))
      } else {
        reject(err)
      }
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

export function getServerStatus(): { running: boolean; ip: string; port: number } {
  return {
    running: server !== null,
    ip: getLanIP(),
    port: serverPort,
  }
}
