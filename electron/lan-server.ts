import http from 'http'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { exec } from 'child_process'
import { queryAll, queryOne, executeRun, executeTransaction, execSQL } from './database/query-helpers'
import { saveDatabase, requireDatabase } from './database/connection'

type Notifier = (notification: {
  notificationId: string
  title: string
  message: string
  mode?: 'fullscreen' | 'top'
  duration?: number
  images?: string[]
  urgency?: '普通' | '重要' | '紧急'
  confirmMode?: 'none' | 'any' | 'specific'
  confirmStudents?: string[]
  lanPort?: number
}) => void

let server: http.Server | null = null
let serverPort = 3456
let notifyRenderer: Notifier | null = null
let deviceName = ''

// 持久化设备名称
function getDeviceNameFile(): string {
  return path.join(app.getPath('userData'), 'device-name.txt')
}

function loadDeviceName(): string {
  try {
    const file = getDeviceNameFile()
    if (fs.existsSync(file)) {
      return fs.readFileSync(file, 'utf-8').trim()
    }
  } catch { /* ignore */ }
  return ''
}

function saveDeviceNameFile(name: string): void {
  try {
    fs.writeFileSync(getDeviceNameFile(), name.trim(), 'utf-8')
  } catch { /* ignore */ }
}

// 启动时加载
deviceName = loadDeviceName()

export function setDeviceName(name: string): void {
  deviceName = name.trim()
  saveDeviceNameFile(name.trim())
}

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
        // 确保 message_board 表结构兼容（image 列）
        try {
          const db = requireDatabase()
          // 检查 image 列是否存在
          const cols = db.exec('PRAGMA table_info(message_board)')
          const hasImage = cols?.[0]?.values?.some((row: unknown[]) => row[1] === 'image')
          if (!hasImage) {
            db.exec('ALTER TABLE message_board ADD COLUMN image TEXT')
            saveDatabase()
            console.log('[LAN] 已添加 message_board.image 列')
          }
        } catch (e) {
          console.error('[LAN] 表结构检查/修复失败:', e)
        }
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
    console.error('[LAN API error]', msg)
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

    const notificationId = randomUUID()
    const confirmMode = (body.confirmMode === 'any' || body.confirmMode === 'specific') ? body.confirmMode : 'none'
    const confirmStudents: string[] = Array.isArray(body.confirmStudents) && confirmMode === 'specific'
      ? (body.confirmStudents as string[]).filter((s: unknown) => typeof s === 'string')
      : []
    const imageJson = images && images.length > 0 ? JSON.stringify(images) : null

    // 确保表存在
    executeRun(
      `CREATE TABLE IF NOT EXISTS notification_history (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL,
        mode TEXT DEFAULT 'fullscreen', duration INTEGER DEFAULT 30, image TEXT,
        urgency TEXT DEFAULT '普通', confirm_mode TEXT DEFAULT 'none',
        confirm_students TEXT DEFAULT '[]', created_at INTEGER
      )`
    )

    executeRun(
      `INSERT INTO notification_history (id, title, message, mode, duration, image, urgency, confirm_mode, confirm_students, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [notificationId, '', message, mode, duration ?? 30, imageJson, urgency, confirmMode, JSON.stringify(confirmStudents), Date.now()]
    )
    saveDatabase()

    if (notifyRenderer) {
      notifyRenderer({
        notificationId, title: '', message, mode, duration, images: images || [],
        urgency, confirmMode, confirmStudents, lanPort: serverPort,
      })
      sendJSON(res, { success: true, delivered: true, notificationId })
    } else {
      sendJSON(res, { success: true, delivered: false, notificationId, note: '通知接收端未就绪' })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sendJSON(res, { success: false, error: msg }, 500)
  }
}

async function handleStudents(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const students = queryAll('SELECT id, name FROM students ORDER BY name ASC')
    sendJSON(res, { success: true, data: students })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sendJSON(res, { success: false, error: msg }, 500)
  }
}

async function handleNotifyConfirm(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const body = await parseBody(req)
    const notificationId = String(body.notification_id || '')
    const studentName = String(body.student_name || '').trim()
    if (!notificationId || !studentName) {
      sendJSON(res, { success: false, error: '参数不完整' }, 400)
      return
    }

    // 确保 reads 表存在
    executeRun(
      `CREATE TABLE IF NOT EXISTS notification_reads (
        id TEXT PRIMARY KEY, notification_id TEXT NOT NULL,
        student_name TEXT NOT NULL, read_at INTEGER NOT NULL
      )`
    )

    // 检查通知是否存在及确认模式
    const rows = queryAll(
      'SELECT confirm_mode, confirm_students FROM notification_history WHERE id = ?',
      [notificationId]
    ) as { confirm_mode: string; confirm_students: string }[]
    if (rows.length === 0) {
      sendJSON(res, { success: false, message: '通知不存在' })
      return
    }

    const { confirm_mode, confirm_students } = rows[0]
    if (confirm_mode === 'none') {
      sendJSON(res, { success: false, message: '此通知无需确认' })
      return
    }

    if (confirm_mode === 'specific') {
      let allowed: string[] = []
      try { allowed = JSON.parse(confirm_students || '[]') } catch { /* keep empty */ }
      if (allowed.length > 0 && !allowed.includes(studentName)) {
        sendJSON(res, { success: false, message: '你不在确认名单中' })
        return
      }
    }

    // 检查是否已确认
    const existing = queryAll(
      'SELECT id FROM notification_reads WHERE notification_id = ? AND student_name = ?',
      [notificationId, studentName]
    ) as { id: string }[]
    if (existing.length > 0) {
      sendJSON(res, { success: false, message: '你已经确认过了' })
      return
    }

    executeRun(
      'INSERT INTO notification_reads (id, notification_id, student_name, read_at) VALUES (?, ?, ?, ?)',
      [randomUUID(), notificationId, studentName, Date.now()]
    )
    saveDatabase()
    sendJSON(res, { success: true, message: '确认成功' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sendJSON(res, { success: false, error: msg }, 500)
  }
}

async function handleNotifyReads(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url || '/', `http://localhost:${serverPort}`)
    const notificationId = url.searchParams.get('notification_id') || ''
    if (!notificationId) {
      sendJSON(res, { success: false, error: '缺少 notification_id' }, 400)
      return
    }
    const reads = queryAll(
      'SELECT * FROM notification_reads WHERE notification_id = ? ORDER BY read_at ASC',
      [notificationId]
    )
    sendJSON(res, { success: true, data: reads })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sendJSON(res, { success: false, error: msg }, 500)
  }
}

async function handleMessages(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const method = (req.method || 'GET').toUpperCase()

  if (method === 'GET') {
    try {
      const messages = queryAll(
        `SELECT * FROM message_board
         WHERE expires_at IS NULL OR expires_at > ?
         ORDER BY created_at DESC`,
        [Date.now()]
      )
      sendJSON(res, { success: true, data: messages })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      sendJSON(res, { success: false, error: msg }, 500)
    }
    return
  }

  if (method === 'POST') {
    try {
      const body = await parseBody(req)
      const studentName = String(body.student_name || '').trim()
      const content = String(body.content || '').trim()
      if (!studentName || !content) {
        sendJSON(res, { success: false, error: '学生姓名和内容不能为空' }, 400)
        return
      }
      const tag = (['建议', '感谢', '心愿', '其他'].includes(String(body.tag)) ? String(body.tag) : '其他')
      const expiresAt = typeof body.expires_at === 'number' && body.expires_at > 0 ? body.expires_at : null
      const image = typeof body.image === 'string' && body.image.length > 0 ? body.image : null

      executeRun(
        `CREATE TABLE IF NOT EXISTS message_board (
          id TEXT PRIMARY KEY, student_name TEXT NOT NULL, content TEXT NOT NULL,
          tag TEXT DEFAULT '其他', expires_at INTEGER, created_at INTEGER NOT NULL, image TEXT
        )`
      )

      try { executeRun("ALTER TABLE message_board ADD COLUMN image TEXT", []); } catch (_) { /* 列已存在 */ }

      const id = randomUUID()
      executeRun(
        `INSERT INTO message_board (id, student_name, content, tag, expires_at, created_at, image)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, studentName, content, tag, expiresAt, Date.now(), image]
      )
      saveDatabase()
      sendJSON(res, { success: true, data: { id } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      sendJSON(res, { success: false, error: msg }, 500)
    }
    return
  }

  if (method === 'DELETE') {
    try {
      const url = new URL(req.url || '/', `http://localhost:${serverPort}`)
      const id = url.searchParams.get('id') || ''
      if (!id) {
        sendJSON(res, { success: false, error: '缺少 id' }, 400)
        return
      }
      executeRun('DELETE FROM message_board WHERE id = ?', [id])
      saveDatabase()
      sendJSON(res, { success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      sendJSON(res, { success: false, error: msg }, 500)
    }
    return
  }

  sendJSON(res, { success: false, error: 'Method not allowed' }, 405)
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

    isDevMode = devMode ?? !distExists()
    if (isDevMode) updateDevUrl()

    const MAX_RETRIES = 20
    let currentPort = port

    // 注册 Windows 防火墙入站规则（仅对首个端口添加）
    addFirewallRule(port)

    function tryListen(): void {
      if (currentPort >= port + MAX_RETRIES) {
        reject(new Error(`端口 ${port}-${port + MAX_RETRIES - 1} 均被占用，无法启动 LAN 服务器`))
        return
      }

      const srv = http.createServer((req, res) => {
        res.on('error', (err) => { console.error('[LAN] response error:', err.message) })
        req.on('error', (err) => { console.error('[LAN] request error:', err.message) })

        const url = req.url || '/'
        const method = (req.method || 'GET').toUpperCase()

        console.log(`[LAN] ${method} ${url}`)

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

        if (url === '/api/students') {
          if (method === 'GET') {
            handleStudents(req, res)
          } else {
            sendJSON(res, { success: false, error: 'Method not allowed' }, 405)
          }
          return
        }

        if (url === '/api/notify/confirm') {
          if (method === 'POST') {
            handleNotifyConfirm(req, res)
          } else {
            sendJSON(res, { success: false, error: 'Method not allowed' }, 405)
          }
          return
        }

        if (url.startsWith('/api/notify/reads')) {
          if (method === 'GET') {
            handleNotifyReads(req, res)
          } else {
            sendJSON(res, { success: false, error: 'Method not allowed' }, 405)
          }
          return
        }

        if (url === '/api/messages' || url.startsWith('/api/messages?')) {
          handleMessages(req, res)
          return
        }

        if (url === '/api/health') {
          sendJSON(res, { status: 'ok', uptime: process.uptime(), hostname: os.hostname(), deviceName: deviceName || undefined })
          return
        }

        // 设备名称读写
        if (url === '/api/device-name') {
          if (method === 'POST') {
            parseBody(req).then(body => {
              const name = String(body.deviceName || '').trim()
              if (name) {
                setDeviceName(name)
                sendJSON(res, { success: true, deviceName: name })
              } else {
                sendJSON(res, { success: false, error: '设备名称不能为空' }, 400)
              }
            }).catch(err => sendJSON(res, { success: false, error: String(err) }, 400))
          } else {
            sendJSON(res, { success: true, deviceName })
          }
          return
        }

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

      // WebSocket 代理（转发到 Vite HMR）
      srv.on('upgrade', (req, socket, head) => {
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
      })

      let started = false

      srv.on('error', (err: NodeJS.ErrnoException) => {
        if (started) {
          // 启动后的运行时错误：记录日志并清理
          console.error('[LAN] server error:', err.message)
          server = null
          return
        }
        if (err.code === 'EADDRINUSE') {
          console.log(`[LAN] 端口 ${currentPort} 被占用，尝试 ${currentPort + 1}...`)
          currentPort++
          tryListen()
        } else {
          console.error('[LAN] server error:', err.message)
          reject(err)
        }
      })

      srv.on('clientError', (err, socket) => {
        console.error('[LAN] client error:', err.message)
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
      })

      srv.listen(currentPort, '0.0.0.0', () => {
        started = true
        serverPort = currentPort
        server = srv
        const ip = getLanIP()
        console.log(`[LAN] 服务器已启动 http://${ip}:${currentPort} (${isDevMode ? 'dev代理模式' : '生产模式'})`)
        resolve({ ip, port: currentPort })
      })
    }

    tryListen()
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
