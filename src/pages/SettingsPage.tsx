import { useState, useEffect, useCallback } from 'react'
import { Database, Download, HardDrive, RefreshCw, Wifi, Copy, Check, ExternalLink, Loader2, DownloadCloud, FileDown, Globe } from 'lucide-react'
import DataImportPage from './DataImportPage'
import { queryAll } from '../lib/db'


type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'not-available'

interface UpdateInfo {
  version?: string
  releaseNotes?: string
  releaseDate?: string
}

interface DownloadProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export default function SettingsPage() {
  const [tab, setTab] = useState<'import' | 'backup' | 'export' | 'lan' | 'about'>('import')

  // LAN 访问状态
  const [lanRunning, setLanRunning] = useState(false)
  const [lanIP, setLanIP] = useState('')
  const [lanMode, setLanMode] = useState('')
  const LAN_PORT = 3456
  const [lanCopied, setLanCopied] = useState(false)
  const [lanError, setLanError] = useState('')
  const [lanLoading, setLanLoading] = useState(false)
  const [autoStart, setAutoStart] = useState(() => {
    return localStorage.getItem('lan_auto_start') === 'true'
  })
  // Tunnel 状态
  const [tunnelStatus, setTunnelStatus] = useState<string>('stopped')
  const [tunnelError, setTunnelError] = useState('')
  const [tunnelLoading, setTunnelLoading] = useState(false)
  const [tunnelUrlCopied, setTunnelUrlCopied] = useState(false)
  const [tunnelAutoStart, setTunnelAutoStart] = useState(() => {
    return localStorage.getItem('tunnel_auto_start') !== 'false'
  })

  const isElectron = !!window.electronAPI
  const hasLanAPI = !!(window.electronAPI?.lan)
  const hasTunnelAPI = !!(window.electronAPI?.tunnel)

  // 更新状态
  const [appVersion, setAppVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [updateError, setUpdateError] = useState('')

  // 数据导出
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (isElectron && hasLanAPI) {
      window.electronAPI!.lan.getStatus().then(s => {
        setLanRunning(s.running)
        setLanIP(s.ip)
        setLanMode(s.mode || '')
        // 自动启动：如果未运行且开启了自启
        if (!s.running && localStorage.getItem('lan_auto_start') === 'true') {
          window.electronAPI!.lan.start(LAN_PORT).then(r => {
            if (r.success) {
              setLanRunning(true)
              setLanIP(r.ip || '')
            }
          }).catch(err => console.error('[LAN] 自动启动失败:', err))
        }
      }).catch(err => console.error('[LAN] 获取状态失败:', err))
    }
    if (isElectron && window.electronAPI!.app) {
      window.electronAPI!.app.getVersion().then(v => setAppVersion(v)).catch(() => {})

      // 监听自动更新事件
      const unsubs: (() => void)[] = []
      unsubs.push(window.electronAPI!.app.onUpdateChecking(() => {
        setUpdateStatus('checking')
        setUpdateError('')
      }))
      unsubs.push(window.electronAPI!.app.onUpdateAvailable((info) => {
        setUpdateStatus('available')
        setUpdateInfo(info)
      }))
      unsubs.push(window.electronAPI!.app.onUpdateNotAvailable((info) => {
        setUpdateStatus('not-available')
        setUpdateInfo(info)
      }))
      unsubs.push(window.electronAPI!.app.onDownloadProgress((progress) => {
        setUpdateStatus('downloading')
        setDownloadProgress(progress)
      }))
      unsubs.push(window.electronAPI!.app.onUpdateDownloaded((info) => {
        setUpdateStatus('downloaded')
        setUpdateInfo(info)
      }))
      unsubs.push(window.electronAPI!.app.onUpdateError((error) => {
        setUpdateStatus('error')
        setUpdateError(error)
      }))
      return () => unsubs.forEach(fn => fn())
    }
  }, [isElectron, hasLanAPI])

  useEffect(() => {
    localStorage.setItem('lan_auto_start', String(autoStart))
  }, [autoStart])

  useEffect(() => {
    localStorage.setItem('tunnel_auto_start', String(tunnelAutoStart))
  }, [tunnelAutoStart])

  // Tunnel 状态订阅 + 自动启动
  useEffect(() => {
    if (!isElectron || !hasTunnelAPI) return
    window.electronAPI!.tunnel.getStatus().then(s => {
      setTunnelStatus(s.status)
      if (s.error) setTunnelError(s.error)
    })
    const unsubscribe = window.electronAPI!.tunnel.onStatusChange((state) => {
      setTunnelStatus(state.status)
      if (state.error) setTunnelError(state.error)
      else setTunnelError('')
    })
    return unsubscribe
  }, [isElectron, hasTunnelAPI])

  // Tunnel 自动启动：检测到 LAN 启动且 tunnel 未运行且开启自启
  useEffect(() => {
    if (!isElectron || !hasTunnelAPI || !lanRunning) return
    if (tunnelStatus === 'stopped' && tunnelAutoStart) {
      window.electronAPI!.tunnel.start(LAN_PORT).then(r => {
        if (!r.success) setTunnelError(r.error || '启动失败')
      }).catch(() => {}).finally(() => setTunnelLoading(false))
    }
  }, [lanRunning, tunnelAutoStart])

  const handleLanToggle = useCallback(async () => {
    if (!window.electronAPI?.lan) {
      setLanError('LAN 功能不可用，请重启应用后再试')
      return
    }
    setLanError('')
    setLanLoading(true)
    try {
      if (lanRunning) {
        await window.electronAPI.lan.stop()
        setLanRunning(false)
      } else {
        const result = await window.electronAPI.lan.start(LAN_PORT)
        if (result.success) {
          setLanRunning(true)
          setLanIP(result.ip || '')
          // 获取模式
          window.electronAPI!.lan.getStatus().then(s => setLanMode(s.mode || '')).catch(() => {})
        } else {
          setLanError(result.error || '启动失败')
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[LAN] 操作失败:', err)
      setLanError(msg || '操作失败，请查看控制台')
    } finally {
      setLanLoading(false)
    }
  }, [lanRunning])

  const handleCopyUrl = useCallback(() => {
    navigator.clipboard.writeText(`http://${lanIP}:${LAN_PORT}`)
    setLanCopied(true)
    setTimeout(() => setLanCopied(false), 2000)
  }, [lanIP])

  const handleTunnelToggle = useCallback(async () => {
    if (!window.electronAPI?.tunnel) return
    setTunnelError('')
    setTunnelLoading(true)
    try {
      if (tunnelStatus === 'connected' || tunnelStatus === 'connecting') {
        await window.electronAPI.tunnel.stop()
      } else {
        const result = await window.electronAPI.tunnel.start(LAN_PORT)
        if (!result.success) setTunnelError(result.error || '启动失败')
      }
    } catch (err) {
      setTunnelError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setTunnelLoading(false)
    }
  }, [tunnelStatus])

  const handleCopyTunnelUrl = useCallback(() => {
    navigator.clipboard.writeText('https://classmanagement.top')
    setTunnelUrlCopied(true)
    setTimeout(() => setTunnelUrlCopied(false), 2000)
  }, [])

  const handleCheckUpdate = useCallback(async () => {
    if (!window.electronAPI?.app) return
    setUpdateStatus('checking')
    setUpdateError('')
    try {
      await window.electronAPI.app.checkUpdate()
    } catch {
      setUpdateStatus('error')
      setUpdateError('检查更新失败')
    }
  }, [])

  const handleDownloadUpdate = useCallback(async () => {
    if (!window.electronAPI?.app) return
    try {
      await window.electronAPI.app.downloadUpdate()
    } catch {
      setUpdateStatus('error')
      setUpdateError('下载更新失败')
    }
  }, [])

  const handleQuitAndInstall = useCallback(() => {
    if (!window.electronAPI?.app) return
    window.electronAPI.app.quitAndInstall()
  }, [])

  const handleExportData = useCallback(async () => {
    setExporting(true)
    try {
      const [groups, students] = await Promise.all([
        queryAll('SELECT id, name, leader_name, color, sort_order FROM groups ORDER BY sort_order'),
        queryAll('SELECT id, name, group_id, practice_label, lunch_label, lunch_longterm, seat_order, sort_order FROM students ORDER BY sort_order'),
      ])

      const SEAT_LABELS = ['左前', '左中', '左后', '左后二', '右后二', '右后', '右前']

      // 按小组整理座位表
      const seatingChart: Record<string, { group_name: string; seats: Record<string, string> }> = {}
      for (const g of groups as any[]) {
        const groupStudents = (students as any[]).filter((s: any) => s.group_id === g.id && (s.seat_order ?? -1) >= 0)
        if (groupStudents.length > 0) {
          const seats: Record<string, string> = {}
          for (const s of groupStudents) {
            const pos = s.seat_order ?? -1
            seats[SEAT_LABELS[pos] || `位置${pos}`] = s.name
          }
          seatingChart[g.id] = { group_name: g.name, seats }
        }
      }

      const exportData = {
        version: 4,
        exportedAt: new Date().toISOString(),
        groups: groups.map((g: any) => ({
          id: g.id,
          name: g.name,
          leader_name: g.leader_name || '',
          color: g.color,
          sort_order: g.sort_order,
        })),
        students: students.map((s: any) => ({
          id: s.id,
          name: s.name,
          group_id: s.group_id,
          practice_label: s.practice_label || '',
          lunch_label: s.lunch_label || '',
          lunch_longterm: s.lunch_longterm || 0,
          seat_order: s.seat_order ?? -1,
          seat_label: (s.seat_order ?? -1) >= 0 ? SEAT_LABELS[s.seat_order] || `位置${s.seat_order}` : '未排座',
          sort_order: s.sort_order,
        })),
        seating: seatingChart,
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `班级数据备份_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('导出失败:', err)
    } finally {
      setExporting(false)
    }
  }, [])

  const tabs = [
    { key: 'import' as const, label: '数据导入', icon: Download },
    { key: 'backup' as const, label: '备份恢复', icon: HardDrive },
    { key: 'export' as const, label: '数据导出', icon: RefreshCw },
    { key: 'lan' as const, label: 'LAN访问', icon: Wifi },
    { key: 'about' as const, label: '关于', icon: Database },
  ]

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">系统设置</h1>

        {/* 标签 */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-primary-500 text-white' : 'border text-gray-600 hover:bg-gray-50'
              }`}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        {/* 内容 */}
        {tab === 'import' && <DataImportPage />}

        {tab === 'backup' && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-3 mb-6">
              <HardDrive size={24} className="text-blue-500" />
              <div>
                <h3 className="text-lg font-semibold text-gray-700">备份与恢复</h3>
                <p className="text-sm text-gray-500">导出数据到文件，重装后可导入恢复</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <FileDown size={20} className="text-blue-500" />
                  <span className="font-medium text-gray-700">导出数据备份</span>
                </div>
                <p className="text-sm text-gray-500 mb-3">
                  将所有小组和学生数据导出为 JSON 文件，下载到本地保存。
                </p>
                <button
                  onClick={handleExportData}
                  disabled={exporting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm font-medium transition-colors"
                >
                  {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                  {exporting ? '导出中...' : '导出数据备份'}
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Download size={20} className="text-green-500" />
                  <span className="font-medium text-gray-700">从备份恢复</span>
                </div>
                <p className="text-sm text-gray-500 mb-3">
                  选择之前导出的 JSON 备份文件，恢复小组和学生数据。
                </p>
                <button
                  onClick={() => setTab('import')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-medium transition-colors"
                >
                  <Download size={14} /> 前往数据导入
                </button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-600">
                数据库文件路径：<br />
                <code className="text-xs bg-blue-100 px-1 py-0.5 rounded select-all">
                  C:\Users\{isElectron ? 'Username' : '...'}\AppData\Roaming\class-management\class-management.db
                </code>
              </div>
            </div>
          </div>
        )}

        {tab === 'export' && (
          <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
            <RefreshCw size={48} className="mx-auto mb-3 text-gray-300" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">数据导出</h3>
            <p className="text-gray-500 text-sm mb-4">
              导出积分表、考勤表等数据为 Excel/CSV 格式
            </p>
            <div className="flex gap-2 justify-center">
              <button className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm">
                导出积分表
              </button>
              <button className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm">
                导出考勤表
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-4">Excel/CSV 导出功能将在后续版本实现</p>
          </div>
        )}

        {tab === 'lan' && (
          <>
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-3 mb-6">
              <Wifi size={24} className={lanRunning ? 'text-green-500' : 'text-gray-300'} />
              <div>
                <h3 className="text-lg font-semibold text-gray-700">局域网访问</h3>
                <p className="text-sm text-gray-500">
                  开启后，局域网内的其他设备可通过浏览器访问本系统
                </p>
              </div>
            </div>

            {!isElectron ? (
              <p className="text-sm text-gray-400 text-center py-4">
                此功能仅在桌面端可用
              </p>
            ) : !hasLanAPI ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-700">
                LAN 功能模块未加载。请完全重启应用（关闭后重新打开）以激活此功能。
              </div>
            ) : (
              <>
                {/* 开机自启 */}
                <label className="flex items-center gap-2 mb-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoStart}
                    onChange={e => setAutoStart(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-400"
                  />
                  <span className="text-sm text-gray-600">启动应用时自动开启 LAN 服务器</span>
                </label>

                {/* 开关 */}
                <div className="flex items-center gap-4 mb-4">
                  <button
                    onClick={handleLanToggle}
                    disabled={lanLoading}
                    className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                      lanRunning
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                  >
                    {lanLoading ? '处理中...' : lanRunning ? '停止服务器' : '启动服务器'}
                  </button>
                  <span className={`inline-flex items-center gap-1.5 text-sm ${lanRunning ? 'text-green-600' : 'text-gray-400'}`}>
                    <span className={`inline-block w-2 h-2 rounded-full ${lanRunning ? 'bg-green-500' : 'bg-gray-300'}`} />
                    {lanRunning ? '运行中' : '已停止'}
                  </span>
                  {lanRunning && lanMode && (
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      lanMode === '生产模式' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'
                    }`}>
                      {lanMode}
                    </span>
                  )}
                </div>

                {/* 错误提示 */}
                {lanError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 mb-4">
                    {lanError}
                  </div>
                )}

                {/* 访问地址 */}
                {lanRunning && (
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <p className="text-sm text-gray-600 mb-2">局域网访问地址：</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white px-3 py-2 rounded border text-sm text-primary-600 font-mono select-all">
                        http://{lanIP}:{LAN_PORT}
                      </code>
                      <button
                        onClick={handleCopyUrl}
                        className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        {lanCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                        {lanCopied ? '已复制' : '复制'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 提示 */}
                {lanRunning && (
                  <div className="space-y-2">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                      请确保防火墙允许端口 {LAN_PORT} 的入站连接。建议仅在安全的局域网环境中使用此功能。
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-600">
                      如果 IP 地址经常变化，建议在路由器中将本机设为固定 IP，或在 Windows 网络设置中配置静态 IP。
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Cloudflare Tunnel 远程访问 */}
          {hasTunnelAPI && (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center gap-3 mb-6">
                <Globe size={24} className={tunnelStatus === 'connected' ? 'text-green-500' : 'text-gray-300'} />
                <div>
                  <h3 className="text-lg font-semibold text-gray-700">远程访问（Cloudflare Tunnel）</h3>
                  <p className="text-sm text-gray-500">
                    通过公网域名从任何设备访问本系统，地址永不改变
                  </p>
                </div>
              </div>

              {/* 开机自启 */}
              <label className="flex items-center gap-2 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tunnelAutoStart}
                  onChange={e => setTunnelAutoStart(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-400"
                />
                <span className="text-sm text-gray-600">LAN 服务器启动时自动连接隧道</span>
              </label>

              {/* 开关 */}
              <div className="flex items-center gap-4 mb-4">
                <button
                  onClick={handleTunnelToggle}
                  disabled={tunnelLoading || !lanRunning}
                  className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                    (tunnelStatus === 'connected' || tunnelStatus === 'connecting')
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                  title={!lanRunning ? '请先启动 LAN 服务器' : undefined}
                >
                  {tunnelLoading ? '处理中...' : (tunnelStatus === 'connected' || tunnelStatus === 'connecting') ? '断开隧道' : '连接隧道'}
                </button>
                <span className={`inline-flex items-center gap-1.5 text-sm ${
                  tunnelStatus === 'connected' ? 'text-green-600' :
                  tunnelStatus === 'connecting' ? 'text-blue-500' :
                  tunnelStatus === 'error' ? 'text-red-500' : 'text-gray-400'
                }`}>
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    tunnelStatus === 'connected' ? 'bg-green-500' :
                    tunnelStatus === 'connecting' ? 'bg-blue-400 animate-pulse' :
                    tunnelStatus === 'error' ? 'bg-red-500' : 'bg-gray-300'
                  }`} />
                  {tunnelStatus === 'connected' ? '已连接' :
                   tunnelStatus === 'connecting' ? '连接中...' :
                   tunnelStatus === 'error' ? '连接失败' : '已断开'}
                </span>
              </div>

              {/* 错误提示 */}
              {tunnelError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 mb-4">
                  {tunnelError}
                </div>
              )}

              {/* 公网地址（始终显示） */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-600 mb-2">公网访问地址（永久不变）：</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white px-3 py-2 rounded border text-sm text-primary-600 font-mono select-all">
                    https://classmanagement.top
                  </code>
                  <button
                    onClick={handleCopyTunnelUrl}
                    className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-100 transition-colors shrink-0"
                  >
                    {tunnelUrlCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    {tunnelUrlCopied ? '已复制' : '复制'}
                  </button>
                </div>
                {tunnelStatus === 'connected' && (
                  <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
                    隧道已连接，可通过上方地址从任何设备访问
                  </p>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-600">
                此功能通过 Cloudflare Tunnel 实现，无需公网 IP。地址绑定到域名 classmanagement.top，永久不会改变。
              </div>
            </div>
          )}
          </>
        )}

        {tab === 'about' && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="text-center mb-6">
              <Database size={48} className="mx-auto mb-3 text-primary-400" />
              <h3 className="text-lg font-semibold text-gray-700 mb-1">课堂管理系统</h3>
              <p className="text-sm text-gray-500">
                版本 {appVersion || '—'}
              </p>
            </div>

            <div className="text-sm text-gray-600 space-y-1 mb-6 text-center">
              <p>技术栈：Electron + React + TypeScript + SQLite</p>
              <p>数据库：sql.js (SQLite WASM)</p>
              <p>UI：Tailwind CSS + Lucide Icons</p>
            </div>

            {/* 自动更新 */}
            {isElectron && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">自动更新</h4>

                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={handleCheckUpdate}
                    disabled={!isElectron || updateStatus === 'checking' || updateStatus === 'downloading'}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    {(updateStatus === 'checking' || updateStatus === 'downloading')
                      ? <Loader2 size={14} className="animate-spin" />
                      : <RefreshCw size={14} />
                    }
                    {updateStatus === 'checking' ? '检查中...' :
                     updateStatus === 'downloading' ? '下载中...' : '检查更新'}
                  </button>
                </div>

                {/* 下载进度条 */}
                {updateStatus === 'downloading' && downloadProgress && (
                  <div className="mb-3 bg-blue-50 rounded-lg p-3">
                    <div className="flex items-center justify-between text-xs text-blue-600 mb-1">
                      <span>正在下载更新…</span>
                      <span>{downloadProgress.percent.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(downloadProgress.percent, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-blue-400 mt-1">
                      速度 {(downloadProgress.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s
                    </p>
                  </div>
                )}

                {/* 发现新版本 */}
                {updateStatus === 'available' && updateInfo && (
                  <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-600">
                    <p className="font-medium">发现新版本 v{updateInfo.version}</p>
                    {updateInfo.releaseNotes && (
                      <p className="text-xs mt-1 whitespace-pre-wrap">{updateInfo.releaseNotes}</p>
                    )}
                    <button
                      onClick={handleDownloadUpdate}
                      className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-xs font-medium transition-colors"
                    >
                      <DownloadCloud size={12} /> 立即下载
                    </button>
                  </div>
                )}

                {/* 下载完成 */}
                {updateStatus === 'downloaded' && (
                  <div className="bg-green-50 rounded-lg p-3 text-sm text-green-600">
                    <p className="font-medium">更新下载完成</p>
                    <p className="text-xs mt-1">重启应用后将自动安装新版{updateInfo?.version ? ` v${updateInfo.version}` : ''}</p>
                    <button
                      onClick={handleQuitAndInstall}
                      className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 text-xs font-medium transition-colors"
                    >
                      <ExternalLink size={12} /> 立即重启安装
                    </button>
                  </div>
                )}

                {/* 已是最新 */}
                {updateStatus === 'not-available' && (
                  <div className="bg-green-50 rounded-lg p-3 text-sm text-green-600">
                    <p>已是最新版本</p>
                  </div>
                )}

                {/* 错误 */}
                {updateStatus === 'error' && (
                  <div className="bg-red-50 rounded-lg p-3 text-sm text-red-600">
                    <p>{updateError || '检查更新失败'}</p>
                  </div>
                )}
              </div>
            )}

            {!isElectron && (
              <p className="text-xs text-gray-400 text-center py-4">
                自动更新功能仅在桌面端可用
              </p>
            )}

            <p className="text-xs text-gray-400 mt-6 text-center">桌面端一体化班级管理解决方案</p>
          </div>
        )}
      </div>
    </div>
  )
}
