import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Clock, LogIn, AlertTriangle, Check, Lock, Settings } from 'lucide-react'
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
  const [showSettings, setShowSettings] = useState(false)
  const [dutyDuration, setDutyDuration] = useState(dutyApi.DUTY_DURATION_MINUTES)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const signInRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const durationRef = useRef(dutyApi.DUTY_DURATION_MINUTES)

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
      // 签到窗口已过期但未关闭
      setWindowState('signing_in')
      setSignInRemaining(0)
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

    // idle 状态时自动填入违规学生
    if (!record.countdown_started_at && !record.sign_in_window_start) {
      await dutyApi.autoAssignDutyStudents(date)
      const updatedDs = await dutyApi.getDutyStudents(record.id)
      setDutyStudents(updatedDs)
    }

    setLoading(false)
  }, [date])

  useEffect(() => { loadData() }, [loadData])

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
    await dutyApi.openSignInWindow(date)
    const record = await dutyApi.getDutyRecord(date)
    setDutyRecord(record)
    setWindowState('signing_in')
    setSignInRemaining(dutyApi.SIGN_IN_WINDOW_SECONDS)
  }

  const handleSignInWindowEnd = async () => {
    if (!dutyRecord) return
    await dutyApi.closeSignInWindow(date)
    const result = await dutyApi.applyPenalty(dutyRecord.id, date)
    setPenalties(result)
    setWindowState('finished')
    const ds = await dutyApi.getDutyStudents(dutyRecord.id)
    setDutyStudents(ds)
  }

  const handleForceEnd = async () => {
    if (passwordInput !== dutyApi.DUTY_PASSWORD) {
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

  // 添加/移除值日学生
  const handleAddStudent = async (studentId: string, studentName: string) => {
    if (!dutyRecord) return
    await dutyApi.addDutyStudent(dutyRecord.id, studentId, studentName)
    const ds = await dutyApi.getDutyStudents(dutyRecord.id)
    setDutyStudents(ds)
  }

  const handleRemoveStudent = async (dsId: string) => {
    await dutyApi.removeDutyStudent(dsId)
    setDutyStudents(prev => prev.filter(d => d.id !== dsId))
  }

  // 开始值日
  const handleStartDuty = async () => {
    if (dutyStudents.length === 0) return alert('值日名单为空')
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
    return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
  }

  const signedInCount = dutyStudents.filter(d => d.sign_in_time).length

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">值日管理</h1>

        {/* 日期选择 */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)) }} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
          <span className="text-lg font-medium min-w-[180px] text-center">{date}</span>
          <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d.toISOString().slice(0, 10)) }} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight size={20} /></button>
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
                    isCurrent ? 'bg-primary-500 text-white' : isActive ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    <Icon size={14} /> {step.label}
                  </div>
                  {i < 2 && <div className={`w-8 h-0.5 ${isActive ? 'bg-primary-300' : 'bg-gray-200'}`} />}
                </div>
              )
            })}
          </div>
        )}

        {/* 值日设置 — 始终可见 */}
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 w-full"
          >
            <Settings size={16} />
            值日设置
            <span className="text-xs text-gray-400 ml-auto">{showSettings ? '收起' : '展开'}</span>
          </button>
          {showSettings && (
            <div className="mt-4 pt-4 border-t space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">管理员密码</label>
                <div className="flex items-center gap-2">
                  <code className="bg-gray-100 px-3 py-1.5 rounded text-sm font-mono select-all">{dutyApi.DUTY_PASSWORD}</code>
                  <span className="text-xs text-gray-400">强制结束倒计时时需输入此密码</span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">倒计时时长（分钟）</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={dutyDuration}
                  onChange={e => {
                    const v = Math.max(1, Math.min(120, parseInt(e.target.value) || 1))
                    setDutyDuration(v)
                    durationRef.current = v
                  }}
                  className="w-24 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
                <span className="text-xs text-gray-400 ml-2">范围 1-120 分钟</span>
              </div>
            </div>
          )}
        </div>

        {/* idle: 值日名单管理 */}
        {windowState === 'idle' && (
          <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-700">值日名单 ({dutyStudents.length}人)</h2>
              <button
                onClick={() => setShowStudentPicker(true)}
                className="flex items-center gap-1 text-sm px-3 py-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
              >
                <Plus size={14} /> 添加学生
              </button>
            </div>

            {dutyStudents.length === 0 ? (
              <p className="text-center text-gray-400 py-4 text-sm">
                系统已自动扫描当日考勤迟到和作业未交的同学<br />
                也可手动添加学生
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {dutyStudents.map(ds => (
                  <span key={ds.id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-sm px-2 py-1 rounded">
                    {ds.student_name}
                    <button onClick={() => handleRemoveStudent(ds.id)} className="hover:text-red-500"><X size={14} /></button>
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
                      : 'bg-white text-gray-700 hover:bg-green-100 hover:text-green-700 border border-blue-200'
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
              已签到：{signedInCount}/{dutyStudents.length} | 超时未签到将被扣1分
            </p>
          </div>
        )}

        {/* 完成状态 */}
        {windowState === 'finished' && (
          <div className="bg-gray-50 border rounded-xl p-6 mb-4 text-center">
            <Check size={48} className="mx-auto mb-2 text-green-500" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">值日流程已完成</h3>
            <p className="text-gray-500 text-sm">
              签到 {signedInCount}/{dutyStudents.length} 人
            </p>
            {penalties.length > 0 && (
              <div className="mt-4 bg-red-50 rounded-lg p-3 text-left">
                <p className="text-sm font-medium text-red-700 flex items-center gap-1 mb-2">
                  <AlertTriangle size={14} /> 自动扣分记录
                </p>
                {penalties.map((p, i) => (
                  <p key={i} className="text-sm text-red-600">{p.name}：未签到，扣除 {p.penalty} 分</p>
                ))}
              </div>
            )}
            {penalties.length === 0 && dutyStudents.length > 0 && (
              <p className="text-green-600 text-sm mt-2">全部已签到，无人被扣分</p>
            )}
          </div>
        )}

        {/* 签到窗口期间显示实时状态表 */}
        {windowState === 'signing_in' && (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">姓名</th>
                  <th className="text-center px-4 py-2 text-sm font-medium text-gray-500">签到</th>
                  <th className="text-center px-4 py-2 text-sm font-medium text-gray-500">签到时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dutyStudents.map(ds => (
                  <tr key={ds.id}>
                    <td className="px-4 py-2 text-sm">{ds.student_name}</td>
                    <td className="px-4 py-2 text-center">
                      {ds.sign_in_time ? <Check size={16} className="inline text-green-500" /> : <X size={16} className="inline text-red-400" />}
                    </td>
                    <td className="px-4 py-2 text-center text-xs text-gray-400">
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
      {showStudentPicker && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 max-h-[70vh] shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">选择值日学生</h3>
              <button onClick={() => setShowStudentPicker(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="flex-1 overflow-auto space-y-1">
              {availableStudents.length === 0 ? (
                <p className="text-center text-gray-400 py-4">所有学生已添加</p>
              ) : (
                availableStudents.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleAddStudent(s.id, s.name)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm flex items-center justify-between"
                  >
                    <span>{s.name}</span>
                    <span className="text-xs text-gray-400">{(() => { const g = groupMap.get(s.group_id); return g ? `${g.name}${g.leader_name ? `（${g.leader_name}）` : ''}` : (s.group_name || '-'); })()}</span>
                  </button>
                ))
              )}
            </div>
            <button
              onClick={() => setShowStudentPicker(false)}
              className="mt-4 w-full py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
            >
              完成
            </button>
          </div>
        </div>
      )}

      {/* 密码弹窗 */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-80 shadow-xl">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Lock size={18} /> 强制结束倒计时
            </h3>
            <p className="text-sm text-gray-500 mb-3">请输入管理员密码以强制结束倒计时</p>
            <p className="text-xs text-gray-400 mb-3">提示：默认密码为 <code className="bg-gray-100 px-1 rounded select-all">{dutyApi.DUTY_PASSWORD}</code></p>
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
                className="flex-1 py-2 text-sm border rounded-lg hover:bg-gray-50"
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
          </div>
        </div>
      )}
    </div>
  )
}
