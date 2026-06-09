import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Users, Coins, Medal, AlertTriangle, CheckCircle, Calculator, Pin, Shield, CalendarDays, GripVertical
} from 'lucide-react'
import * as groupApi from '@/lib/groups'
import * as studentApi from '@/lib/students'
import * as dutyApi from '@/lib/duty'
import * as mathHomeworkApi from '@/lib/math-homework'
import * as coinsApi from '@/lib/coins'
import * as rosterApi from '@/lib/duty-roster'
import { getRecordsByDate } from '@/lib/homework'
import * as winApi from '@/lib/attendance-session'
import * as recApi from '@/lib/attendance-window-records'
import { getDailyStatuses } from '@/lib/daily-status'
import { getRosterStudents, getSignIns, type PracticeLabel } from '@/lib/practice-roster'
import { queryAll } from '@/lib/db'
import type { Group, StudentWithGroup, DailyStatus, CoinGroup, MathHomeworkGradeWithStudent, AttendanceWindow, AttendanceWindowRecord, DutyStudent, DutyRosterEntry } from '@/types'
import { WEEKDAY_NAMES } from '@/types'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function yesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(date: string): string {
  const d = new Date(date)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

const GlowDot = ({ color }: { color: string }) => (
  <span className={`inline-block w-2 h-2 rounded-full ${color} shadow-[0_0_6px] shadow-current`} />
)

type ModuleId = 'committee' | 'attendance' | 'group-ranking' | 'homework' | 'daily-practice' | 'deductions' | 'math-homework' | 'duty' | 'coins'

const DEFAULT_MODULE_ORDER: ModuleId[] = ['committee', 'attendance', 'group-ranking', 'homework', 'daily-practice', 'deductions', 'math-homework', 'duty', 'coins']

function loadModuleOrder(): ModuleId[] {
  try {
    const saved = localStorage.getItem('dashboard-order')
    if (saved) {
      const arr = JSON.parse(saved) as ModuleId[]
      const set = new Set(arr)
      for (const id of DEFAULT_MODULE_ORDER) {
        if (!set.has(id)) arr.push(id)
      }
      return arr
    }
  } catch { /* ignore */ }
  return [...DEFAULT_MODULE_ORDER]
}

function saveModuleOrder(order: ModuleId[]): void {
  try {
    localStorage.setItem('dashboard-order', JSON.stringify(order))
  } catch { /* ignore */ }
}

export default function DashboardPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [students, setStudents] = useState<StudentWithGroup[]>([])
  const [todayStatuses, setTodayStatuses] = useState<DailyStatus[]>([])
  const [coinGroups, setCoinGroups] = useState<CoinGroup[]>([])
  const [topDeductions, setTopDeductions] = useState<{ student_id: string; student_name: string; total_points: number }[]>([])
  const [yesterdayDutyAbsent, setYesterdayDutyAbsent] = useState<string[]>([])
  const [yesterdayHasDuty, setYesterdayHasDuty] = useState(false)
  const [todayDutyStudents, setTodayDutyStudents] = useState<DutyStudent[]>([])
  const [todayHasDuty, setTodayHasDuty] = useState(false)
  const [mathFails, setMathFails] = useState<MathHomeworkGradeWithStudent[]>([])
  const [homeworkRecords, setHomeworkRecords] = useState<{ student_id: string; student_name: string; subject: string; status: string }[]>([])
  const [practiceUnsigned, setPracticeUnsigned] = useState<{ qiangji: { name: string }[]; tisheng: { name: string }[] }>({ qiangji: [], tisheng: [] })
  const [attendanceWindows, setAttendanceWindows] = useState<AttendanceWindow[]>([])
  const [windowRecordsMap, setWindowRecordsMap] = useState<Map<string, AttendanceWindowRecord[]>>(new Map())
  const [dutyRoster, setDutyRoster] = useState<DutyRosterEntry[]>([])
  const location = useLocation()
  const [loading, setLoading] = useState(true)

  const COIN_TARGET = (() => {
    const saved = localStorage.getItem('coin_target')
    return saved ? parseInt(saved, 10) : 15
  })()

  const [moduleOrder, setModuleOrder] = useState<ModuleId[]>(loadModuleOrder)
  const [dragId, setDragId] = useState<ModuleId | null>(null)
  const dragOverIdRef = useRef<ModuleId | null>(null)

  const handleDragStart = (id: ModuleId) => { setDragId(id) }
  const handleDragOver = (e: React.DragEvent, id: ModuleId) => {
    e.preventDefault()
    dragOverIdRef.current = id
  }
  const handleDragLeave = () => { dragOverIdRef.current = null }
  const handleDrop = (id: ModuleId) => {
    if (!dragId || dragId === id) { setDragId(null); return }
    setModuleOrder(prev => {
      const next = [...prev]
      const fromIdx = next.indexOf(dragId)
      const toIdx = next.indexOf(id)
      if (fromIdx === -1 || toIdx === -1) return prev
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, dragId)
      saveModuleOrder(next)
      return next
    })
    setDragId(null)
  }
  const handleDragEnd = () => { setDragId(null) }
  const handleResetOrder = () => {
    setModuleOrder([...DEFAULT_MODULE_ORDER])
    saveModuleOrder([...DEFAULT_MODULE_ORDER])
  }

  const loadData = useCallback(async () => {
    try {
    const date = todayStr()
    const yDate = yesterdayStr()
    const [g, s, st, cg] = await Promise.all([
      groupApi.getAllGroups(),
      studentApi.getAllStudents(),
      getDailyStatuses(date),
      coinsApi.syncCoinGroups(),
    ])
    setGroups(g)
    setStudents(s)
    setTodayStatuses(st)
    setCoinGroups(cg)

    const deds = await queryAll<{ student_id: string; student_name: string; total_points: number }>(
      `SELECT student_id, student_name, SUM(points) as total_points FROM (
        SELECT student_id, student_name, points FROM deduction_records
        UNION ALL
        SELECT student_id, student_name, -delta as points FROM manual_adjust_records WHERE delta < 0
      ) GROUP BY student_id
      ORDER BY total_points DESC LIMIT 5`
    )
    setTopDeductions(deds)

    const yRecord = await dutyApi.getDutyRecord(yDate)
    if (yRecord) {
      setYesterdayHasDuty(true)
      const yStudents = await dutyApi.getDutyStudents(yRecord.id)
      setYesterdayDutyAbsent(yStudents.filter(ds => ds.penalty_applied === 1).map(ds => ds.student_name))
    } else {
      setYesterdayHasDuty(false)
      setYesterdayDutyAbsent([])
    }

    const tRecord = await dutyApi.getDutyRecord(date)
    if (tRecord) {
      setTodayHasDuty(true)
      const tStudents = await dutyApi.getDutyStudents(tRecord.id)
      setTodayDutyStudents(tStudents)
    } else {
      setTodayHasDuty(false)
      setTodayDutyStudents([])
    }

    const mf = await mathHomeworkApi.getFailsByDate(date)
    setMathFails(mf)

    const hwRecords = await getRecordsByDate(date)
    setHomeworkRecords(hwRecords.map(r => ({ student_id: r.student_id, student_name: r.student_name, subject: r.subject, status: r.status })))

    // 每日一练：从 practice_signins 获取未签，按强基/提升分组
    const practiceLabels: PracticeLabel[] = ['qiangji', 'tisheng']
    const pu: { qiangji: { name: string }[]; tisheng: { name: string }[] } = { qiangji: [], tisheng: [] }
    for (const label of practiceLabels) {
      const [roster, signIns] = await Promise.all([
        getRosterStudents(label),
        getSignIns(date, label),
      ])
      const signedIds = new Set(signIns.map(si => si.student_id))
      roster.forEach(s => {
        if (!signedIds.has(s.id)) pu[label].push({ name: s.name })
      })
    }
    setPracticeUnsigned(pu)

    // 考勤时段数据
    const aw = await winApi.getWindows(date)
    setAttendanceWindows(aw)
    const recMap = new Map<string, AttendanceWindowRecord[]>()
    for (const w of aw) {
      recMap.set(w.id, await recApi.getWindowRecords(w.id))
    }
    setWindowRecordsMap(recMap)

    // 班级轮值表
    try {
      const roster = await rosterApi.getAll()
      setDutyRoster(roster)
    } catch { /* ignore */ }

    setLoading(false)
    } catch (err) {
      console.error('❌ Dashboard loadData 出错:', err)
      setLoading(false)
    }
  }, [])

  // 路由变化或首次挂载时加载数据
  useEffect(() => {
    setLoading(true)
    loadData()
  }, [location.pathname])

  // 每30秒轮询刷新，确保数据实时
  useEffect(() => {
    const timer = setInterval(loadData, 30000)
    return () => clearInterval(timer)
  }, [loadData])

  // 切换窗口回来时立即刷新
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) loadData() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadData])

  // 监听数据变更推送（如宝龙币调整后主动刷新）
  useEffect(() => {
    const unsub = window.electronAPI?.onDataChanged?.(() => {
      loadData()
    })
    return () => unsub?.()
  }, [loadData])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#fdfaf3]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
          <span className="text-xs text-stone-400 tracking-widest">加载中</span>
        </div>
      </div>
    )
  }

  const studentMap = new Map(students.map(s => [s.id, s]))
  const groupMap = new Map(groups.map(g => [g.id, g]))

  const lateStudents = todayStatuses
    .filter(s => s.attendance === 'late')
    .map(s => {
      const stu = studentMap.get(s.student_id)
      const grp = stu ? groupMap.get(stu.group_id) : undefined
      return { name: stu?.name || s.student_id, groupName: grp?.name, groupColor: grp?.color, groupLeaderName: grp?.leader_name }
    })

  const leaveStudents = todayStatuses
    .filter(s => s.attendance === 'leave')
    .map(s => {
      const stu = studentMap.get(s.student_id)
      const grp = stu ? groupMap.get(stu.group_id) : undefined
      return { name: stu?.name || s.student_id, groupName: grp?.name, groupColor: grp?.color, groupLeaderName: grp?.leader_name }
    })

  const attendance = {
    signed: todayStatuses.filter(s => s.attendance === 'signed').length,
    late: lateStudents.length,
    leave: leaveStudents.length,
    unsigned: todayStatuses.filter(s => s.attendance === 'unsigned').length,
  }

  // 没有 daily_status 记录的学生视为未签
  const statusStudentIds = new Set(todayStatuses.map(s => s.student_id))
  const studentsWithoutRecord = students.filter(s => !statusStudentIds.has(s.id))

  const unsignedStudents = [
    ...todayStatuses
      .filter(s => s.attendance === 'unsigned')
      .map(s => {
        const stu = studentMap.get(s.student_id)
        const grp = stu ? groupMap.get(stu.group_id) : undefined
        return { name: stu?.name || s.student_id, groupName: grp?.name, groupColor: grp?.color, groupLeaderName: grp?.leader_name }
      }),
    ...studentsWithoutRecord.map(s => {
      const grp = groupMap.get(s.group_id)
      return { name: s.name, groupName: grp?.name, groupColor: grp?.color, groupLeaderName: grp?.leader_name }
    }),
  ]

  const hasAttendanceIssues = attendance.late > 0 || attendance.leave > 0 || unsignedStudents.length > 0
  const noWindowUsed = attendanceWindows.length === 0 || attendanceWindows.every(w => (windowRecordsMap.get(w.id) || []).length === 0)

  // 按学生分组：每个学生对应哪些科目有问题
  // 按科目分组统计作业问题
  const homeworkBySubject = new Map<string, { name: string; status: string }[]>()
  homeworkRecords.forEach(r => {
    const label = r.status === 'incomplete' ? '未交' : '未交齐'
    const list = homeworkBySubject.get(r.subject) || []
    list.push({ name: r.student_name, status: label })
    homeworkBySubject.set(r.subject, list)
  })
  const homeworkSubjects = Array.from(homeworkBySubject.entries())
  const homeworkNotSubmitted = homeworkRecords.filter(r => r.status === 'incomplete').length
  const homeworkIncomplete = homeworkRecords.filter(r => r.status === 'partial').length

  const monitor = dutyRoster.find(e => e.role === 'monitor')
  const todayDow = new Date().getDay()
  const todayRotation = (todayDow >= 1 && todayDow <= 5)
    ? dutyRoster.filter(e => e.role === 'rotation' && e.weekday === todayDow).sort((a, b) => (a.position || 0) - (b.position || 0))
    : []
  const todayCaptainOrVice = (todayDow >= 1 && todayDow <= 3)
    ? dutyRoster.find(e => e.role === 'captain' && e.weekday_group === 'mon_wed')
    : (todayDow >= 4 && todayDow <= 5)
      ? dutyRoster.find(e => e.role === 'vice_captain' && e.weekday_group === 'thu_fri')
      : null
  const todayCaptainLabel = (todayDow >= 1 && todayDow <= 3) ? '队长' : '副队长'

  const rankedGroups = [...groups].sort((a, b) => b.total_score - a.total_score)
  const maxTotalScore = rankedGroups.length > 0 ? rankedGroups[0].total_score : 1
  const totalCoins = coinGroups.reduce((s, cg) => s + (cg.coins || 0), 0)

  const rankMedals = ['🥇', '🥈', '🥉']
  const dateLabel = formatDate(todayStr())

  return (
    <div className="h-full overflow-auto bg-gradient-to-b from-[#fdfaf3] to-[#faf6ee]">
      <div className="p-5 max-w-6xl mx-auto space-y-5">

        {/* ===== Header ===== */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-700 tracking-wide">班级看板</h1>
            <p className="text-xs text-stone-400 mt-0.5 font-mono tabular-nums">{dateLabel}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4 text-xs text-stone-500">
              <span className="flex items-center gap-1.5">
                <Users size={13} /> <span className="tabular-nums font-semibold text-stone-600">{students.length}</span>人
              </span>
              <span className="text-stone-300">|</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" /> <span className="tabular-nums font-semibold text-stone-600">{groups.length}</span>组
              </span>
              <span className="text-stone-300">|</span>
              <span className="flex items-center gap-1.5">
                <Coins size={13} className="text-amber-500" /> <span className="tabular-nums font-mono font-semibold text-amber-600">{totalCoins}</span>
              </span>
            </div>
            {!!window.electronAPI?.widget && (
              <button
                onClick={() => window.electronAPI!.widget!.open()}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 text-xs transition-colors border border-amber-200/60"
                title="打开桌面便签"
              >
                <Pin size={12} /> 桌面便签
              </button>
            )}
            <button
              onClick={handleResetOrder}
              className="px-2 py-1 rounded text-xs text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
              title="重置模块顺序"
            >重置顺序</button>
          </div>
        </div>

        <div className="space-y-5">
          {moduleOrder.filter(id => {
            if (id === 'committee') return monitor || todayCaptainOrVice || todayRotation.length > 0
            return true
          }).map(id => {
            const isDragging = dragId === id
            const dragOver = dragOverIdRef.current === id

            const dragHandle = (
              <div className="absolute top-3 right-3 z-10">
                <div
                  className="flex items-center gap-1 px-1.5 py-1 rounded cursor-grab active:cursor-grabbing hover:bg-stone-100 transition-colors"
                  draggable
                  onDragStart={() => handleDragStart(id)}
                  onDragEnd={handleDragEnd}
                  title="拖拽排序"
                >
                  <GripVertical size={14} className="text-stone-300" />
                </div>
              </div>
            )

            const wrap = (el: React.ReactNode) => (
              <div className="relative" key={id}
                onDragOver={(e) => handleDragOver(e, id)} onDragLeave={handleDragLeave} onDrop={() => handleDrop(id)}>
                <div className={`transition-opacity ${isDragging ? 'opacity-40' : ''}`}>
                  {dragHandle}
                  {el}
                </div>
                {dragOver && !isDragging && (
                  <div className="absolute inset-0 rounded-2xl ring-2 ring-rose-300 pointer-events-none" />
                )}
              </div>
            )

            switch (id) {
              case 'committee':
                return wrap(
                  <div className="relative bg-gradient-to-br from-amber-50/80 via-yellow-50/50 to-white rounded-2xl border-2 border-amber-200/60 overflow-hidden shadow-md">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400" />
                    <div className="p-6 pt-7">
                      <div className="flex items-center justify-center gap-2 mb-6">
                        <CalendarDays size={20} className="text-amber-500" />
                        <h2 className="text-lg font-bold text-amber-700 tracking-wide">班务委员会</h2>
                        {todayDow >= 1 && todayDow <= 5 && (
                          <span className="text-sm text-amber-500 font-medium ml-1 bg-amber-100 px-2 py-0.5 rounded-full">{WEEKDAY_NAMES[todayDow]}</span>
                        )}
                      </div>

                      <div className="flex items-center justify-center flex-wrap gap-8">
                        {monitor && (
                          <div className="flex flex-col items-center gap-2">
                            <div className="relative">
                              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-300 via-yellow-400 to-orange-500 p-[3px] shadow-lg shadow-amber-200">
                                <div className="w-full h-full rounded-full bg-stone-900 flex items-center justify-center overflow-hidden">
                                  {monitor.photo ? (
                                    <img src={monitor.photo} alt={monitor.student_name} className="w-full h-full object-cover" />
                                  ) : (
                                    <Shield size={36} className="text-amber-400" />
                                  )}
                                </div>
                              </div>
                              <div className="absolute -top-1 -right-1 w-7 h-7 bg-amber-400 rounded-full flex items-center justify-center shadow-md">
                                <span className="text-stone-800 text-xs">👑</span>
                              </div>
                            </div>
                            <span className="text-xs font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">班长</span>
                            <span className="text-base font-bold text-stone-800">{monitor.student_name}</span>
                          </div>
                        )}

                        {todayCaptainOrVice && (
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-200 to-amber-400 p-[3px] shadow-lg shadow-amber-100">
                              <div className="w-full h-full rounded-full bg-stone-50 flex items-center justify-center overflow-hidden">
                                {todayCaptainOrVice.photo ? (
                                  <img src={todayCaptainOrVice.photo} alt={todayCaptainOrVice.student_name} className="w-full h-full object-cover" />
                                ) : (
                                  <Shield size={28} className="text-amber-400" />
                                )}
                              </div>
                            </div>
                            <span className="text-xs font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">{todayCaptainLabel}</span>
                            <span className="text-sm font-bold text-stone-700">{todayCaptainOrVice.student_name}</span>
                          </div>
                        )}

                        {todayRotation.map(s => (
                          <div key={s.id} className="flex flex-col items-center gap-2">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-stone-200 to-amber-200 p-[3px] shadow-md">
                              <div className="w-full h-full rounded-full bg-stone-50 flex items-center justify-center overflow-hidden">
                                {s.photo ? (
                                  <img src={s.photo} alt={s.student_name} className="w-full h-full object-cover" />
                                ) : (
                                  <Users size={28} className="text-amber-300" />
                                )}
                              </div>
                            </div>
                            <span className="text-xs font-medium text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">轮值</span>
                            <span className="text-sm font-bold text-stone-700">{s.student_name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )

              case 'attendance':
                return wrap(
                  <div className={`rounded-2xl border overflow-hidden shadow-sm ${
                    noWindowUsed
                      ? 'bg-white border-stone-200/80'
                      : hasAttendanceIssues
                        ? 'bg-red-50/60 border-red-200'
                        : 'bg-emerald-50/60 border-emerald-200'
                  }`}>
                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {noWindowUsed ? (
                            <>
                              <AlertTriangle size={18} className="text-stone-400" />
                              <span className="text-base font-semibold text-stone-500">未开启考勤</span>
                            </>
                          ) : hasAttendanceIssues ? (
                            <>
                              <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                              </span>
                              <span className="text-base font-semibold text-red-600">考勤异常</span>
                            </>
                          ) : (
                            <>
                              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                                <CheckCircle size={16} className="text-emerald-500" />
                              </div>
                              <span className="text-base font-semibold text-emerald-600">考勤正常</span>
                            </>
                          )}
                        </div>
                        {!noWindowUsed && (
                          <div className="flex items-center gap-5 text-sm">
                            {[
                              { label: '已签', count: attendance.signed, color: 'bg-emerald-400' },
                              { label: '迟到', count: attendance.late, color: 'bg-red-400' },
                              { label: '请假', count: attendance.leave, color: 'bg-blue-400' },
                              { label: '未签', count: unsignedStudents.length, color: 'bg-stone-400' },
                            ].map(item => (
                              <div key={item.label} className="flex items-center gap-1.5">
                                <GlowDot color={item.color} />
                                <span className="text-stone-500">{item.label}</span>
                                <span className={`font-mono font-bold tabular-nums ${item.count > 0 ? 'text-stone-700' : 'text-stone-400'}`}>
                                  {item.count}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {attendanceWindows.length === 0 ? (
                        <p className="text-sm text-stone-400 text-center py-2">未设置考勤时段</p>
                      ) : noWindowUsed ? (
                        <p className="text-sm text-stone-400 text-center py-2">今日未开启考勤</p>
                      ) : (
                        <div className="space-y-2">
                          {attendanceWindows.map(win => {
                            const recs = windowRecordsMap.get(win.id) || []
                            if (recs.length === 0) return null
                            const wLate = recs.filter(r => r.status === 'late').map(r => {
                              const stu = studentMap.get(r.student_id)
                              const grp = stu ? groupMap.get(stu.group_id) : undefined
                              return { name: stu?.name || r.student_id, groupName: grp?.name, groupColor: grp?.color, groupLeaderName: grp?.leader_name }
                            })
                            const wLeave = recs.filter(r => r.status === 'leave').map(r => {
                              const stu = studentMap.get(r.student_id)
                              const grp = stu ? groupMap.get(stu.group_id) : undefined
                              return { name: stu?.name || r.student_id, groupName: grp?.name, groupColor: grp?.color, groupLeaderName: grp?.leader_name }
                            })
                            const wUnsigned = recs.filter(r => r.status === 'unsigned').map(r => {
                              const stu = studentMap.get(r.student_id)
                              const grp = stu ? groupMap.get(stu.group_id) : undefined
                              return { name: stu?.name || r.student_id, groupName: grp?.name, groupColor: grp?.color, groupLeaderName: grp?.leader_name }
                            })
                            const hasIssue = wLate.length > 0 || wLeave.length > 0 || wUnsigned.length > 0

                            return (
                              <div key={win.id} className={`border rounded-xl overflow-hidden ${hasIssue ? 'border-red-200 bg-red-50/30' : 'border-emerald-200 bg-emerald-50/30'}`}>
                                <div className="flex items-center gap-3 px-3 py-2">
                                  <div className={`w-2 h-2 rounded-full ${hasIssue ? 'bg-red-400' : 'bg-emerald-400'}`} />
                                  <span className="text-sm font-medium text-stone-600">
                                    {win.label || `${win.window_start}-${win.window_end}`}
                                  </span>
                                  {hasIssue ? (
                                    <>
                                      <span className="text-sm font-mono text-red-500">
                                        {wLate.length > 0 && <span>迟到{wLate.length} </span>}
                                        {wLeave.length > 0 && <span>请假{wLeave.length} </span>}
                                        {wUnsigned.length > 0 && <span>未签{wUnsigned.length}</span>}
                                      </span>
                                      <div className="flex flex-wrap gap-1.5 ml-auto">
                                        {wLate.map(s => (
                                          <span key={s.name} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/80 border border-red-200 rounded text-xs">
                                            <GlowDot color="bg-red-400" />
                                            <span className="font-medium text-red-600">{s.name}</span>
                                            {s.groupName && (
                                              <span className={`text-[10px] px-1 py-0.5 rounded text-white ${s.groupColor || 'bg-stone-400'}`}>
                                                {s.groupName}{s.groupLeaderName ? `（${s.groupLeaderName}）` : ''}
                                              </span>
                                            )}
                                          </span>
                                        ))}
                                        {wLeave.map(s => (
                                          <span key={s.name} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/80 border border-blue-200 rounded text-xs">
                                            <GlowDot color="bg-blue-400" />
                                            <span className="font-medium text-blue-600">{s.name}</span>
                                            {s.groupName && (
                                              <span className={`text-[10px] px-1 py-0.5 rounded text-white ${s.groupColor || 'bg-stone-400'}`}>
                                                {s.groupName}{s.groupLeaderName ? `（${s.groupLeaderName}）` : ''}
                                              </span>
                                            )}
                                          </span>
                                        ))}
                                        {wUnsigned.map(s => (
                                          <span key={s.name} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/80 border border-stone-300 rounded text-xs">
                                            <GlowDot color="bg-stone-400" />
                                            <span className="font-medium text-stone-500">{s.name}</span>
                                            {s.groupName && (
                                              <span className={`text-[10px] px-1 py-0.5 rounded text-white ${s.groupColor || 'bg-stone-400'}`}>
                                                {s.groupName}{s.groupLeaderName ? `（${s.groupLeaderName}）` : ''}
                                              </span>
                                            )}
                                          </span>
                                        ))}
                                      </div>
                                    </>
                                  ) : (
                                    <span className="text-sm text-emerald-500 font-medium">考勤正常</span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )

              case 'group-ranking':
                return wrap(
                  <div className="bg-white rounded-2xl border border-stone-200/80 overflow-hidden shadow-sm">
                    <div className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Medal size={16} className="text-amber-500" />
                        <span className="text-sm font-semibold text-stone-600 tracking-wide">小组总积分排名</span>
                      </div>
                      {rankedGroups.length === 0 ? (
                        <p className="text-sm text-stone-400 text-center py-3">暂无数据</p>
                      ) : (
                        <div className="space-y-1.5">
                          {rankedGroups.slice(0, 3).map((g, i) => {
                            const pct = maxTotalScore > 0 ? Math.round((g.total_score / maxTotalScore) * 100) : 0
                            const barGrad = i === 0
                              ? 'from-amber-400 to-amber-300'
                              : i === 1
                              ? 'from-stone-300 to-stone-200'
                              : i === 2
                              ? 'from-orange-400 to-orange-300'
                              : 'from-amber-300/60 to-amber-200/60'
                            return (
                              <div key={g.id} className="flex items-center gap-3">
                                <span className={`text-sm w-7 text-center font-bold ${
                                  i === 0 ? 'text-amber-500' : i === 1 ? 'text-stone-400' : i === 2 ? 'text-orange-400' : 'text-stone-400'
                                }`}>
                                  {i < 3 ? rankMedals[i] : i + 1}
                                </span>
                                <span className={`text-sm font-medium px-2.5 py-0.5 rounded-md text-white shadow-sm ${g.color || 'bg-stone-400'}`}>
                                  {g.name}{g.leader_name ? `（${g.leader_name}）` : ''}
                                </span>
                                <div className="flex-1 h-6 bg-stone-100 rounded-full overflow-hidden relative">
                                  <div
                                    className={`h-full bg-gradient-to-r ${barGrad} rounded-full transition-[width] duration-700`}
                                    style={{ width: `${Math.max(pct, 5)}%` }}
                                  />
                                  <span className="absolute inset-0 flex items-center px-3 text-sm font-mono font-bold text-stone-600 tabular-nums">
                                    {g.total_score}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )

              case 'homework':
                return wrap(
                  <div className={`bg-white rounded-2xl border border-stone-200/80 overflow-hidden border-l-4 ${
                    homeworkSubjects.length > 0 ? 'border-l-rose-400' : 'border-l-emerald-400'
                  }`}>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-stone-600">作业</span>
                        <span className="text-xs font-mono tabular-nums">
                          {homeworkSubjects.length === 0 ? (
                            <span className="text-emerald-500 font-medium">交齐</span>
                          ) : (
                            <>
                              {homeworkNotSubmitted > 0 && <span className="text-rose-500 font-medium">未交 {homeworkNotSubmitted}</span>}
                              {homeworkNotSubmitted > 0 && homeworkIncomplete > 0 && <span className="text-stone-300 mx-1">|</span>}
                              {homeworkIncomplete > 0 && <span className="text-amber-500 font-medium">未交齐 {homeworkIncomplete}</span>}
                            </>
                          )}
                        </span>
                      </div>
                      {homeworkSubjects.length === 0 ? (
                        <p className="text-sm text-emerald-500">全部交齐 ✓</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {homeworkSubjects.map(([subject, students]) => (
                            <div key={subject} className="bg-stone-50 rounded-xl p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-semibold text-stone-700">{subject}</span>
                                <span className="text-xs text-stone-400 font-mono tabular-nums">{students.length}人</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {students.map(s => (
                                  <span
                                    key={s.name}
                                    className={`px-1.5 py-0.5 rounded text-xs ${
                                      s.status === '未交' ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-500'
                                    }`}
                                  >{s.name}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )

              case 'daily-practice':
                return wrap(
                  <div className={`bg-white rounded-2xl border border-stone-200/80 overflow-hidden border-l-4 ${
                    (practiceUnsigned.qiangji.length + practiceUnsigned.tisheng.length) > 0 ? 'border-l-amber-400' : 'border-l-emerald-400'
                  }`}>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-stone-600">每日一练</span>
                        <span className={`text-sm font-mono tabular-nums font-medium ${
                          (practiceUnsigned.qiangji.length + practiceUnsigned.tisheng.length) > 0 ? 'text-amber-500' : 'text-emerald-500'
                        }`}>
                          {(practiceUnsigned.qiangji.length + practiceUnsigned.tisheng.length) > 0
                            ? `未签 ${practiceUnsigned.qiangji.length + practiceUnsigned.tisheng.length}`
                            : '全员完成'}
                        </span>
                      </div>
                      {(practiceUnsigned.qiangji.length + practiceUnsigned.tisheng.length) === 0 ? (
                        <span className="text-sm text-emerald-500">全部完成 ✓</span>
                      ) : (
                        <div className="space-y-2">
                          {[
                            { label: '强基', color: 'bg-sky-50 text-sky-600', students: practiceUnsigned.qiangji },
                            { label: '提升', color: 'bg-violet-50 text-violet-600', students: practiceUnsigned.tisheng },
                          ].map(group => group.students.length > 0 && (
                            <div key={group.label}>
                              <span className="text-xs font-medium text-stone-500 mb-1 block">{group.label} · {group.students.length}人</span>
                              <div className="flex flex-wrap gap-1">
                                {group.students.map(s => (
                                  <span key={s.name} className={`text-sm px-1.5 py-0.5 rounded ${group.color} text-center`}>
                                    {s.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )

              case 'deductions':
                return wrap(
                  <div className="bg-white rounded-2xl border border-stone-200/80 overflow-hidden border-l-4 border-l-red-400">
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-stone-600">扣分排行</span>
                        <span className="text-xs text-stone-400 font-mono tabular-nums">TOP 5</span>
                      </div>
                      <div>
                        {topDeductions.length === 0 ? (
                          <p className="text-xs text-emerald-500">暂无记录</p>
                        ) : (
                          <div className="space-y-0">
                            {topDeductions.slice(0, 5).map((d, i) => (
                              <div
                                key={d.student_id}
                                className="flex items-center justify-between text-sm py-1 border-b border-stone-100 last:border-0"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className={`font-mono font-bold w-4 text-center ${
                                    i === 0 ? 'text-red-500' : i === 1 ? 'text-orange-500' : i === 2 ? 'text-amber-500' : 'text-stone-400'
                                  }`}>
                                    {String(i + 1).padStart(2, '0')}
                                  </span>
                                  <span className="text-stone-600">{d.student_name}</span>
                                </div>
                                <span className="font-mono font-bold text-red-500 tabular-nums">-{d.total_points}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )

              case 'math-homework':
                return wrap(
                  <div className={`bg-white rounded-2xl border border-stone-200/80 overflow-hidden border-l-4 ${
                    mathFails.length > 0 ? 'border-l-purple-400' : 'border-l-emerald-400'
                  }`}>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Calculator size={15} className={mathFails.length > 0 ? 'text-purple-400' : 'text-emerald-400'} />
                          <span className="text-sm font-semibold text-stone-600">数学作业</span>
                        </div>
                        <span className={`text-sm font-mono tabular-nums font-medium ${
                          mathFails.length > 0 ? 'text-purple-500' : 'text-emerald-500'
                        }`}>
                          {mathFails.length > 0 ? `不合格 ${mathFails.length}` : '全部合格'}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {mathFails.length === 0 ? (
                          <p className="text-xs text-emerald-500">全部合格 ✓</p>
                        ) : (
                          mathFails.map(f => (
                            <div key={f.id} className="flex items-start justify-between text-sm py-1 border-b border-stone-100 last:border-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-medium text-purple-600 shrink-0">{f.student_name}</span>
                                <span className={`text-[10px] px-1 py-0.5 rounded text-white shrink-0 ${f.group_color || 'bg-stone-400'}`}>
                                  {f.group_name}{f.group_leader_name ? `（${f.group_leader_name}）` : ''}
                                </span>
                              </div>
                              <span className="text-stone-400 ml-1 text-right">{f.reason || '-'}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )

              case 'duty':
                return wrap(
                  <div className={`bg-white rounded-2xl border border-stone-200/80 overflow-hidden border-l-4 ${
                    yesterdayDutyAbsent.length > 0 ? 'border-l-red-400' : 'border-l-indigo-400'
                  }`}>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={15} className={yesterdayDutyAbsent.length > 0 ? 'text-red-400' : 'text-indigo-400'} />
                          <span className="text-sm font-semibold text-stone-600">值日</span>
                        </div>
                      </div>
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-stone-400">今日值日</span>
                          <span className="text-xs font-mono tabular-nums text-stone-400">
                            {todayHasDuty ? `${todayDutyStudents.length}人` : '未安排'}
                          </span>
                        </div>
                        {!todayHasDuty || todayDutyStudents.length === 0 ? (
                          <span className="text-xs text-stone-400">{todayHasDuty ? '暂无学生' : '未安排'}</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {todayDutyStudents.map(ds => (
                              <span key={ds.id} className="text-sm px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                                {ds.student_name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="border-t border-stone-100 pt-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-stone-400">昨日值日</span>
                          <span className={`text-xs font-mono tabular-nums font-medium ${
                            yesterdayDutyAbsent.length > 0 ? 'text-red-500' : 'text-stone-400'
                          }`}>
                            {yesterdayDutyAbsent.length > 0
                              ? `缺勤 ${yesterdayDutyAbsent.length}`
                              : yesterdayHasDuty ? '全勤' : '未安排'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {yesterdayDutyAbsent.length === 0 ? (
                            <span className="text-xs text-stone-400">{yesterdayHasDuty ? '全勤 ✓' : '未安排'}</span>
                          ) : (
                            yesterdayDutyAbsent.map(name => (
                              <span key={name} className="text-sm px-1.5 py-0.5 rounded bg-red-50 text-red-500">
                                {name}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )

              case 'coins':
                return wrap(
                  <div className="bg-white rounded-2xl border border-stone-200/80 overflow-hidden border-l-4 border-l-amber-400">
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Coins size={15} className="text-amber-400" />
                          <span className="text-sm font-semibold text-stone-600">宝龙币</span>
                        </div>
                        <span className="text-xs text-stone-400 font-mono tabular-nums">目标 {COIN_TARGET}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[...coinGroups].sort((a, b) => b.coins - a.coins).map(cg => {
                          const pct = Math.round((cg.coins / COIN_TARGET) * 100)
                          const reached = cg.coins >= COIN_TARGET
                          return (
                            <div key={cg.id} className={reached ? 'opacity-100' : ''}>
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-sm text-stone-500">
                                  {cg.name}
                                  {reached && <CheckCircle size={12} className="inline ml-1 text-emerald-400" />}
                                </span>
                                <span className={`text-xs font-mono tabular-nums ${reached ? 'text-emerald-600 font-semibold' : 'text-stone-400'}`}>
                                  {cg.coins}/{COIN_TARGET}
                                </span>
                              </div>
                              <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-[width] duration-500"
                                  style={{
                                    width: `${Math.min(pct, 100)}%`,
                                    background: reached
                                      ? 'linear-gradient(90deg, #34d399, #10b981)'
                                      : `linear-gradient(90deg, #fbbf24, #f59e0b)`,
                                  }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )

              default:
                return null
            }
          })}
        </div>

      </div>
    </div>
  )
}
