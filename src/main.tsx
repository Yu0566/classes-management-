import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

function isLanHttpMode(): boolean {
  if (window.electronAPI?.db) return false
  return window.location.protocol === 'http:' || window.location.protocol === 'https:'
}

const STANDALONE_PATHS = ['/punishment-signin', '/reflection-signin', '/dashboard-widget']

async function init() {
  if (STANDALONE_PATHS.includes(window.location.pathname)) {
    window.location.replace(`${window.location.origin}/#${window.location.pathname}`)
    return
  }

  if (window.electronAPI?.db) {
    // Electron IPC 模式（桌面端）
  } else if (isLanHttpMode()) {
    // LAN HTTP 模式（浏览器访问教室电脑）
    const { httpDB } = await import('./lib/http-db')
    const { setDBBackend } = await import('./lib/db')
    setDBBackend(httpDB)
  } else {
    // Capacitor / 本地浏览器环境：使用 sql.js 直接访问数据库
    const { initCapacitorDB, capacitorDB } = await import('./lib/sqljs-db')
    const { setDBBackend } = await import('./lib/db')
    await initCapacitorDB()
    setDBBackend(capacitorDB)
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>
  )
}

init()
