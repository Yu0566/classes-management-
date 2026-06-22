import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Clock, LogIn, AlertTriangle, Check, Lock, Settings } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import StudentPickerModal from '@/components/ui/StudentPickerModal'
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
  const [passwordAction, setPasswordAction] = useState<'reset_duty' | 'force_end' | null>(null)
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
    try {
      const isFuture = date > todayStr()

      // 未来日期不自动创建记录，只读取已有记录
      let record: DutyRecord | undefined
      if (isFuture) {
        record = await dutyApi.getDutyRecord(date)
      } else {
        record = await dutyApi.getOrCreateDutyRecord(date)
      }

      const [students, gs] = await Promise.all([
        studentApi.getAllStudents(),
        groupApi.getAllGroups(),
      ])
      setDutyRecord(record || null)
      setAllStudents(students)
      setGroupMap(new Map(gs.map(g => [g.id, g])))

      let ds: DutyStudent[] = []
      if (record) {
        ds = await dutyApi.getDutyStudents(record.id)
        setDutyStudents(ds)

        // 仅当天且值日尚未开始时自动扫描违规学生，一旦开始值日名单冻结
        if (!isFuture && !record.countdown_started_at) {
          let excludedIds: Set<string> | undefined
          try {
            const raw = localStorage.getItem(`duty-removed-${date}`)
            if (raw) {
              const arr: string[] = JSON.parse(raw)
              if (arr.length > 0) excludedIds = new Set(arr)
            }
          } catch { /* ignore */ }
          try {
            const result = await dutyApi.autoAssignDutyStudents(date, excludedIds)
            if (result.added.length > 0 || result.removed.length > 0) {
              ds = await dutyApi.getDutyStudents(record.id)
              setDutyStudents(ds)
            }
          } catch (err) {
            console.error('[DutyPage] 自动分配值日学生失败:', err)
          }
        }

        // 根据记录恢复窗口状态
        const now = Date.now()
        const countdownMs = durationRef.current * 60 * 1000
        const signInMs = dutyApi.SIGN_IN_WINDOW_SECONDS * 1000

        if (record.sign_in_window_end) {
          setWindowState('finished')
          const hasPenalties = ds.some(d => d.penalty_applied)
          if (hasPenalties) {
            setPenalties(ds.filter(d => d.penalty_applied).map(d => ({ name: d.student_name, penalty: dutyPenaltyPoints })))
          }
        } else if (record.sign_in_window_start && record.sign_in_window_start + signInMs > now) {
          setWindowState('signing_in')
          const remaining = Math.max(0, Math.ceil((record.sign_in_window_start + signInMs - now) / 1000))
          setSignInRemaining(remaining)
        } else if (record.sign_in_window_start) {
          // 系统关闭期间签到窗口过期，自动关闭并扣分
          await dutyApi.closeSignInWindow(date)
          const result = await dutyApi.applyPenalty(record.id, date, dutyPenaltyPoints)
          setPenalties(result)
          ds = await dutyApi.getDutyStudents(record.id)
          setDutyStudents(ds)
          setWindowState('finished')
        } else if (record.countdown_started_at && record.countdown_started_at + countdownMs > now) {
          setWindowState('counting_down')
          const remaining = Math.max(0, Math.ceil((record.countdown_started_at + countdownMs - now) / 1000))
          setCountdown(remaining)
        } else if (record.countdown_started_at) {
          // 系统关闭期间倒计时到期，自动开启签到窗口
          await dutyApi.openSignInWindow(date)
          setWindowState('signing_in')
          setSignInRemaining(dutyApi.SIGN_IN_WINDOW_SECONDS)
        }
      } else {
        setDutyStudents([])
        setWindowState('idle')
      }
    } catch (err) {
      console.error('[DutyPage] 加载数据失败:', err)
    } finally {
      setLoading(false)
    }
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

  const handlePasswordConfirm = async () => {
    const adminPwd = localStorage.getItem('duty_password') || dutyApi.DUTY_PASSWORD
    if (passwordInput !== adminPwd) {
      setPasswordError(true)
      return
    }
    setShowPasswordModal(false)
    setPasswordInput('')
    setPasswordError(false)

    if (passwordAction === 'reset_duty') {
      try {
        await dutyApi.resetDutyRecord(date)
        if (countdownRef.current) clearInterval(countdownRef.current)
        setWindowState('idle')
        if (dutyRecordRef.current) {
          const students = await dutyApi.getDutyStudents(dutyRecordRef.current.id)
          setDutyStudents(students)
        }
      } catch (err) {
        console.error('重置值日失败:', err)
      }
    } else if (passwordAction === 'force_end') {
      if (countdownRef.current) clearInterval(countdownRef.current)
      await dutyApi.forceEndCountdown(date)
      await handleCountdownEnd()
    }
    setPasswordAction(null)
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
    // 如果是"昨日值日未签到"来源，标记前一天记录为已处理（数据库级别，跨客户端生效）
    const student = dutyStudents.find(d => d.id === dsId)
    if (student?.source === '昨日值日未签到') {
      await dutyApi.dismissPreviousDutyCarry(studentId, date)
    }
    setDutyStudents(prev => prev.filter(d => d.id !== dsId))
    // localStorage 备用排除（同客户端防重复）
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
    if (!await confirm({ message: '确认开始值日？\n\n开始后将进入倒计时，如需撤销可点击"重置值日"。', variant: 'normal' })) return
    const record = await dutyApi.startDuty(date)
    setDutyRecord(record)
    setWindowState('counting_down')
    setCountdown(dutyDuration * 60)
  }

  // 重置值日（需密码验证）
  const handleResetDuty = () => {
    setPasswordAction('reset_duty')
    setShowPasswordModal(true)
    setPasswordInput('')
    setPasswordError(false)
  }

  const handleStudentSignIn = async (dsId: string) => {
    const record = dutyRecordRef.current
    if (!record) return
    let result = await dutyApi.studentSignIn(dsId)
    if (result.changes === 0) {
      // ID 可能已失效，通过 student_id 兜底
      const ds = dutyStudents.find(d => d.id === dsId)
      if (ds) {
        result = await dutyApi.studentSignInByStudentId(record.id, ds.student_id)
      }
    }
    // 无论如何从数据库重新加载，确保显示真实状态
    const fresh = await dutyApi.getDutyStudents(record.id)
    setDutyStudents(fresh)
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
                {dutyStudents.map(ds => {
                  const src = ds.source || ''
                  const isManual = src === '手动添加'
                  const sourceLabel = src || '自动'
                  const sourceCls = isManual
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-blue-100 text-blue-600'
                  return (
                    <span key={ds.id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-sm px-2 py-1 rounded">
                      <span className={`inline-block text-xs px-1 py-0.5 rounded font-medium ${sourceCls}`}>{sourceLabel}</span>
                      {ds.student_name}
                      <button onClick={() => handleRemoveStudent(ds.id, ds.student_name, ds.student_id)} className="hover:text-red-500"><X size={14} /></button>
                    </span>
                  )
                })}
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
          <>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-4 text-center">
              <Clock size={48} className="mx-auto mb-2 text-yellow-500" />
              <div className={`text-5xl font-mono font-bold mb-2 ${countdown <= 30 ? 'text-red-500 animate-pulse' : 'text-yellow-600'}`}>
                {formatTime(countdown)}
              </div>
              <p className="text-yellow-700 mb-4">值日进行中，倒计时结束后自动开启签到窗口</p>
              <div className="flex items-center gap-2 justify-center">
                <button
                  onClick={handleResetDuty}
                  className="flex items-center gap-1 px-4 py-2 text-sm bg-stone-400 text-white rounded-lg hover:bg-stone-500"
                >
                  <Lock size={14} /> 重置值日（需密码）
                </button>
                <button
                  onClick={() => { setPasswordAction('force_end'); setShowPasswordModal(true); setPasswordInput(''); setPasswordError(false) }}
                  className="flex items-center gap-1 px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  <Lock size={14} /> 强制结束（需密码）
                </button>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <h3 className="font-semibold text-stone-700 mb-2">值日名单 ({dutyStudents.length}人)</h3>
              <div className="flex flex-wrap gap-2">
                {dutyStudents.map(ds => {
                  const src = ds.source || ''
                  const isManual = src === '手动添加'
                  const sourceLabel = src || '自动'
                  const sourceCls = isManual
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-blue-100 text-blue-600'
                  return (
                    <span key={ds.id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-sm px-2 py-1 rounded">
                      <span className={`inline-block text-xs px-1 py-0.5 rounded font-medium ${sourceCls}`}>{sourceLabel}</span>
                      {ds.student_name}
                    </span>
                  )
                })}
              </div>
            </div>
          </>
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
            <div className="flex items-center gap-2 justify-center mt-3">
              <button
                onClick={handleResetDuty}
                className="flex items-center gap-1 px-4 py-2 text-sm bg-stone-400 text-white rounded-lg hover:bg-stone-500"
              >
                <Lock size={14} /> 重置值日（需密码）
              </button>
              <button
                onClick={() => { setPasswordAction('force_end'); setShowPasswordModal(true); setPasswordInput(''); setPasswordError(false) }}
                className="flex items-center gap-1 px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                <Lock size={14} /> 强制结束（需密码）
              </button>
            </div>
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
            <div className="mt-4 text-center">
              <button
                onClick={handleResetDuty}
                className="flex items-center gap-1 mx-auto px-4 py-2 text-sm bg-stone-400 text-white rounded-lg hover:bg-stone-500"
              >
                <Lock size={14} /> 重置值日（需密码）
              </button>
            </div>
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
                {dutyStudents.map(ds => {
                  const src = ds.source || ''
                  const isManual = src === '手动添加'
                  const sourceLabel = src || '自动'
                  const sourceCls = isManual
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-blue-100 text-blue-600'
                  return (
                  <tr key={ds.id}>
                    <td className="px-4 py-2 text-sm">
                      <span className={`inline-block text-xs px-1 py-0.5 rounded font-medium mr-2 ${sourceCls}`}>{sourceLabel}</span>
                      {ds.student_name}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {ds.sign_in_time ? <Check size={16} className="inline text-green-500" /> : <X size={16} className="inline text-red-400" />}
                    </td>
                    <td className="px-4 py-2 text-center text-xs text-stone-400">
                      {ds.sign_in_time ? new Date(ds.sign_in_time).toLocaleTimeString('zh-CN') : '-'}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* 学生选择弹窗 */}
      <StudentPickerModal
        open={showStudentPicker}
        onClose={() => setShowStudentPicker(false)}
        title="选择值日学生"
        students={allStudents}
        excludeIds={dutyStudents.map(d => d.student_id)}
        onSelect={handleAddStudent}
      />

      {/* 密码弹窗 */}
      <Modal open={showPasswordModal} onClose={() => { setShowPasswordModal(false); setPasswordInput(''); setPasswordError(false); setPasswordAction(null) }} title={passwordAction === 'reset_duty' ? '重置值日' : '强制结束倒计时'} width="sm">
        <p className="text-sm text-stone-500 mb-3">
          {passwordAction === 'reset_duty' ? '请输入管理员密码以重置值日，将删除本次记录并还原已扣积分' : '请输入管理员密码以强制结束倒计时'}
        </p>
        <input
          type="password"
          value={passwordInput}
          onChange={e => { setPasswordInput(e.target.value); setPasswordError(false) }}
          onKeyDown={e => e.key === 'Enter' && passwordInput && handlePasswordConfirm()}
          placeholder="输入密码"
          className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 ${passwordError ? 'border-red-400' : ''}`}
          autoFocus
        />
        {passwordError && (
          <p className="text-xs text-red-500 mt-1">密码错误，请重试</p>
        )}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => { setShowPasswordModal(false); setPasswordInput(''); setPasswordError(false); setPasswordAction(null) }}
            className="flex-1 py-2 text-sm border rounded-lg hover:bg-stone-50"
          >
            取消
          </button>
          <button
            onClick={handlePasswordConfirm}
            className="flex-1 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
          >
            {passwordAction === 'reset_duty' ? '确认重置值日' : '确认结束'}
          </button>
        </div>
      </Modal>

    </div>
  )
}
