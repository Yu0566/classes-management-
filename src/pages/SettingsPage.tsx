import { useState, useEffect, useCallback } from 'react'
import { Database, Download, HardDrive, Wifi, Copy, Check, ExternalLink, Loader2, DownloadCloud, FileDown, Globe, RefreshCw, Upload, Save, History, AlertTriangle, Lock } from 'lucide-react'
import DataImportPage from './DataImportPage'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { queryAll, executeTransaction } from '../lib/db'


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
  const { notify } = useConfirm()
  const [tab, setTab] = useState<'import' | 'lan' | 'about'>('import')

  // LAN 访问状态
  const [lanRunning, setLanRunning] = useState(false)
  const [lanIP, setLanIP] = useState('')
  const [lanPort, setLanPort] = useState(3456)
  const [lanMode, setLanMode] = useState('')
  const DEFAULT_LAN_PORT = 3456
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
  const [deviceName, setDeviceNameState] = useState(() => {
    return localStorage.getItem('device_name') || ''
  })

  // 管理密码
  const [adminPassword, setAdminPassword] = useState(() => localStorage.getItem('duty_password') || 'admin')
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdError, setPwdError] = useState('')

  const handleChangePassword = () => {
    setPwdError('')
    if (!oldPwd) { setPwdError('请输入旧密码'); return }
    if (oldPwd !== adminPassword) { setPwdError('旧密码错误'); return }
    if (!newPwd) { setPwdError('请输入新密码'); return }
    if (newPwd.length < 3) { setPwdError('新密码至少3位'); return }
    if (newPwd !== confirmPwd) { setPwdError('两次新密码不一致'); return }
    localStorage.setItem('duty_password', newPwd)
    setAdminPassword(newPwd)
    setOldPwd('')
    setNewPwd('')
    setConfirmPwd('')
    setShowChangePwd(false)
    notify('密码修改成功')
  }

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
  const [exportingInfo, setExportingInfo] = useState(false)
  const [exportingHistory, setExportingHistory] = useState(false)

  // 分项导入
  const [importingInfo, setImportingInfo] = useState(false)
  const [importingHistory, setImportingHistory] = useState(false)
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)

  // 系统备份
  const [backups, setBackups] = useState<{ name: string; size: number; mtime: number }[]>([])
  const [backingUp, setBackingUp] = useState(false)
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)
  const hasBackupAPI = !!(window.electronAPI?.backup)

  useEffect(() => {
    if (isElectron && hasLanAPI) {
      window.electronAPI!.lan.getStatus().then(s => {
        setLanRunning(s.running)
        setLanIP(s.ip)
        setLanPort(s.port || 3456)
        setLanMode(s.mode || '')
        // 自动启动：如果未运行且开启了自启
        if (!s.running && localStorage.getItem('lan_auto_start') === 'true') {
          window.electronAPI!.lan.start(DEFAULT_LAN_PORT).then(r => {
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


  // 设备名称同步到 localStorage + LAN 服务器
  useEffect(() => {
    localStorage.setItem('device_name', deviceName)
    if (!deviceName) return
    if (window.electronAPI?.lan?.setDeviceName) {
      window.electronAPI.lan.setDeviceName(deviceName).catch(() => {})
    } else {
      const port = lanPort || DEFAULT_LAN_PORT
      fetch(`http://localhost:${port}/api/device-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName }),
      }).catch(() => {})
    }
  }, [deviceName, lanPort, lanRunning])

  // 启动时把已存储的设备名称同步到 LAN 服务器
  useEffect(() => {
    if (lanRunning && deviceName) {
      if (window.electronAPI?.lan?.setDeviceName) {
        window.electronAPI.lan.setDeviceName(deviceName).catch(() => {})
      } else {
        const port = lanPort || DEFAULT_LAN_PORT
        fetch(`http://localhost:${port}/api/device-name`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceName }),
        }).catch(() => {})
      }
    }
  }, [lanRunning]) // eslint-disable-line react-hooks/exhaustive-deps

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
        const result = await window.electronAPI.lan.start(DEFAULT_LAN_PORT)
        if (result.success) {
          setLanRunning(true)
          setLanIP(result.ip || '')
          setLanPort(result.port || DEFAULT_LAN_PORT)
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
    navigator.clipboard.writeText(`http://${lanIP}:${lanPort}`)
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
        const result = await window.electronAPI.tunnel.start(lanPort, deviceName || undefined)
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

  // 加载备份列表
  useEffect(() => {
    if (hasBackupAPI) {
      window.electronAPI!.backup!.list().then(setBackups).catch(() => {})
    }
  }, [hasBackupAPI])

  // 手动备份
  const handleCreateBackup = useCallback(async () => {
    if (!window.electronAPI?.backup) return
    setBackingUp(true)
    try {
      await window.electronAPI.backup.create()
      const list = await window.electronAPI.backup.list()
      setBackups(list)
    } catch { /* ignore */ }
    finally { setBackingUp(false) }
  }, [])

  // 恢复备份（需二次确认）
  const handleRestoreBackup = useCallback(async (name: string) => {
    if (!window.electronAPI?.backup) return
    setRestoringBackup(name)
    try {
      await window.electronAPI.backup.restore(name)
      setConfirmRestore(null)
      notify({ message: '备份已恢复，应用将重新加载数据。建议重启应用以确保数据完整。' })
      // 触发主窗口刷新
      window.electronAPI?.widget?.refresh()
    } catch { /* ignore */ }
    finally { setRestoringBackup(null) }
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

  // 导出学生结构信息（小组、学生、轮值安排）
  const handleExportStudentInfo = useCallback(async () => {
    setExportingInfo(true)
    try {
      const [groups, students, dutyRoster] = await Promise.all([
        queryAll('SELECT id, name, leader_name, color, sort_order FROM groups ORDER BY sort_order'),
        queryAll('SELECT id, name, group_id, practice_label, lunch_label, lunch_longterm, seat_order, sort_order FROM students ORDER BY sort_order'),
        queryAll('SELECT * FROM duty_roster ORDER BY sort_order'),
      ])

      const SEAT_LABELS = ['左前', '左中', '左后', '左后二', '右后二', '右后', '右前']

      const exportData = {
        version: 1,
        type: 'student_info',
        exportedAt: new Date().toISOString(),
        groups,
        students: (students as any[]).map((s) => ({
          ...s,
          seat_label: (s.seat_order ?? -1) >= 0 ? SEAT_LABELS[s.seat_order] || `位置${s.seat_order}` : '未排座',
        })),
        dutyRoster,
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `学生结构信息_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('导出学生信息失败:', err)
    } finally {
      setExportingInfo(false)
    }
  }, [])

  // 导出历史记录（扣分、作业、每日一练、考勤等）
  const handleExportHistory = useCallback(async () => {
    setExportingHistory(true)
    try {
      const [
        deductionRecords,
        homeworkRecords,
        mathHomeworkGrades,
        dailyPracticeRecords,
        practiceSignins,
        attendanceRecords,
        lunchRestRecords,
        practiceScoreAwards,
        dutyRecords,
        dutyStudents,
      ] = await Promise.all([
        queryAll('SELECT * FROM deduction_records ORDER BY date DESC'),
        queryAll('SELECT * FROM homework_records ORDER BY date DESC'),
        queryAll('SELECT * FROM math_homework_grades ORDER BY date DESC'),
        queryAll('SELECT * FROM daily_practice_records ORDER BY date DESC'),
        queryAll('SELECT * FROM practice_signins ORDER BY date DESC'),
        queryAll('SELECT * FROM attendance_records ORDER BY date DESC'),
        queryAll('SELECT * FROM lunch_rest_records ORDER BY date DESC'),
        queryAll('SELECT * FROM practice_score_awards ORDER BY date DESC'),
        queryAll('SELECT * FROM duty_records ORDER BY date DESC'),
        queryAll('SELECT * FROM duty_students ORDER BY student_name'),
      ])

      const exportData = {
        version: 1,
        type: 'historical_records',
        exportedAt: new Date().toISOString(),
        deductionRecords,
        homeworkRecords,
        mathHomeworkGrades,
        dailyPracticeRecords,
        practiceSignins,
        attendanceRecords,
        lunchRestRecords,
        practiceScoreAwards,
        dutyRecords,
        dutyStudents,
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `历史数据记录_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('导出历史记录失败:', err)
    } finally {
      setExportingHistory(false)
    }
  }, [])

  // 通用文件选择器
  const pickJSONFile = (): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return reject(new Error('未选择文件'))
        try {
          const text = await file.text()
          resolve(JSON.parse(text))
        } catch {
          reject(new Error('文件格式无效'))
        }
      }
      input.click()
    })

  // 导入学生结构信息（新格式）
  const handleImportStudentInfo = useCallback(async () => {
    setImportResult(null)
    try {
      const data = await pickJSONFile()
      if (data.type !== 'student_info') {
        setImportResult({ success: false, message: '文件类型不匹配，请选择"学生结构信息"备份文件' })
        return
      }
      setImportingInfo(true)
      const now = Date.now()
      const ops: { sql: string; params: unknown[] }[] = []

      // 小组
      if (Array.isArray(data.groups)) {
        for (const g of data.groups as Record<string, unknown>[]) {
          ops.push({
            sql: `INSERT OR REPLACE INTO groups (id, name, leader_name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            params: [g.id, g.name, g.leader_name || '', g.color || 'bg-blue-500', g.sort_order ?? 0, g.created_at ?? now, now],
          })
        }
      }
      // 学生
      if (Array.isArray(data.students)) {
        for (const s of data.students as Record<string, unknown>[]) {
          ops.push({
            sql: `INSERT OR REPLACE INTO students (id, name, group_id, practice_label, lunch_label, lunch_longterm, seat_order, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [s.id, s.name, s.group_id || '', s.practice_label || '', s.lunch_label || '', s.lunch_longterm ? 1 : 0, s.seat_order ?? -1, s.sort_order ?? 0, s.created_at ?? now, now],
          })
        }
      }
      // 轮值
      if (Array.isArray(data.dutyRoster)) {
        for (const r of data.dutyRoster as Record<string, unknown>[]) {
          ops.push({
            sql: `INSERT OR REPLACE INTO duty_roster (id, student_id, student_name, role, weekday, position, weekday_group, photo, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [r.id, r.student_id, r.student_name, r.role, r.weekday ?? null, r.position ?? null, r.weekday_group || '', r.photo || '', r.sort_order ?? 0, r.created_at ?? now, now],
          })
        }
      }

      if (ops.length > 0) {
        await executeTransaction(ops)
      }
      const gCount = Array.isArray(data.groups) ? data.groups.length : 0
      const sCount = Array.isArray(data.students) ? data.students.length : 0
      const dCount = Array.isArray(data.dutyRoster) ? data.dutyRoster.length : 0
      setImportResult({ success: true, message: `已恢复 ${gCount} 个小组、${sCount} 名学生、${dCount} 条轮值安排` })
    } catch (err) {
      if (err instanceof Error && err.message !== '未选择文件') {
        setImportResult({ success: false, message: err.message })
      }
    } finally {
      setImportingInfo(false)
    }
  }, [])

  // 导入历史数据记录（新格式）
  const handleImportHistory = useCallback(async () => {
    setImportResult(null)
    try {
      const data = await pickJSONFile()
      if (data.type !== 'historical_records') {
        setImportResult({ success: false, message: '文件类型不匹配，请选择"历史数据记录"备份文件' })
        return
      }
      setImportingHistory(true)

      const tableMap: [string, string[]][] = [
        ['deductionRecords', ['id', 'student_id', 'student_name', 'points', 'reason', 'date', 'timestamp']],
        ['homeworkRecords', ['id', 'student_id', 'date', 'subject', 'status', 'updated_at']],
        ['mathHomeworkGrades', ['id', 'student_id', 'date', 'reason', 'created_at']],
        ['dailyPracticeRecords', ['id', 'student_id', 'date', 'status', 'signed_at', 'updated_at']],
        ['practiceSignins', ['id', 'student_id', 'date', 'label', 'sign_in_order', 'signed_at']],
        ['attendanceRecords', ['id', 'student_id', 'date', 'status', 'remark', 'updated_at']],
        ['lunchRestRecords', ['id', 'student_id', 'date', 'status', 'remark', 'updated_at']],
        ['practiceScoreAwards', ['id', 'student_id', 'group_id', 'date', 'label', 'score_delta', 'created_at']],
      ]

      const ops: { sql: string; params: unknown[] }[] = []

      for (const [key, cols] of tableMap) {
        const tableName = key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
        const rows = data[key]
        if (Array.isArray(rows)) {
          for (const r of rows as Record<string, unknown>[]) {
            ops.push({
              sql: `INSERT OR REPLACE INTO ${tableName} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
              params: cols.map(c => r[c] !== undefined ? r[c] : null),
            })
          }
        }
      }

      // 值日记录（两表关联）
      if (Array.isArray(data.dutyRecords)) {
        for (const r of data.dutyRecords as Record<string, unknown>[]) {
          ops.push({
            sql: `INSERT OR REPLACE INTO duty_records (id, date, sign_in_window_start, sign_in_window_end, sign_out_window_start, sign_out_window_end, countdown_started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [r.id, r.date, r.sign_in_window_start ?? null, r.sign_in_window_end ?? null, r.sign_out_window_start ?? null, r.sign_out_window_end ?? null, r.countdown_started_at ?? null, r.created_at ?? null],
          })
        }
      }
      if (Array.isArray(data.dutyStudents)) {
        for (const ds of data.dutyStudents as Record<string, unknown>[]) {
          ops.push({
            sql: `INSERT OR REPLACE INTO duty_students (id, duty_record_id, student_id, student_name, sign_in_time, sign_out_time, penalty_applied) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            params: [ds.id, ds.duty_record_id, ds.student_id, ds.student_name, ds.sign_in_time ?? null, ds.sign_out_time ?? null, ds.penalty_applied ?? 0],
          })
        }
      }

      if (ops.length > 0) {
        await executeTransaction(ops)
      }

      let totalRecords = 0
      for (const [key] of tableMap) {
        if (Array.isArray(data[key])) totalRecords += data[key].length
      }
      if (Array.isArray(data.dutyRecords)) totalRecords += data.dutyRecords.length
      if (Array.isArray(data.dutyStudents)) totalRecords += data.dutyStudents.length
      setImportResult({ success: true, message: `已恢复 ${totalRecords} 条历史数据记录` })
    } catch (err) {
      if (err instanceof Error && err.message !== '未选择文件') {
        setImportResult({ success: false, message: err.message })
      }
    } finally {
      setImportingHistory(false)
    }
  }, [])

  const tabs = [
    { key: 'import' as const, label: '数据备份与恢复', icon: Download },
    { key: 'lan' as const, label: 'LAN访问', icon: Wifi },
    { key: 'about' as const, label: '关于', icon: Database },
  ]

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-stone-800 mb-6">系统设置</h1>

        {/* 标签 */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-primary-500 text-white' : 'border text-stone-600 hover:bg-stone-50'
              }`}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        {/* 内容 */}
        {tab === 'import' && (
          <div className="space-y-6">
            {/* ── 分项备份与恢复：学生结构信息 ── */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center gap-3 mb-4">
                <FileDown size={24} className="text-primary-400" />
                <div>
                  <h3 className="text-lg font-semibold text-stone-700">学生结构信息</h3>
                  <p className="text-sm text-stone-500">小组、学生标签、座位、轮值安排的备份与恢复</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {/* 导出 */}
                <div className="bg-stone-50 rounded-lg p-4 flex flex-col">
                  <p className="text-sm font-medium text-stone-700 mb-2">导出备份</p>
                  <p className="text-xs text-stone-500">
                    小组信息（含组长）、学生信息（含午餐午休标签、每日一练标签、座位）、班级轮值安排
                  </p>
                  <button
                    onClick={handleExportStudentInfo}
                    disabled={exportingInfo}
                    className="mt-auto flex items-center gap-1.5 px-3 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    {exportingInfo ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                    {exportingInfo ? '导出中...' : '导出备份'}
                  </button>
                </div>
                {/* 恢复 */}
                <div className="bg-stone-50 rounded-lg p-4 flex flex-col">
                  <p className="text-sm font-medium text-stone-700 mb-2">恢复备份</p>
                  <p className="text-xs text-stone-500">
                    选择之前导出的学生结构信息 JSON 文件进行恢复
                  </p>
                  <button
                    onClick={handleImportStudentInfo}
                    disabled={importingInfo}
                    className="mt-auto flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    {importingInfo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {importingInfo ? '恢复中...' : '恢复备份'}
                  </button>
                </div>
              </div>
            </div>

            {/* ── 分项备份与恢复：历史数据记录 ── */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center gap-3 mb-4">
                <DownloadCloud size={24} className="text-amber-500" />
                <div>
                  <h3 className="text-lg font-semibold text-stone-700">历史数据记录</h3>
                  <p className="text-sm text-stone-500">扣分、作业、每日一练、考勤等历史数据的备份与恢复</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {/* 导出 */}
                <div className="bg-stone-50 rounded-lg p-4 flex flex-col">
                  <p className="text-sm font-medium text-stone-700 mb-2">导出备份</p>
                  <p className="text-xs text-stone-500">
                    个人扣分、每日作业、数学作业等级、每日一练签到、考勤、午餐午休、值日记录、每日一练加分
                  </p>
                  <button
                    onClick={handleExportHistory}
                    disabled={exportingHistory}
                    className="mt-auto flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    {exportingHistory ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
                    {exportingHistory ? '导出中...' : '导出备份'}
                  </button>
                </div>
                {/* 恢复 */}
                <div className="bg-stone-50 rounded-lg p-4 flex flex-col">
                  <p className="text-sm font-medium text-stone-700 mb-2">恢复备份</p>
                  <p className="text-xs text-stone-500">
                    选择之前导出的历史数据记录 JSON 文件进行恢复
                  </p>
                  <button
                    onClick={handleImportHistory}
                    disabled={importingHistory}
                    className="mt-auto flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    {importingHistory ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {importingHistory ? '恢复中...' : '恢复备份'}
                  </button>
                </div>
              </div>
            </div>

            {/* 恢复结果提示 */}
            {importResult && (
              <div className={`border rounded-lg p-4 ${importResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <p className={`text-sm ${importResult.success ? 'text-green-700' : 'text-red-700'}`}>
                  {importResult.message}
                </p>
                <button
                  onClick={() => setImportResult(null)}
                  className="mt-2 text-xs underline opacity-60 hover:opacity-100"
                >
                  关闭
                </button>
              </div>
            )}

            {/* ── 系统自动备份 ── */}
            {hasBackupAPI && (
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-center gap-3 mb-4">
                  <History size={24} className="text-indigo-400" />
                  <div>
                    <h3 className="text-lg font-semibold text-stone-700">系统自动备份</h3>
                    <p className="text-sm text-stone-500">
                      每次启动自动备份数据库，保留最近 20 份。可随时手动创建或恢复备份。
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={handleCreateBackup}
                    disabled={backingUp}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    {backingUp ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {backingUp ? '备份中...' : '立即备份'}
                  </button>
                  <span className="text-xs text-stone-400">
                    备份位置：%APPDATA%\class-management\backups\
                  </span>
                </div>

                {backups.length === 0 ? (
                  <p className="text-sm text-stone-400 text-center py-4">
                    暂无备份记录，启动应用后将自动创建
                  </p>
                ) : (
                  <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                    {backups.map(b => {
                      const date = new Date(b.mtime)
                      const dateStr = date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                      const sizeKB = (b.size / 1024).toFixed(1)
                      return (
                        <div key={b.name} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-stone-50">
                          <div className="flex items-center gap-3">
                            <Save size={14} className="text-stone-400" />
                            <span className="text-stone-700 font-mono text-xs">{dateStr}</span>
                            <span className="text-stone-400 text-xs">{sizeKB} KB</span>
                          </div>
                          <div>
                            {confirmRestore === b.name ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-red-500 flex items-center gap-1">
                                  <AlertTriangle size={12} /> 确认恢复？
                                </span>
                                <button
                                  onClick={() => handleRestoreBackup(b.name)}
                                  disabled={restoringBackup === b.name}
                                  className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 disabled:opacity-50"
                                >
                                  {restoringBackup === b.name ? '恢复中...' : '确认'}
                                </button>
                                <button
                                  onClick={() => setConfirmRestore(null)}
                                  className="px-2 py-1 text-xs border rounded hover:bg-stone-100"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmRestore(b.name)}
                                className="px-2 py-1 text-xs text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors"
                              >
                                恢复此备份
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── 旧版全量备份恢复 ── */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center gap-3 mb-4">
                <HardDrive size={24} className="text-stone-400" />
                <div>
                  <h3 className="text-lg font-semibold text-stone-700">旧版全量备份恢复</h3>
                  <p className="text-sm text-stone-500">从 Web 版或旧版桌面端导出的完整 JSON 文件恢复数据</p>
                </div>
              </div>
              <DataImportPage />
            </div>
          </div>
        )}

        {tab === 'lan' && (
          <>
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-3 mb-6">
              <Wifi size={24} className={lanRunning ? 'text-green-500' : 'text-stone-300'} />
              <div>
                <h3 className="text-lg font-semibold text-stone-700">局域网访问</h3>
                <p className="text-sm text-stone-500">
                  开启后，局域网内的其他设备可通过浏览器访问本系统
                </p>
              </div>
            </div>

            {!isElectron ? (
              <p className="text-sm text-stone-400 text-center py-4">
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
                    className="w-4 h-4 rounded border-stone-300 text-primary-500 focus:ring-primary-400"
                  />
                  <span className="text-sm text-stone-600">启动应用时自动开启 LAN 服务器</span>
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
                  <span className={`inline-flex items-center gap-1.5 text-sm ${lanRunning ? 'text-green-600' : 'text-stone-400'}`}>
                    <span className={`inline-block w-2 h-2 rounded-full ${lanRunning ? 'bg-green-500' : 'bg-stone-300'}`} />
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

                {/* 设备名称 */}
                <div className="mb-4">
                  <label className="block text-sm text-stone-600 mb-1.5">设备名称</label>
                  <p className="text-xs text-stone-400 mb-2">
                    设置后，局域网内的浏览器连接时会显示此名称，方便识别谁连到了这里
                  </p>
                  <input
                    type="text"
                    value={deviceName}
                    onChange={e => setDeviceNameState(e.target.value)}
                    placeholder="例如：教室电脑"
                    maxLength={20}
                    className="w-full max-w-xs px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-200 focus:border-primary-300 outline-none"
                  />
                </div>

                {/* 访问地址 */}
                {lanRunning && (
                  <div className="bg-stone-50 rounded-lg p-4 mb-4">
                    <p className="text-sm text-stone-600 mb-2">局域网访问地址：</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white px-3 py-2 rounded border text-sm text-primary-600 font-mono select-all">
                        http://{lanIP}:{lanPort}
                      </code>
                      <button
                        onClick={handleCopyUrl}
                        className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-stone-100 transition-colors"
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
                      请确保防火墙允许端口 {lanPort} 的入站连接。建议仅在安全的局域网环境中使用此功能。
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
                <Globe size={24} className={tunnelStatus === 'connected' ? 'text-green-500' : 'text-stone-300'} />
                <div>
                  <h3 className="text-lg font-semibold text-stone-700">远程访问（Cloudflare Tunnel）</h3>
                  <p className="text-sm text-stone-500">
                    通过公网域名从任何设备访问本系统，地址永不改变
                  </p>
                </div>
              </div>


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
                  tunnelStatus === 'error' ? 'text-red-500' : 'text-stone-400'
                }`}>
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    tunnelStatus === 'connected' ? 'bg-green-500' :
                    tunnelStatus === 'connecting' ? 'bg-blue-400 animate-pulse' :
                    tunnelStatus === 'error' ? 'bg-red-500' : 'bg-stone-300'
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
              <div className="bg-stone-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-stone-600 mb-2">公网访问地址（永久不变）：</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white px-3 py-2 rounded border text-sm text-primary-600 font-mono select-all">
                    https://classmanagement.top
                  </code>
                  <button
                    onClick={handleCopyTunnelUrl}
                    className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-stone-100 transition-colors shrink-0"
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
          <div className="space-y-6">
          {/* 管理密码 */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-2 mb-4">
              <Lock size={20} className="text-primary-400" />
              <h3 className="text-sm font-semibold text-stone-700">管理密码</h3>
            </div>
            <p className="text-xs text-stone-500 mb-3">用于值日重置、强制结束倒计时、延时续费重置、积分清零、成长记录清空等需要验证的操作</p>
            {showChangePwd ? (
              <div className="bg-stone-50 rounded-lg p-4 space-y-2 max-w-sm">
                <input
                  type="password" placeholder="旧密码"
                  value={oldPwd} onChange={e => setOldPwd(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
                <input
                  type="password" placeholder="新密码（至少3位）"
                  value={newPwd} onChange={e => setNewPwd(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
                <input
                  type="password" placeholder="确认新密码"
                  value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
                {pwdError && <p className="text-xs text-red-500">{pwdError}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleChangePassword}
                    className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600"
                  >
                    确认修改
                  </button>
                  <button
                    onClick={() => { setShowChangePwd(false); setOldPwd(''); setNewPwd(''); setConfirmPwd(''); setPwdError('') }}
                    className="px-4 py-2 text-sm border rounded-lg hover:bg-stone-100"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowChangePwd(true)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-stone-50 text-stone-600"
              >
                修改密码
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="text-center mb-6">
              <Database size={48} className="mx-auto mb-3 text-primary-400" />
              <h3 className="text-lg font-semibold text-stone-700 mb-1">课堂管理系统</h3>
              <p className="text-sm text-stone-500">
                版本 {appVersion || '—'}
              </p>
            </div>

            <div className="text-sm text-stone-600 space-y-1 mb-6 text-center">
              <p>技术栈：Electron + React + TypeScript + SQLite</p>
              <p>数据库：sql.js (SQLite WASM)</p>
              <p>UI：Tailwind CSS + Lucide Icons</p>
            </div>

            {/* 自动更新 */}
            {isElectron && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-stone-700 mb-3">自动更新</h4>

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
              <p className="text-xs text-stone-400 text-center py-4">
                自动更新功能仅在桌面端可用
              </p>
            )}

            <p className="text-xs text-stone-400 mt-6 text-center">桌面端一体化班级管理解决方案</p>
          </div>
          </div>
        )}
      </div>
    </div>
  )
}
