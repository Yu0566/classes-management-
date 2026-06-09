const { spawn } = require('child_process')
const https = require('https')
const os = require('os')
const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const URL_FILE = path.join(ROOT, '公网地址.txt')
const DESKTOP_URL_FILE = path.join(require('os').homedir(), 'Desktop', '公网地址.txt')
const PERMANENT_URL = 'https://classmanagement.top'
const MY_HOSTNAME = os.hostname()

function log(msg) {
  const ts = new Date().toLocaleTimeString('zh-CN')
  console.log(`[${ts}] ${msg}`)
}

function saveURL() {
  const content = `公网访问地址（永久不变）：\n${PERMANENT_URL}\n\n备用地址：https://class.classmanagement.top\n更新时间：${new Date().toLocaleString('zh-CN')}\n`
  fs.writeFileSync(URL_FILE, content, 'utf-8')
  try { fs.writeFileSync(DESKTOP_URL_FILE, content, 'utf-8') } catch {}
  console.log('')
  console.log('========================================')
  console.log('  永久地址: ' + PERMANENT_URL)
  console.log('  此地址永远不变！')
  console.log('========================================')
  console.log('')
}

let tunnel = null

// 1. 启动服务端
log('启动服务端...')
const server = spawn('node', ['dist-server/server/index.js'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
})

server.stdout.on('data', (data) => {
  process.stdout.write('[server] ' + data.toString())
})

server.stderr.on('data', (data) => {
  process.stderr.write('[server] ' + data.toString())
})

server.on('error', (err) => {
  log('服务端启动失败: ' + err.message)
  process.exit(1)
})

server.on('exit', (code) => {
  log('服务端已退出 (code=' + code + ')')
  process.exit(code || 0)
})

// 2. 等服务端就绪后，先做冲突检测，再启动命名隧道
setTimeout(() => {
  log('正在检测域名冲突...')

  const req = https.get(`${PERMANENT_URL}/api/health`, { timeout: 5000 }, (res) => {
    let body = ''
    res.on('data', (chunk) => { body += chunk.toString() })
    res.on('end', () => {
      try {
        const data = JSON.parse(body)
        if (data.hostname && data.hostname !== MY_HOSTNAME) {
          log(`域名 ${PERMANENT_URL} 已被 "${data.hostname}" 占用，请先关闭那台电脑的隧道`)
          server.kill()
          process.exit(1)
        }
        // hostname 相同 = 我们之前残留的隧道，继续
        startCloudflared()
      } catch { startCloudflared() }
    })
  })

  req.on('error', () => {
    // 不通 = 没人在用，正常启动
    startCloudflared()
  })

  req.setTimeout(5000, () => {
    req.destroy()
    startCloudflared()
  })

  function startCloudflared() {
    log('启动 Cloudflare 命名隧道...')

    const cloudflaredPath = path.join(ROOT, 'cloudflared.exe')
    tunnel = spawn(cloudflaredPath, ['tunnel', 'run', 'class-tunnel'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    tunnel.stdout.on('data', (data) => {
      process.stdout.write('[tunnel] ' + data.toString())
    })

    tunnel.stderr.on('data', (data) => {
      process.stderr.write('[tunnel] ' + data.toString())
    })

    tunnel.on('error', (err) => {
      log('隧道启动失败: ' + err.message)
    })

    tunnel.on('exit', (code) => {
      log('隧道已退出 (code=' + code + ')')
      server.kill()
    })

    // 等服务端和隧道都就绪后保存地址
    setTimeout(() => { saveURL() }, 5000)
  }
}, 3000)

function cleanup() {
  log('正在关闭...')
  if (tunnel) tunnel.kill()
  server.kill()
}

process.on('SIGINT', () => {
  cleanup()
  process.exit(0)
})

process.on('SIGTERM', () => {
  cleanup()
  process.exit(0)
})
