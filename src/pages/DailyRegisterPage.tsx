import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Play, Square, Clock, Plus, Trash2, History, X, RotateCcw } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import * as studentApi from '@/lib/students'
import * as groupApi from '@/lib/groups'
import * as winApi from '@/lib/attendance-session'
import * as recApi from '@/lib/attendance-window-records'
import type { StudentWithGroup, Group, AttendanceWindow, AttendanceWindowRecord } from '@/types'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(date: string): string {
  const d = new Date(date)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

type AttendStatus = 'signed' | 'unsigned' | 'late' | 'leave'

const CARD_COLORS: Record<AttendStatus, { card: string; label: string }> = {
  signed:   { card: 'bg-green-500 text-white border-green-600',       label: '已签到' },
  unsigned: { card: 'bg-white text-gray-700 border-gray-300',         label: '未签到' },
  late:     { card: 'bg-red-500 text-white border-red-600',           label: '迟到' },
  leave:    { card: 'bg-orange-500 text-white border-orange-600',     label: '请假' },
}

const DEFAULT_START = '07:10'
const DEFAULT_END = '07:40'

function parseTime(time: string): [number, number] {
  const [h, m] = time.split(':').map(Number)
  return [isNaN(h) ? 0 : h, isNaN(m) ? 0 : m]
}

function TimeInput({ time, onChange, disabled }: {
  time: string
  onChange: (val: string) => void
  disabled?: boolean
}) {
  const [h, m] = parseTime(time)
  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div className="inline-flex items-center gap-0.5 border rounded-lg bg-white px-1 py-1 font-mono text-sm">
      <input
        type="number"
        min={0}
        max={23}
        value={h}
        onChange={e => onChange(`${pad(Number(e.target.value) || 0)}:${pad(m)}`)}
        disabled={disabled}
        className="w-12 text-center focus:outline-none bg-transparent border-0 p-0"
      />
      <span className="text-gray-400">:</span>
      <input
        type="number"
        min={0}
        max={59}
        step={5}
        value={m}
        onChange={e => onChange(`${pad(h)}:${pad(Number(e.target.value) || 0)}`)}
        disabled={disabled}
        className="w-12 text-center focus:outline-none bg-transparent border-0 p-0"
      />
    </div>
  )
}

export default function DailyRegisterPage() {
  const { confirm } = useConfirm()
  const [date, setDate] = useState(todayStr())
  const [students, setStudents] = useState<StudentWithGroup[]>([])
  const [groupMap, setGroupMap] = useState<Map<string, Group>>(new Map())
  const [windows, setWindows] = useState<AttendanceWindow[]>([])
  const [windowRecords, setWindowRecords] = useState<Map<string, AttendanceWindowRecord[]>>(new Map())
  const [loading, setLoading] = useState(true)

  const [adminTarget, setAdminTarget] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [historyData, setHistoryData] = useState<{ date: string; late: string[]; leave: string[] }[]>([])

  const [, setTick] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadData = useCallback(async () => {
    const [s, gs, ws] = await Promise.all([
      studentApi.getAllStudents(),
      groupApi.getAllGroups(),
      winApi.getWindows(date),
    ])
    setStudents(s)
    setGroupMap(new Map(gs.map(g => [g.id, g])))

    let finalWindows: AttendanceWindow[]
    if (ws.length === 0) {
      await winApi.addWindow(date, '', DEFAULT_START, DEFAULT_END)
      finalWindows = await winApi.getWindows(date)
    } else {
      // 确保默认时段始终为 07:10-07:40
      const sorted = [...ws].sort((a, b) => a.created_at - b.created_at)
      const defaultWin = sorted[0]
      if (defaultWin.window_start !== DEFAULT_START || defaultWin.window_end !== DEFAULT_END) {
        await winApi.updateWindow(defaultWin.id, DEFAULT_START, DEFAULT_END)
        finalWindows = ws.map(w => w.id === defaultWin.id ? { ...w, window_start: DEFAULT_START, window_end: DEFAULT_END } : w)
      } else {
        finalWindows = ws
      }
    }

    // 清理已过期的活跃窗口
    const now = new Date()
    for (const w of finalWindows) {
      if (w.status === 'active' && w.window_end) {
        const [h, m] = w.window_end.split(':').map(Number)
        const end = new Date(date)
        end.setHours(h, m, 0, 0)
        if (now >= end) {
          await winApi.setWindowStatus(w.id, 'closed')
          finalWindows = finalWindows.map(pw => pw.id === w.id ? { ...pw, status: 'closed' as const } : pw)
        }
      }
    }

    setWindows(finalWindows)
    setLoading(false)
  }, [date])

  useEffect(() => { loadData() }, [loadData])

  // 加载各时段的签到记录
  const loadWindowRecords = useCallback(async () => {
    const map = new Map<string, AttendanceWindowRecord[]>()
    for (const w of windows) {
      const recs = await recApi.getWindowRecords(w.id)
      map.set(w.id, recs)
    }
    setWindowRecords(map)
  }, [windows])

  useEffect(() => { if (windows.length > 0) loadWindowRecords() }, [loadWindowRecords])

  // 倒计时 & 自动结束
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    const hasActive = windows.some(w => w.status === 'active')
    if (hasActive) {
      timerRef.current = setInterval(async () => {
        setTick(t => t + 1)
        for (const w of windows) {
          if (w.status !== 'active' || !w.window_end) continue
          const now = new Date()
          const [h, m] = w.window_end.split(':').map(Number)
          const end = new Date(date)
          end.setHours(h, m, 0, 0)
          if (now >= end) {
            await winApi.setWindowStatus(w.id, 'closed')
            setWindows(prev => prev.map(pw => pw.id === w.id ? { ...pw, status: 'closed' as const } : pw))
          }
        }
      }, 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [windows.some(w => w.status === 'active')])

  // 当前活跃时段，或最近一个已结束/空闲的时段
  const activeWin = windows.find(w => w.status === 'active')
  const displayWin = activeWin || [...windows].sort((a, b) => b.updated_at - a.updated_at)[0]

  const getAttendStatus = (studentId: string): AttendStatus => {
    if (!displayWin) return 'unsigned'
    const recs = windowRecords.get(displayWin.id) || []
    const rec = recs.find(r => r.student_id === studentId)
    if (!rec) return 'unsigned'
    const val = rec.status
    if (val === 'signed' || val === 'unsigned' || val === 'late' || val === 'leave') return val
    return 'unsigned'
  }

  const handleAddWindow = async () => {
    await winApi.addWindow(date, '', '08:00', '08:30')
    const ws = await winApi.getWindows(date)
    setWindows(ws)
  }

  const handleDeleteWindow = async (id: string) => {
    await winApi.deleteWindow(id)
    setWindows(prev => prev.filter(w => w.id !== id))
  }

  const handleResetWindow = async (w: AttendanceWindow) => {
    if (!await confirm({ message: `确认重置"${w.label || `${w.window_start}-${w.window_end}`}"？\n\n所有签到记录将被清除，迟到扣分将被撤销。` })) return
    await winApi.resetAttendanceWindow(w.id)
    const ws = await winApi.getWindows(date)
    setWindows(ws)
    const recs = await recApi.getWindowRecords(w.id)
    setWindowRecords(prev => { const next = new Map(prev); next.set(w.id, recs); return next })
  }

  const handleSaveWindow = async (id: string, start: string, end: string) => {
    await winApi.updateWindow(id, start, end)
    setWindows(prev => prev.map(w => w.id === id ? { ...w, window_start: start, window_end: end } : w))
  }

  const handleStart = async (w: AttendanceWindow) => {
    // 为新时段初始化所有学生为 unsigned
    await recApi.initWindowRecords(w.id, students.map(s => s.id))
    await winApi.setWindowStatus(w.id, 'active')
    setWindows(prev => prev.map(pw => pw.id === w.id ? { ...pw, status: 'active' as const } : pw))
    // 刷新记录
    const recs = await recApi.getWindowRecords(w.id)
    setWindowRecords(prev => { const next = new Map(prev); next.set(w.id, recs); return next })
  }

  const handleStop = async (id: string) => {
    await winApi.setWindowStatus(id, 'closed')
    setWindows(prev => prev.map(w => w.id === id ? { ...w, status: 'closed' as const } : w))
  }

  const handleSignIn = async (studentId: string) => {
    if (!activeWin) return
    await recApi.upsertWindowRecord(activeWin.id, studentId, 'signed')
    setWindowRecords(prev => {
      const next = new Map(prev)
      const recs = [...(next.get(activeWin.id) || [])]
      const idx = recs.findIndex(r => r.student_id === studentId)
      if (idx >= 0) recs[idx] = { ...recs[idx], status: 'signed' as const }
      else recs.push({ id: '', window_id: activeWin.id, student_id: studentId, status: 'signed', updated_at: Date.now() })
      next.set(activeWin.id, recs)
      return next
    })
  }

  const handleCancelSignIn = async (studentId: string) => {
    if (!activeWin) return
    await recApi.upsertWindowRecord(activeWin.id, studentId, 'unsigned')
    setWindowRecords(prev => {
      const next = new Map(prev)
      const recs = [...(next.get(activeWin.id) || [])]
      const idx = recs.findIndex(r => r.student_id === studentId)
      if (idx >= 0) recs[idx] = { ...recs[idx], status: 'unsigned' as const }
      next.set(activeWin.id, recs)
      return next
    })
  }

  const handleAdminSet = async (studentId: string, value: 'late' | 'leave') => {
    if (!displayWin) return
    await recApi.upsertWindowRecord(displayWin.id, studentId, value)
    setWindowRecords(prev => {
      const next = new Map(prev)
      const recs = [...(next.get(displayWin.id) || [])]
      const idx = recs.findIndex(r => r.student_id === studentId)
      if (idx >= 0) recs[idx] = { ...recs[idx], status: value as 'signed' | 'unsigned' | 'late' | 'leave' }
      else recs.push({ id: '', window_id: displayWin.id, student_id: studentId, status: value, updated_at: Date.now() })
      next.set(displayWin.id, recs)
      return next
    })
    setAdminTarget(null)
  }

  const changeDate = (days: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }

  const openHistory = async () => {
    const [s] = await Promise.all([studentApi.getAllStudents()])
    const nameMap = new Map(s.map(x => [x.id, x.name]))
    const allWin = await winApi.getAllWindows()
    // 按日期分组
    const byDate = new Map<string, { late: string[]; leave: string[] }>()
    for (const w of allWin) {
      const recs = await recApi.getWindowRecords(w.id)
      let entry = byDate.get(w.date)
      if (!entry) { entry = { late: [], leave: [] }; byDate.set(w.date, entry) }
      recs.forEach(r => {
        const name = nameMap.get(r.student_id) || r.student_id
        if (r.status === 'late' && !entry!.late.includes(name)) entry!.late.push(name)
        if (r.status === 'leave' && !entry!.leave.includes(name)) entry!.leave.push(name)
      })
    }
    const results = [...byDate.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => b.date.localeCompare(a.date))
    setHistoryData(results)
    setShowHistory(true)
  }

  const counts = { signed: 0, unsigned: 0, late: 0, leave: 0 }
  students.forEach(s => { counts[getAttendStatus(s.id)]++ })

  const anyActive = windows.some(w => w.status === 'active')
  const allIdle = windows.every(w => w.status === 'idle' || !w.status)

  // 检查当前时间是否在任意考勤时段的时间范围内
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const isWithinAnyWindow = windows.some(w => {
    if (!w.window_start || !w.window_end) return false
    const [sh, sm] = w.window_start.split(':').map(Number)
    const [eh, em] = w.window_end.split(':').map(Number)
    return currentMinutes >= sh * 60 + sm && currentMinutes < eh * 60 + em
  })
  const outsideAllWindows = windows.length > 0 && !anyActive && !isWithinAnyWindow

  const remainingSeconds = (() => {
    if (!activeWin?.window_end) return 0
    const now = new Date()
    const [h, m] = activeWin.window_end.split(':').map(Number)
    const end = new Date(date)
    end.setHours(h, m, 0, 0)
    return Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000))
  })()
  const remainingDisplay = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
  }

  // 默认时段 ID（第一个创建的）
  const defaultWinId = windows.length > 0 ? [...windows].sort((a, b) => a.created_at - b.created_at)[0].id : null

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800">每日考勤</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronLeft size={20} />
            </button>
            <span className="text-lg font-medium min-w-[160px] text-center">{formatDate(date)}</span>
            <button onClick={() => changeDate(1)} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronRight size={20} />
            </button>
            <button
              onClick={() => setDate(todayStr())}
              className="px-3 py-1 text-sm text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50"
            >
              今天
            </button>
            <button
              onClick={openHistory}
              className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
            >
              <History size={14} /> 历史
            </button>
          </div>
        </div>

        {/* 考勤时段列表 */}
        <div className="space-y-3 mb-4">
          {windows.map(w => {
            const isActive = w.status === 'active'
            const isClosed = w.status === 'closed'
            const isDefault = w.id === defaultWinId
            return (
              <div key={w.id} className={`rounded-xl border-2 p-4 ${
                isActive ? 'bg-green-50 border-green-300' : isClosed ? 'bg-gray-50 border-gray-300' : 'bg-blue-50 border-blue-200'
              }`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium text-gray-600">
                    {isDefault ? '默认时段' : '时段'}：
                  </span>
                  <TimeInput
                    time={w.window_start || DEFAULT_START}
                    onChange={val => handleSaveWindow(w.id, val, w.window_end || DEFAULT_END)}
                    disabled={isActive || isDefault}
                  />
                  <span className="text-gray-400">—</span>
                  <TimeInput
                    time={w.window_end || DEFAULT_END}
                    onChange={val => handleSaveWindow(w.id, w.window_start || DEFAULT_START, val)}
                    disabled={isActive || isDefault}
                  />
                  {w.status === 'idle' || !w.status ? (
                    <button
                      onClick={() => handleStart(w)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600"
                    >
                      <Play size={14} /> 开始
                    </button>
                  ) : isActive ? (
                    <>
                      <span className="flex items-center gap-1 text-green-600 font-bold text-lg font-mono">
                        <Clock size={16} /> {remainingDisplay}
                      </span>
                      <button
                        onClick={() => handleStop(w.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
                      >
                        <Square size={12} /> 结束
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">已结束</span>
                      <button
                        onClick={() => handleStart(w)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                      >
                        <Play size={14} /> 重新开始
                      </button>
                      <button
                        onClick={() => handleResetWindow(w)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm border border-orange-200 text-orange-600 rounded-lg hover:bg-orange-50"
                      >
                        <RotateCcw size={14} /> 重置
                      </button>
                    </div>
                  )}
                  {!isActive && !isDefault && (
                    <button onClick={() => handleDeleteWindow(w.id)} className="p-1 text-gray-300 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          <button
            onClick={handleAddWindow}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 border-2 border-dashed border-blue-300 rounded-lg hover:bg-blue-50"
          >
            <Plus size={14} /> 添加时段
          </button>
        </div>

        {/* 状态统计 */}
        <div className="flex gap-3 mb-4 text-sm">
          {(['signed', 'unsigned', 'late', 'leave'] as AttendStatus[]).map(status => (
            <div key={status} className={`px-3 py-1 rounded-full text-xs font-medium ${CARD_COLORS[status].card}`}>
              {CARD_COLORS[status].label} {counts[status]}
            </div>
          ))}
        </div>

        {/* 按小组分框 */}
        {[...groupMap.values()].sort((a, b) => a.sort_order - b.sort_order).map(group => {
          const groupStudents = students.filter(s => s.group_id === group.id)
          if (groupStudents.length === 0) return null
          return (
            <div key={group.id} className="mb-4 bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
              <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${group.color}`} />
                <span className="text-sm font-semibold text-gray-700">
                  {group.name}{group.leader_name ? `（${group.leader_name}）` : ''}
                </span>
                <span className="text-xs text-gray-400">{groupStudents.length}人</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 p-3">
                {groupStudents.map(s => {
                  const status = getAttendStatus(s.id)
                  const cfg = CARD_COLORS[status]
                  const clickableForSignin = anyActive && status === 'unsigned'
                  const clickableForCancel = anyActive && status === 'signed'
                  const clickableForAdmin = (!anyActive || !activeWin) && (status === 'unsigned' || status === 'late' || status === 'leave')

                  return (
                    <div key={s.id} className="relative">
                      <button
                        onClick={() => {
                          if (clickableForSignin) {
                            handleSignIn(s.id)
                          } else if (clickableForCancel) {
                            handleCancelSignIn(s.id)
                          } else if (clickableForAdmin) {
                            setAdminTarget(s.id)
                          }
                        }}
                        disabled={!clickableForSignin && !clickableForCancel && !clickableForAdmin}
                        title={clickableForCancel ? '点击取消签到' : undefined}
                        className={`w-full rounded-lg border-2 p-3 text-center transition-all ${
                          `${cfg.card} ${clickableForSignin || clickableForCancel || clickableForAdmin ? 'shadow-sm hover:shadow-md hover:scale-105 cursor-pointer' : ''}`
                        }`}
                      >
                        <div className="text-sm font-bold">{s.name}</div>
                      </button>

                      {adminTarget === s.id && (
                        <div className="absolute top-0 left-0 right-0 bottom-0 bg-white rounded-lg border-2 border-gray-400 shadow-xl flex flex-col items-center justify-center gap-1 p-1 z-10">
                          <button
                            onClick={() => handleAdminSet(s.id, 'late')}
                            className="w-full text-xs py-1.5 bg-red-100 text-red-700 rounded font-medium hover:bg-red-200"
                          >
                            迟到
                          </button>
                          <button
                            onClick={() => handleAdminSet(s.id, 'leave')}
                            className="w-full text-xs py-1.5 bg-orange-100 text-orange-700 rounded font-medium hover:bg-orange-200"
                          >
                            请假
                          </button>
                          <button
                            onClick={() => setAdminTarget(null)}
                            className="w-full text-xs py-1 text-gray-400 hover:text-gray-600"
                          >
                            取消
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {students.length === 0 && (
          <div className="text-center py-12 text-gray-400">暂无学生数据</div>
        )}

        <p className="text-xs text-gray-400 mt-3">
          {anyActive
            ? '考勤进行中 — 点击白色卡片签到，点击绿色卡片可取消签到，到时间自动结束'
            : '考勤未开始或已结束 — 点击卡片可随时标记迟到或请假'}
          {' · '}共 {students.length} 名学生
        </p>
      </div>

      {/* 历史查询弹窗 */}
      <Modal open={showHistory} onClose={() => setShowHistory(false)} title="考勤历史">
        {historyData.length === 0 ? (
          <p className="text-center text-gray-400 py-8">暂无迟到或请假记录</p>
        ) : (
          <div className="space-y-3">
            {historyData.map(d => (
              <div key={d.date} className="border rounded-lg p-3">
                <div className="text-sm font-semibold text-gray-700 mb-2">{d.date}</div>
                {d.late.length > 0 && (
                  <div className="flex items-start gap-2 text-xs mb-1">
                    <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium shrink-0">迟到</span>
                    <span className="text-gray-600">{d.late.join('、')}</span>
                  </div>
                )}
                {d.leave.length > 0 && (
                  <div className="flex items-start gap-2 text-xs">
                    <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium shrink-0">请假</span>
                    <span className="text-gray-600">{d.leave.join('、')}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setShowHistory(false)} className="mt-4 w-full py-2 text-gray-600 border rounded-lg hover:bg-gray-50">关闭</button>
      </Modal>
    </div>
  )
}
