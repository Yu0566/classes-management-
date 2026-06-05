import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Clock, LogIn, AlertTriangle, Check, Lock, Settings } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import * as dutyApi from '@/lib/duty'
import * as studentApi from '@/lib/students'
import * as groupApi from '@/lib/groups'
import type { DutyRecord, DutyStudent, StudentWithGroup, Group } from '@/types'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type WindowState = 'idle' | 'counting_down' | 'signing_in' | 'finished'

export default function DutyPage() {
  const { confirm, notify } = useConfirm()
  const [date, setDate] = useState(todayStr())
  const [dutyRecord, setDutyRecord] = useState<DutyRecord | null>(null)
  const [dutyStudents, setDutyStudents] = useState<DutyStudent[]>([])
  const [allStudents, setAllStudents] = useState<StudentWithGroup[]>([])
  const [groupMap, setGroupMap] = useState<Map<string, Group>>(new Map())
  const [windowState, setWindowState] = useState<WindowState>('idle')
  const [countdown, setCountdown] = useState(dutyApi.DUTY_DURATION_MINUTES * 60) // initial, will be overridden
  const [signInRemaining, setSignInRemaining] = useState(dutyApi.SIGN_IN_WINDOW_SECONDS)
  const [penalties, setPenalties] = useState<{ name: string; penalty: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [showStudentPicker, setShowStudentPicker] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [dutyPassword, setDutyPassword] = useState(() => {
    return localStorage.getItem('duty_password') || dutyApi.DUTY_PASSWORD
  })
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [dutyDuration, setDutyDuration] = useState(() => {
    const saved = localStorage.getItem('duty_duration')
    return saved ? parseInt(saved, 10) : dutyApi.DUTY_DURATION_MINUTES
  })
  const [dutyPenaltyPoints, setDutyPenaltyPoints] = useState(() => {
    const saved = localStorage.getItem('duty_penalty_points')
    return saved ? parseInt(saved, 10) : 1
  })
  const penaltyRef = useRef(dutyPenaltyPoints)
  penaltyRef.current = dutyPenaltyPoints
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const signInRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dutyRecordRef = useRef<DutyRecord | null>(null)
  const dateRef = useRef(date)
  const durationRef = useRef(
    (() => {
      const saved = localStorage.getItem('duty_duration')
      return saved ? parseInt(saved, 10) : dutyApi.DUTY_DURATION_MINUTES
    })()
  )

  // 保持 ref 与 state 同步，避免定时器闭包拿到过期值
  dutyRecordRef.current = dutyRecord
  dateRef.current = date

  const loadData = useCallback(async () => {
    const [record, students, gs] = await Promise.all([
      dutyApi.getOrCreateDutyRecord(date),
      studentApi.getAllStudents(),
      groupApi.getAllGroups(),
    ])
    setDutyRecord(record)
    setAllStudents(students)
    setGroupMap(new Map(gs.map(g => [g.id, g])))

    const ds = await dutyApi.getDutyStudents(record.id)
    setDutyStudents(ds)

    // 每次加载时自动扫描考勤迟到/作业未交学生加入值日
    // 但跳过被手动移除的学生（记录在 localStorage）
    let excludedIds: Set<string> | undefined
    try {
      const raw = localStorage.getItem(`duty-removed-${date}`)
      if (raw) {
        const arr: string[] = JSON.parse(raw)
        if (arr.length > 0) excludedIds = new Set(arr)
      }
    } catch { /* ignore */ }
    const result = await dutyApi.autoAssignDutyStudents(date, excludedIds)
    if (result.added.length > 0) {
      const updated = await dutyApi.getDutyStudents(record.id)
      setDutyStudents(updated)
    }

    // 根据记录恢复窗口状态
    const countdownMs = durationRef.current * 60 * 1000
    const signInMs = dutyApi.SIGN_IN_WINDOW_SECONDS * 1000

    if (record.sign_in_window_end) {
      // 签到窗口已关闭 → 完成
      setWindowState('finished')
      const hasPenalties = ds.some(d => d.penalty_applied)
      if (hasPenalties) {
        setPenalties(ds.filter(d => d.penalty_applied).map(d => ({ name: d.student_name, penalty: 1 })))
      }
    } else if (record.sign_in_window_start && record.sign_in_window_start + signInMs > Date.now()) {
      // 签到窗口进行中
      setWindowState('signing_in')
      const remaining = Math.max(0, Math.ceil((record.sign_in_window_start + signInMs - Date.now()) / 1000))
      setSignInRemaining(remaining)
    } else if (record.sign_in_window_start) {
      // 签到窗口已过期但未关闭 → 自动关闭，执行扣分
      await dutyApi.closeSignInWindow(date)
      const penaltyResult = await dutyApi.applyPenalty(record.id, date, penaltyRef.current)
      setPenalties(penaltyResult)
      setWindowState('finished')
      const ds2 = await dutyApi.getDutyStudents(record.id)
      setDutyStudents(ds2)
    } else if (record.countdown_started_at && record.countdown_started_at + countdownMs > Date.now()) {
      // 倒计时进行中
      setWindowState('counting_down')
      const remaining = Math.max(0, Math.ceil((record.countdown_started_at + countdownMs - Date.now()) / 1000))
      setCountdown(remaining)
    } else if (record.countdown_started_at) {
      // 倒计时已过期但签到窗口未开启 → 自动开启签到窗口
      setWindowState('signing_in')
      setSignInRemaining(dutyApi.SIGN_IN_WINDOW_SECONDS)
      const updatedRecord = await dutyApi.openSignInWindow(date)
      setDutyRecord(updatedRecord)
    }

    setLoading(false)
  }, [date])

  useEffect(() => { loadData() }, [loadData])

  // 暴露重置接口到控制台：__resetDuty('2026-06-01')
  useEffect(() => {
    (window as any).__resetDuty = async (d: string) => {
      await dutyApi.resetDutyRecord(d)
      console.log(`值日已重置: ${d}`)
      if (d === date) await loadData()
    }
    return () => { delete (window as any).__resetDuty }
  }, [date, loadData])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (signInRef.current) clearInterval(signInRef.current)
    }
  }, [])

  // 倒计时逻辑
  useEffect(() => {
    if (windowState === 'counting_down' && countdown > 0) {
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!)
            handleCountdownEnd()
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
    }
  }, [windowState])

  // 签到窗口倒计时
  useEffect(() => {
    if (windowState === 'signing_in' && signInRemaining > 0) {
      signInRef.current = setInterval(() => {
        setSignInRemaining(prev => {
          if (prev <= 1) {
            clearInterval(signInRef.current!)
            handleSignInWindowEnd()
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => { if (signInRef.current) clearInterval(signInRef.current) }
    }
  }, [windowState])

  const handleCountdownEnd = async () => {
    await dutyApi.openSignInWindow(dateRef.current)
    const record = await dutyApi.getDutyRecord(dateRef.current)
    setDutyRecord(record || null)
    setWindowState('signing_in')
    setSignInRemaining(dutyApi.SIGN_IN_WINDOW_SECONDS)
  }

  const handleSignInWindowEnd = async () => {
    const currentRecord = dutyRecordRef.current
    if (!currentRecord) return
    try {
      await dutyApi.closeSignInWindow(dateRef.current)
      const result = await dutyApi.applyPenalty(currentRecord.id, dateRef.current, penaltyRef.current)
      setPenalties(result)
      setWindowState('finished')
      const ds = await dutyApi.getDutyStudents(currentRecord.id)
      setDutyStudents(ds)
    } catch (err) {
      console.error('[handleSignInWindowEnd]', err)
      setWindowState('finished')
    }
  }

  const handleForceEnd = async () => {
    if (passwordInput !== dutyPassword) {
      setPasswordError(true)
      return
    }
    setShowPasswordModal(false)
    setPasswordInput('')
    setPasswordError(false)
    if (countdownRef.current) clearInterval(countdownRef.current)
    await dutyApi.forceEndCountdown(date)
    await handleCountdownEnd()
  }

  // 修改密码
  const handleChangePassword = () => {
    setPwdError('')
    if (!oldPwd) { setPwdError('请输入旧密码'); return }
    if (oldPwd !== dutyPassword) { setPwdError('旧密码错误'); return }
    if (!newPwd) { setPwdError('请输入新密码'); return }
    if (newPwd.length < 3) { setPwdError('新密码至少3位'); return }
    if (newPwd !== confirmPwd) { setPwdError('两次新密码不一致'); return }
    localStorage.setItem('duty_password', newPwd)
    setDutyPassword(newPwd)
    setOldPwd('')
    setNewPwd('')
    setConfirmPwd('')
    setShowChangePwd(false)
  }

  // 添加/移除值日学生
  const handleAddStudent = async (studentId: string, studentName: string) => {
    if (!dutyRecord) return
    await dutyApi.addDutyStudent(dutyRecord.id, studentId, studentName)
    const ds = await dutyApi.getDutyStudents(dutyRecord.id)
    setDutyStudents(ds)
  }

  const handleRemoveStudent = async (dsId: string, studentName: string, studentId: string) => {
    if (!await confirm({ message: `确认将"${studentName}"从值日名单中移除？` })) return
    await dutyApi.removeDutyStudent(dsId)
    setDutyStudents(prev => prev.filter(d => d.id !== dsId))
    // 记住被手动移除的学生，防止下次加载时被自动加回
    try {
      const key = `duty-removed-${date}`
      const raw = localStorage.getItem(key)
      const arr: string[] = raw ? JSON.parse(raw) : []
      if (!arr.includes(studentId)) {
        arr.push(studentId)
        localStorage.setItem(key, JSON.stringify(arr))
      }
    } catch { /* ignore */ }
  }

  // 开始值日
  const handleStartDuty = async () => {
    if (dutyStudents.length === 0) { await notify('值日名单为空'); return }
    const record = await dutyApi.startDuty(date)
    setDutyRecord(record)
    setWindowState('counting_down')
    setCountdown(dutyDuration * 60)
  }

  const handleStudentSignIn = async (dsId: string) => {
    await dutyApi.studentSignIn(dsId)
    setDutyStudents(prev =>
      prev.map(d => d.id === dsId ? { ...d, sign_in_time: Date.now() } : d)
    )
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const availableStudents = allStudents.filter(
    s => !dutyStudents.find(d => d.student_id === s.id)
  )

  if (loading) {
    return <div className="flex items-center justify-center h-full text-stone-400">加载中...</div>
  }

  const signedInCount = dutyStudents.filter(d => d.sign_in_time).length

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-stone-800 mb-4">值日管理</h1>

        {/* 日期选择 */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)) }} className="p-2 hover:bg-stone-100 rounded-lg"><ChevronLeft size={20} /></button>
          <span className="text-lg font-medium min-w-[180px] text-center">{date}</span>
          <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d.toISOString().slice(0, 10)) }} className="p-2 hover:bg-stone-100 rounded-lg"><ChevronRight size={20} /></button>
          <button onClick={() => setDate(todayStr())} className="px-3 py-1 text-sm text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50">今天</button>
        </div>

        {/* 进度条 */}
        {windowState !== 'idle' && (
          <div className="flex items-center gap-2 mb-4 text-sm">
            {[
              { state: 'counting_down', label: '倒计时', icon: Clock },
              { state: 'signing_in', label: '签到', icon: LogIn },
              { state: 'finished', label: '完成', icon: Check },
            ].map((step, i) => {
              const stepOrder = ['counting_down', 'signing_in', 'finished']
              const currentIdx = stepOrder.indexOf(windowState === 'finished' ? 'finished' : windowState)
              const isActive = stepOrder.indexOf(step.state) <= currentIdx
              const isCurrent = step.state === windowState
              const Icon = step.icon
              return (
                <div key={step.state} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    isCurrent ? 'bg-primary-500 text-white' : isActive ? 'bg-primary-100 text-primary-600' : 'bg-stone-100 text-stone-400'
                  }`}>
                    <Icon size={14} /> {step.label}
                  </div>
                  {i < 2 && <div className={`w-8 h-0.5 ${isActive ? 'bg-primary-300' : 'bg-stone-200'}`} />}
                </div>
              )
            })}
          </div>
        )}

        {/* 值日设置 — 始终可见 */}
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-800 w-full"
          >
            <Settings size={16} />
            值日设置
            <span className="text-xs text-stone-400 ml-auto">{showSettings ? '收起' : '展开'}</span>
          </button>
          {showSettings && (
            <div className="mt-4 pt-4 border-t space-y-4">
              <div>
                <label className="block text-sm text-stone-500 mb-1">倒计时时长（分钟）</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={dutyDuration}
                  onChange={e => {
                    const v = Math.max(1, Math.min(120, parseInt(e.target.value) || 1))
                    setDutyDuration(v)
                    durationRef.current = v
                    localStorage.setItem('duty_duration', String(v))
                  }}
                  className="w-24 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
                <span className="text-xs text-stone-400 ml-2">范围 1-120 分钟</span>
              </div>
              <div>
                <label className="block text-sm text-stone-500 mb-1">未签到扣分</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const v = Math.max(1, dutyPenaltyPoints - 1)
                      setDutyPenaltyPoints(v)
                      localStorage.setItem('duty_penalty_points', String(v))
                    }}
                    className="w-8 h-8 flex items-center justify-center border rounded-lg hover:bg-stone-100 text-stone-500"
                  >−</button>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={dutyPenaltyPoints}
                    onChange={e => {
                      const v = Math.max(1, Math.min(20, parseInt(e.target.value) || 1))
                      setDutyPenaltyPoints(v)
                      localStorage.setItem('duty_penalty_points', String(v))
                    }}
                    className="w-16 h-8 text-center border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = Math.min(20, dutyPenaltyPoints + 1)
                      setDutyPenaltyPoints(v)
                      localStorage.setItem('duty_penalty_points', String(v))
                    }}
                    className="w-8 h-8 flex items-center justify-center border rounded-lg hover:bg-stone-100 text-stone-500"
                  >+</button>
                  <span className="text-xs text-stone-400">分/人</span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-stone-500 mb-1">管理员密码</label>
                {showChangePwd ? (
                  <div className="bg-stone-50 rounded-lg p-3 space-y-2">
                    <input
                      type="password" placeholder="旧密码"
                      value={oldPwd} onChange={e => setOldPwd(e.target.value)}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                    <input
                      type="password" placeholder="新密码（至少3位）"
                      value={newPwd} onChange={e => setNewPwd(e.target.value)}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                    <input
                      type="password" placeholder="确认新密码"
                      value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                    {pwdError && <p className="text-xs text-red-500">{pwdError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={handleChangePassword}
                        className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600"
                      >
                        确认修改
                      </button>
                      <button
                        onClick={() => { setShowChangePwd(false); setOldPwd(''); setNewPwd(''); setConfirmPwd(''); setPwdError('') }}
                        className="px-3 py-1.5 text-sm border rounded-lg hover:bg-stone-100"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowChangePwd(true)}
                    className="px-3 py-1.5 text-sm border rounded-lg hover:bg-stone-50 text-stone-600"
                  >
                    修改密码
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* idle: 值日名单管理 */}
        {windowState === 'idle' && (
          <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-stone-700">值日名单 ({dutyStudents.length}人)</h2>
              <button
                onClick={() => setShowStudentPicker(true)}
                className="flex items-center gap-1 text-sm px-3 py-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
              >
                <Plus size={14} /> 添加学生
              </button>
            </div>

            {dutyStudents.length === 0 ? (
              <p className="text-center text-stone-400 py-4 text-sm">
                系统已自动扫描当日考勤迟到和作业未交的同学<br />
                也可手动添加学生
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {dutyStudents.map(ds => (
                  <span key={ds.id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-sm px-2 py-1 rounded">
                    {ds.student_name}
                    <button onClick={() => handleRemoveStudent(ds.id, ds.student_name, ds.student_id)} className="hover:text-red-500"><X size={14} /></button>
                  </span>
                ))}
              </div>
            )}

            <button
              onClick={handleStartDuty}
              disabled={dutyStudents.length === 0}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 font-medium"
            >
              <Clock size={18} /> 开始值日（{dutyDuration}分钟倒计时）
            </button>
          </div>
        )}

        {/* 倒计时 */}
        {windowState === 'counting_down' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-4 text-center">
            <Clock size={48} className="mx-auto mb-2 text-yellow-500" />
            <div className={`text-5xl font-mono font-bold mb-2 ${countdown <= 30 ? 'text-red-500 animate-pulse' : 'text-yellow-600'}`}>
              {formatTime(countdown)}
            </div>
            <p className="text-yellow-700 mb-4">值日进行中，倒计时结束后自动开启签到窗口</p>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="flex items-center gap-1 mx-auto px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              <Lock size={14} /> 强制结束（需密码）
            </button>
          </div>
        )}

        {/* 签到窗口 */}
        {windowState === 'signing_in' && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-blue-800 flex items-center gap-2">
                <LogIn size={20} /> 签到窗口 - 剩余 {formatTime(signInRemaining)}
              </h2>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {dutyStudents.map(ds => (
                <button
                  key={ds.id}
                  onClick={() => !ds.sign_in_time && handleStudentSignIn(ds.id)}
                  disabled={!!ds.sign_in_time}
                  className={`p-3 rounded-lg text-center text-sm font-medium transition-colors ${
                    ds.sign_in_time
                      ? 'bg-green-200 text-green-800 cursor-default'
                      : 'bg-white text-stone-700 hover:bg-green-100 hover:text-green-700 border border-blue-200'
                  }`}
                >
                  {ds.sign_in_time ? (
                    <span className="flex items-center justify-center gap-1">
                      <Check size={14} /> {ds.student_name}
                    </span>
                  ) : ds.student_name}
                </button>
              ))}
            </div>
            <p className="text-xs text-blue-500 mt-3">
              已签到：{signedInCount}/{dutyStudents.length} | 超时未签到将被扣{dutyPenaltyPoints}分
            </p>
          </div>
        )}

        {/* 完成状态 */}
        {windowState === 'finished' && (
          <div className="bg-stone-50 border rounded-xl p-6 mb-4">
            <div className="text-center mb-4">
              <Check size={48} className="mx-auto mb-2 text-green-500" />
              <h3 className="text-lg font-semibold text-stone-700 mb-1">值日流程已完成</h3>
              <p className="text-stone-500 text-sm">
                签到 {signedInCount}/{dutyStudents.length} 人
              </p>
            </div>

            {dutyStudents.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {/* 已签到 */}
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-green-700 mb-2">
                    已签到（{dutyStudents.filter(d => d.sign_in_time).length}人）
                  </p>
                  {dutyStudents.filter(d => d.sign_in_time).length === 0 ? (
                    <p className="text-xs text-green-400">无</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {dutyStudents.filter(d => d.sign_in_time).map(ds => (
                        <span key={ds.id} className="inline-block text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded">
                          {ds.student_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {/* 未签到 */}
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-700 mb-2">
                    未签到（{dutyStudents.filter(d => !d.sign_in_time).length}人）
                  </p>
                  {dutyStudents.filter(d => !d.sign_in_time).length === 0 ? (
                    <p className="text-xs text-red-400">无</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {dutyStudents.filter(d => !d.sign_in_time).map(ds => (
                        <span key={ds.id} className="inline-block text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded">
                          {ds.student_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {penalties.length > 0 && (
              <div className="mt-3 bg-red-50 rounded-lg p-3 text-left">
                <p className="text-sm font-medium text-red-700 flex items-center gap-1 mb-2">
                  <AlertTriangle size={14} /> 扣分记录
                </p>
                {penalties.map((p, i) => (
                  <p key={i} className="text-sm text-red-600">{p.name}：未签到，扣除 {p.penalty} 分</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 签到窗口期间显示实时状态表 */}
        {windowState === 'signing_in' && (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-stone-50 border-b">
                  <th className="text-left px-4 py-2 text-sm font-medium text-stone-500">姓名</th>
                  <th className="text-center px-4 py-2 text-sm font-medium text-stone-500">签到</th>
                  <th className="text-center px-4 py-2 text-sm font-medium text-stone-500">签到时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dutyStudents.map(ds => (
                  <tr key={ds.id}>
                    <td className="px-4 py-2 text-sm">{ds.student_name}</td>
                    <td className="px-4 py-2 text-center">
                      {ds.sign_in_time ? <Check size={16} className="inline text-green-500" /> : <X size={16} className="inline text-red-400" />}
                    </td>
                    <td className="px-4 py-2 text-center text-xs text-stone-400">
                      {ds.sign_in_time ? new Date(ds.sign_in_time).toLocaleTimeString('zh-CN') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 学生选择弹窗 */}
      <Modal open={showStudentPicker} onClose={() => setShowStudentPicker(false)} title="选择值日学生" width="sm">
        <div className="space-y-1">
          {availableStudents.length === 0 ? (
            <p className="text-center text-stone-400 py-4">所有学生已添加</p>
          ) : (
            availableStudents.map(s => (
              <button
                key={s.id}
                onClick={() => handleAddStudent(s.id, s.name)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-50 text-sm flex items-center justify-between"
              >
                <span>{s.name}</span>
                <span className="text-xs text-stone-400">{(() => { const g = groupMap.get(s.group_id); return g ? `${g.name}${g.leader_name ? `（${g.leader_name}）` : ''}` : (s.group_name || '-'); })()}</span>
              </button>
            ))
          )}
        </div>
        <button
          onClick={() => setShowStudentPicker(false)}
          className="mt-4 w-full py-2 text-stone-600 border rounded-lg hover:bg-stone-50"
        >
          完成
        </button>
      </Modal>

      {/* 密码弹窗 */}
      <Modal open={showPasswordModal} onClose={() => { setShowPasswordModal(false); setPasswordInput(''); setPasswordError(false) }} title="强制结束倒计时" width="sm">
        <p className="text-sm text-stone-500 mb-3">请输入管理员密码以强制结束倒计时</p>
        <input
          type="password"
          value={passwordInput}
          onChange={e => { setPasswordInput(e.target.value); setPasswordError(false) }}
          onKeyDown={e => e.key === 'Enter' && handleForceEnd()}
          placeholder="输入密码"
          className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 ${passwordError ? 'border-red-400' : ''}`}
          autoFocus
        />
        {passwordError && (
          <p className="text-xs text-red-500 mt-1">密码错误，请重试</p>
        )}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => { setShowPasswordModal(false); setPasswordInput(''); setPasswordError(false) }}
            className="flex-1 py-2 text-sm border rounded-lg hover:bg-stone-50"
          >
            取消
          </button>
          <button
            onClick={handleForceEnd}
            className="flex-1 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
          >
            确认结束
          </button>
        </div>
      </Modal>
    </div>
  )
}
