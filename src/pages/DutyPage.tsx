import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Clock, LogIn, LogOut, AlertTriangle, Check } from 'lucide-react'
import * as dutyApi from '@/lib/duty'
import * as studentApi from '@/lib/students'
import * as groupApi from '@/lib/groups'
import type { DutyRecord, DutyStudent, StudentWithGroup, Group } from '@/types'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type WindowState = 'idle' | 'signing_in' | 'counting_down' | 'signing_out' | 'finished'

export default function DutyPage() {
  const [date, setDate] = useState(todayStr())
  const [dutyRecord, setDutyRecord] = useState<DutyRecord | null>(null)
  const [dutyStudents, setDutyStudents] = useState<DutyStudent[]>([])
  const [allStudents, setAllStudents] = useState<StudentWithGroup[]>([])
  const [groupMap, setGroupMap] = useState<Map<string, Group>>(new Map())
  const [windowState, setWindowState] = useState<WindowState>('idle')
  const [countdown, setCountdown] = useState(300) // 5分钟秒数
  const [signOutRemaining, setSignOutRemaining] = useState(300)
  const [penalties, setPenalties] = useState<{ name: string; penalty: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [showStudentPicker, setShowStudentPicker] = useState(false)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const signOutRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
    if (record.sign_out_window_end) {
      setWindowState('finished')
      // 检查是否有扣分
      const hasPenalties = ds.some(d => d.penalty_applied)
      if (hasPenalties) {
        setPenalties(ds.filter(d => d.penalty_applied).map(d => ({ name: d.student_name, penalty: 1 })))
      }
    } else if (record.sign_out_window_start && record.sign_out_window_start + 300000 > Date.now()) {
      setWindowState('signing_out')
      const remaining = Math.max(0, Math.ceil((record.sign_out_window_start + 300000 - Date.now()) / 1000))
      setSignOutRemaining(remaining)
    } else if (record.countdown_started_at && record.countdown_started_at + 300000 > Date.now()) {
      setWindowState('counting_down')
      const remaining = Math.max(0, Math.ceil((record.countdown_started_at + 300000 - Date.now()) / 1000))
      setCountdown(remaining)
    } else if (record.sign_in_window_start && !record.sign_in_window_end) {
      setWindowState('signing_in')
    } else if (record.countdown_started_at) {
      // 倒计时已经过期但没有签退窗口 - 开启签退窗口
      setWindowState('signing_out')
      setSignOutRemaining(300)
      // 自动开启签退窗口
      const updatedRecord = await dutyApi.openSignOutWindow(date)
      setDutyRecord(updatedRecord)
    }

    setLoading(false)
  }, [date])

  useEffect(() => { loadData() }, [loadData])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (signOutRef.current) clearInterval(signOutRef.current)
    }
  }, [])

  // 倒计时逻辑
  useEffect(() => {
    if (windowState === 'counting_down' && countdown > 0) {
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            // 倒计时结束 → 自动开启签退窗口
            clearInterval(countdownRef.current!)
            handleOpenSignOut()
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
    }
  }, [windowState])

  // 签退倒计时
  useEffect(() => {
    if (windowState === 'signing_out' && signOutRemaining > 0) {
      signOutRef.current = setInterval(() => {
        setSignOutRemaining(prev => {
          if (prev <= 1) {
            clearInterval(signOutRef.current!)
            handleFinishSignOut()
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => { if (signOutRef.current) clearInterval(signOutRef.current) }
    }
  }, [windowState])

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

  // 签到窗口操作
  const handleOpenSignIn = async () => {
    if (dutyStudents.length === 0) return alert('请先添加值日学生')
    const record = await dutyApi.openSignInWindow(date)
    setDutyRecord(record)
    setWindowState('signing_in')
  }

  const handleCloseSignIn = async () => {
    const record = await dutyApi.closeSignInStartCountdown(date)
    setDutyRecord(record)
    setWindowState('counting_down')
    setCountdown(300)
  }

  const handleStudentSignIn = async (dsId: string) => {
    await dutyApi.studentSignIn(dsId)
    setDutyStudents(prev =>
      prev.map(d => d.id === dsId ? { ...d, sign_in_time: Date.now() } : d)
    )
  }

  // 签退窗口操作
  const handleOpenSignOut = async () => {
    const record = await dutyApi.openSignOutWindow(date)
    setDutyRecord(record)
    setWindowState('signing_out')
    setSignOutRemaining(300)
  }

  const handleStudentSignOut = async (dsId: string) => {
    await dutyApi.studentSignOut(dsId)
    setDutyStudents(prev =>
      prev.map(d => d.id === dsId ? { ...d, sign_out_time: Date.now() } : d)
    )
  }

  const handleFinishSignOut = async () => {
    if (!dutyRecord) return
    await dutyApi.closeSignOutWindow(date)
    const result = await dutyApi.applyPenalty(dutyRecord.id, date)
    setPenalties(result)
    setWindowState('finished')
    // 重新加载学生数据以反映扣分
    const ds = await dutyApi.getDutyStudents(dutyRecord.id)
    setDutyStudents(ds)
  }

  // 格式化倒计时
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  // 学生是否可选（排除已在值日名单中的）
  const availableStudents = allStudents.filter(
    s => !dutyStudents.find(d => d.student_id === s.id)
  )

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
  }

  const signedInCount = dutyStudents.filter(d => d.sign_in_time).length
  const signedOutCount = dutyStudents.filter(d => d.sign_out_time).length

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

        {/* 值日名单管理（仅在idle状态） */}
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
              <p className="text-center text-gray-400 py-4 text-sm">尚未添加值日学生</p>
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
              onClick={handleOpenSignIn}
              disabled={dutyStudents.length === 0}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 font-medium"
            >
              <LogIn size={18} /> 开始签到
            </button>
          </div>
        )}

        {/* 签到窗口 */}
        {(windowState === 'signing_in' || windowState === 'counting_down' || windowState === 'signing_out' || windowState === 'finished') && (
          <>
            {/* 进度条 */}
            <div className="flex items-center gap-2 mb-4 text-sm">
              {[
                { state: 'signing_in', label: '签到', icon: LogIn },
                { state: 'counting_down', label: '倒计时', icon: Clock },
                { state: 'signing_out', label: '签退', icon: LogOut },
                { state: 'finished', label: '完成', icon: Check },
              ].map((step, i) => {
                const stepOrder = ['signing_in', 'counting_down', 'signing_out', 'finished']
                const currentIdx = stepOrder.indexOf(windowState === 'finished' ? 'finished' : windowState)
                const isActive = stepOrder.indexOf(step.state) <= currentIdx
                const isCurrent = step.state === (windowState === 'finished' ? 'finished' :
                  windowState === 'counting_down' ? 'counting_down' :
                  windowState === 'signing_out' ? 'signing_out' : 'signing_in')
                const Icon = step.icon
                return (
                  <div key={step.state} className="flex items-center gap-2">
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      isCurrent ? 'bg-primary-500 text-white' : isActive ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      <Icon size={14} /> {step.label}
                    </div>
                    {i < 3 && <div className={`w-8 h-0.5 ${isActive ? 'bg-primary-300' : 'bg-gray-200'}`} />}
                  </div>
                )
              })}
            </div>

            {/* 倒计时显示 */}
            {windowState === 'counting_down' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-4 text-center">
                <Clock size={48} className="mx-auto mb-2 text-yellow-500" />
                <div className={`text-4xl font-mono font-bold mb-2 ${countdown <= 30 ? 'text-red-500 animate-pulse' : 'text-yellow-600'}`}>
                  {formatTime(countdown)}
                </div>
                <p className="text-yellow-700">等待中，5分钟后自动开启签退窗口</p>
              </div>
            )}

            {/* 签到窗口内容 */}
            {windowState === 'signing_in' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-blue-800 flex items-center gap-2">
                    <LogIn size={20} /> 签到窗口已开启
                  </h2>
                  <button
                    onClick={handleCloseSignIn}
                    className="px-4 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
                  >
                    结束签到，开始倒计时
                  </button>
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
                  已签到：{signedInCount}/{dutyStudents.length}
                </p>
              </div>
            )}

            {/* 签退窗口内容 */}
            {windowState === 'signing_out' && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-orange-800 flex items-center gap-2">
                    <LogOut size={20} /> 签退窗口 - 剩余 {formatTime(signOutRemaining)}
                  </h2>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {dutyStudents.map(ds => (
                    <button
                      key={ds.id}
                      onClick={() => ds.sign_in_time && !ds.sign_out_time && handleStudentSignOut(ds.id)}
                      disabled={!ds.sign_in_time || !!ds.sign_out_time}
                      className={`p-3 rounded-lg text-center text-sm font-medium transition-colors ${
                        ds.sign_out_time
                          ? 'bg-green-200 text-green-800 cursor-default'
                          : ds.sign_in_time
                            ? 'bg-white text-gray-700 hover:bg-orange-100 hover:text-orange-700 border border-orange-200'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {ds.sign_out_time ? (
                        <span className="flex items-center justify-center gap-1">
                          <Check size={14} /> {ds.student_name}
                        </span>
                      ) : !ds.sign_in_time ? (
                        <span className="flex items-center justify-center gap-1">
                          <X size={14} /> {ds.student_name} (未签到)
                        </span>
                      ) : ds.student_name}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-orange-500 mt-3">
                  已签退：{signedOutCount}/{dutyStudents.length} | 超时未签退将被扣1分
                </p>
              </div>
            )}

            {/* 完成状态 */}
            {windowState === 'finished' && (
              <div className="bg-gray-50 border rounded-xl p-6 mb-4 text-center">
                <Check size={48} className="mx-auto mb-2 text-green-500" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">值日流程已完成</h3>
                <p className="text-gray-500 text-sm">
                  签到 {signedInCount}/{dutyStudents.length} 人 | 签退 {signedOutCount}/{dutyStudents.length} 人
                </p>
                {penalties.length > 0 && (
                  <div className="mt-4 bg-red-50 rounded-lg p-3 text-left">
                    <p className="text-sm font-medium text-red-700 flex items-center gap-1 mb-2">
                      <AlertTriangle size={14} /> 自动扣分记录
                    </p>
                    {penalties.map((p, i) => (
                      <p key={i} className="text-sm text-red-600">{p.name}：未签退，扣除 {p.penalty} 分</p>
                    ))}
                  </div>
                )}
                {penalties.length === 0 && dutyStudents.length > 0 && (
                  <p className="text-green-600 text-sm mt-2">全部已签退，无人被扣分</p>
                )}
              </div>
            )}

            {/* 实时状态表（倒计时/签退期间显示） */}
            {(windowState === 'counting_down' || windowState === 'signing_out') && (
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">姓名</th>
                      <th className="text-center px-4 py-2 text-sm font-medium text-gray-500">签到</th>
                      <th className="text-center px-4 py-2 text-sm font-medium text-gray-500">签退</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dutyStudents.map(ds => (
                      <tr key={ds.id}>
                        <td className="px-4 py-2 text-sm">{ds.student_name}</td>
                        <td className="px-4 py-2 text-center">
                          {ds.sign_in_time ? <Check size={16} className="inline text-green-500" /> : <X size={16} className="inline text-red-400" />}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {ds.sign_out_time ? <Check size={16} className="inline text-green-500" /> : <X size={16} className="inline text-red-400" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
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
    </div>
  )
}
