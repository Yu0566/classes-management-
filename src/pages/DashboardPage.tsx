import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Users, Coins, Medal, AlertTriangle, CheckCircle, Calculator, Pin
} from 'lucide-react'
import * as groupApi from '@/lib/groups'
import * as studentApi from '@/lib/students'
import * as dutyApi from '@/lib/duty'
import * as mathHomeworkApi from '@/lib/math-homework'
import { getRecordsByDate } from '@/lib/homework'
import * as winApi from '@/lib/attendance-session'
import * as recApi from '@/lib/attendance-window-records'
import { getDailyStatuses } from '@/lib/daily-status'
import { getRosterStudents, getSignIns, type PracticeLabel } from '@/lib/practice-roster'
import { queryAll } from '@/lib/db'
import type { Group, StudentWithGroup, DailyStatus, CoinGroup, MathHomeworkGradeWithStudent, AttendanceWindow, AttendanceWindowRecord, DutyStudent } from '@/types'

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
  const [practiceUnsigned, setPracticeUnsigned] = useState<{ name: string }[]>([])
  const [attendanceWindows, setAttendanceWindows] = useState<AttendanceWindow[]>([])
  const [windowRecordsMap, setWindowRecordsMap] = useState<Map<string, AttendanceWindowRecord[]>>(new Map())
  const location = useLocation()
  const [loading, setLoading] = useState(true)

  const COIN_TARGET = 15

  const loadData = useCallback(async () => {
    const date = todayStr()
    const yDate = yesterdayStr()
    const [g, s, st, cg] = await Promise.all([
      groupApi.getAllGroups(),
      studentApi.getAllStudents(),
      getDailyStatuses(date),
      queryAll<CoinGroup>('SELECT * FROM coin_groups'),
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

    // 每日一练：从 practice_signins 获取未签
    const labels: PracticeLabel[] = ['qiangji', 'tisheng']
    const unsignedSet = new Set<string>()
    for (const label of labels) {
      const [roster, signIns] = await Promise.all([
        getRosterStudents(label),
        getSignIns(date, label),
      ])
      const signedIds = new Set(signIns.map(si => si.student_id))
      roster.forEach(s => {
        if (!signedIds.has(s.id)) unsignedSet.add(s.name)
      })
    }
    setPracticeUnsigned(Array.from(unsignedSet).map(name => ({ name })))

    // 考勤时段数据
    const aw = await winApi.getWindows(date)
    setAttendanceWindows(aw)
    const recMap = new Map<string, AttendanceWindowRecord[]>()
    for (const w of aw) {
      recMap.set(w.id, await recApi.getWindowRecords(w.id))
    }
    setWindowRecordsMap(recMap)

    setLoading(false)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          <span className="text-xs text-slate-400 tracking-widest uppercase">加载中</span>
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
  const homeworkIssueMap = new Map<string, { name: string; subjects: { subject: string; status: string }[] }>()
  homeworkRecords.forEach(r => {
    const entry = homeworkIssueMap.get(r.student_id)
    const label = r.status === 'incomplete' ? '未交' : '未交齐'
    if (entry) {
      entry.subjects.push({ subject: r.subject, status: label })
    } else {
      homeworkIssueMap.set(r.student_id, { name: r.student_name, subjects: [{ subject: r.subject, status: label }] })
    }
  })
  const homeworkIssueStudents = Array.from(homeworkIssueMap.values())
  const homeworkNotSubmitted = homeworkRecords.filter(r => r.status === 'incomplete').length
  const homeworkIncomplete = homeworkRecords.filter(r => r.status === 'partial').length

  const rankedGroups = [...groups].sort((a, b) => b.total_score - a.total_score)
  const maxTotalScore = rankedGroups.length > 0 ? rankedGroups[0].total_score : 1
  const totalCoins = coinGroups.reduce((s, cg) => s + (cg.coins || 0), 0)
  const belowTargetGroups = coinGroups.filter(cg => cg.coins < COIN_TARGET)

  const rankMedals = ['🥇', '🥈', '🥉']
  const dateLabel = formatDate(todayStr())

  return (
    <div className="h-full overflow-auto bg-slate-50">
      <div className="p-5 max-w-6xl mx-auto space-y-4">

        {/* ===== 顶部状态条 ===== */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 rounded-full bg-gradient-to-b from-indigo-400 to-indigo-600" />
            <h1 className="text-lg font-bold text-slate-700 tracking-wide">班级看板</h1>
          </div>
          <div className="flex items-center gap-4">
            {/* 全局指标一行 */}
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <Users size={13} /> <span className="tabular-nums">{students.length}</span>人
              </span>
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400" /> <span className="tabular-nums">{groups.length}</span>组
              </span>
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-1.5">
                <Coins size={13} className="text-amber-500" /> <span className="tabular-nums font-mono">{totalCoins}</span>
              </span>
            </div>
            <span className="text-xs text-slate-400 font-mono tabular-nums">{dateLabel}</span>
            {!!window.electronAPI?.widget && (
              <button
                onClick={() => window.electronAPI!.widget!.open()}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-500 text-xs transition-colors"
                title="打开桌面便签"
              >
                <Pin size={12} /> 桌面便签
              </button>
            )}
          </div>
        </div>

        {/* ===== 考勤数据（按时段） ===== */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="h-0.5 bg-gradient-to-r from-indigo-400 to-blue-300" />
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {noWindowUsed ? (
                  <>
                    <AlertTriangle size={17} className="text-slate-400" />
                    <span className="text-base font-semibold text-slate-500">未开启考勤</span>
                  </>
                ) : hasAttendanceIssues ? (
                  <>
                    <AlertTriangle size={17} className="text-red-500" />
                    <span className="text-base font-semibold text-red-600">考勤异常</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={17} className="text-emerald-500" />
                    <span className="text-base font-semibold text-emerald-600">考勤正常</span>
                  </>
                )}
              </div>
              {/* 汇总统计 */}
              {!noWindowUsed && (
              <div className="flex items-center gap-5 text-sm">
                {[
                  { label: '已签', count: attendance.signed, color: 'bg-emerald-400' },
                  { label: '迟到', count: attendance.late, color: 'bg-red-400' },
                  { label: '请假', count: attendance.leave, color: 'bg-blue-400' },
                  { label: '未签', count: unsignedStudents.length, color: 'bg-slate-400' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <GlowDot color={item.color} />
                    <span className="text-slate-500">{item.label}</span>
                    <span className={`font-mono font-bold tabular-nums ${item.count > 0 ? 'text-slate-700' : 'text-slate-400'}`}>
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
              )}
            </div>

            {/* 按时段分行 */}
            {attendanceWindows.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-2">未设置考勤时段</p>
            ) : noWindowUsed ? (
              <p className="text-sm text-slate-400 text-center py-2">今日未开启考勤</p>
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
                        <span className="text-sm font-medium text-slate-600">
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
                                    <span className={`text-[10px] px-1 py-0.5 rounded text-white ${s.groupColor || 'bg-gray-400'}`}>
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
                                    <span className={`text-[10px] px-1 py-0.5 rounded text-white ${s.groupColor || 'bg-gray-400'}`}>
                                      {s.groupName}{s.groupLeaderName ? `（${s.groupLeaderName}）` : ''}
                                    </span>
                                  )}
                                </span>
                              ))}
                              {wUnsigned.map(s => (
                                <span key={s.name} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/80 border border-slate-300 rounded text-xs">
                                  <GlowDot color="bg-slate-400" />
                                  <span className="font-medium text-slate-500">{s.name}</span>
                                  {s.groupName && (
                                    <span className={`text-[10px] px-1 py-0.5 rounded text-white ${s.groupColor || 'bg-gray-400'}`}>
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

        {/* ===== 中间双栏 ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ---- 左栏：TOP3 + 三个状态卡片 ---- */}
          <div className="lg:col-span-2 flex flex-col gap-4 h-full">

            {/* 小组总积分排名 */}
            <div className="bg-whiterounded-2xl border border-slate-200 overflow-hidden">
              <div className="h-0.5 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-200" />
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Medal size={15} className="text-amber-500" />
                  <span className="text-sm font-semibold text-slate-500 tracking-wide">小组总积分排名</span>
                </div>
                {rankedGroups.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-3">暂无数据</p>
                ) : (
                  <div className="space-y-1.5">
                    {rankedGroups.map((g, i) => {
                      const pct = maxTotalScore > 0 ? Math.round((g.total_score / maxTotalScore) * 100) : 0
                      const barGrad = i === 0
                        ? 'from-amber-400 to-amber-300'
                        : i === 1
                        ? 'from-slate-300 to-slate-200'
                        : i === 2
                        ? 'from-orange-400 to-orange-300'
                        : 'from-indigo-300 to-indigo-200'
                      return (
                        <div key={g.id} className="flex items-center gap-3">
                          <span className={`text-sm w-7 text-center font-bold ${
                            i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-400' : 'text-indigo-400'
                          }`}>
                            {i < 3 ? rankMedals[i] : i + 1}
                          </span>
                          <span className={`text-sm font-medium px-2.5 py-0.5 rounded-md text-white shadow-sm ${g.color || 'bg-gray-400'}`}>
                            {g.name}{g.leader_name ? `（${g.leader_name}）` : ''}
                          </span>
                          <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden relative">
                            <div
                              className={`h-full bg-gradient-to-r ${barGrad} rounded-full transition-[width] duration-700`}
                              style={{ width: `${Math.max(pct, 5)}%` }}
                            />
                            <span className="absolute inset-0 flex items-center px-3 text-sm font-mono font-bold text-slate-600 tabular-nums">
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

            {/* 三个关注项 横排 */}
            <div className="grid grid-cols-3 gap-3">
              {/* 作业 */}
              <div className="relative bg-whiterounded-2xl border border-slate-200 overflow-hidden">
                <div className={`h-0.5 bg-gradient-to-r ${
                  homeworkIssueStudents.length > 0 ? 'from-red-400 to-red-300' : 'from-emerald-400 to-emerald-300'
                }`} />
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-500">作业</span>
                    <span className="text-xs text-slate-400 font-mono tabular-nums">
                      {homeworkIssueStudents.length === 0 ? (
                        <span className="text-emerald-500">交齐</span>
                      ) : (
                        <>
                          {homeworkNotSubmitted > 0 && <span className="text-red-500">未交 {homeworkNotSubmitted}</span>}
                          {homeworkNotSubmitted > 0 && homeworkIncomplete > 0 && <span className="text-slate-300 mx-1">|</span>}
                          {homeworkIncomplete > 0 && <span className="text-amber-500">未交齐 {homeworkIncomplete}</span>}
                        </>
                      )}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {homeworkIssueStudents.length === 0 ? (
                      <span className="text-sm text-emerald-500">全部交齐 ✓</span>
                    ) : (
                      homeworkIssueStudents.map(s => (
                        <div key={s.name} className="flex items-start gap-1.5 text-sm">
                          <span className="font-medium text-slate-600 shrink-0">{s.name}:</span>
                          <div className="flex flex-wrap gap-1">
                            {s.subjects.map(sub => (
                              <span
                                key={sub.subject}
                                className={`px-1.5 py-0.5 rounded text-xs ${
                                  sub.status === '未交' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'
                                }`}
                              >{sub.subject}({sub.status})</span>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* 每日一练 */}
              <div className="relative bg-whiterounded-2xl border border-slate-200 overflow-hidden">
                <div className={`h-0.5 bg-gradient-to-r ${
                  practiceUnsigned.length > 0 ? 'from-red-400 to-red-300' : 'from-emerald-400 to-emerald-300'
                }`} />
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-500">每日一练</span>
                    <span className={`text-sm font-mono tabular-nums ${
                      practiceUnsigned.length > 0 ? 'text-red-500' : 'text-emerald-500'
                    }`}>
                      {practiceUnsigned.length > 0 ? `未签 ${practiceUnsigned.length}` : '全员完成'}
                    </span>
                  </div>
                  <div>
                    {practiceUnsigned.length === 0 ? (
                      <span className="text-sm text-emerald-500">全部完成 ✓</span>
                    ) : (
                      <div className="grid grid-cols-3 gap-0.5">
                        {practiceUnsigned.map(s => (
                          <span key={s.name} className="text-sm px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-center truncate">
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 扣分排行 */}
              <div className="relative bg-whiterounded-2xl border border-slate-200 overflow-hidden">
                <div className="h-0.5 bg-gradient-to-r from-red-400 to-rose-300" />
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-500">扣分排行</span>
                    <span className="text-xs text-slate-400 font-mono tabular-nums">TOP 5</span>
                  </div>
                  {topDeductions.length === 0 ? (
                    <p className="text-xs text-emerald-500">暂无记录</p>
                  ) : (
                    <div className="space-y-0">
                      {topDeductions.slice(0, 5).map((d, i) => (
                        <div
                          key={d.student_id}
                          className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={`font-mono font-bold w-4 text-center ${
                              i === 0 ? 'text-red-500' : i === 1 ? 'text-orange-500' : i === 2 ? 'text-amber-500' : 'text-slate-400'
                            }`}>
                              {String(i + 1).padStart(2, '0')}
                            </span>
                            <span className="text-slate-600">{d.student_name}</span>
                          </div>
                          <span className="font-mono font-bold text-red-500 tabular-nums">-{d.total_points}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ---- 右栏 ---- */}
          <div className="flex flex-col gap-4 h-full">

            {/* 数学作业等级 */}
            <div className="relative bg-whiterounded-2xl border border-slate-200 overflow-hidden">
              <div className={`h-0.5 bg-gradient-to-r ${
                mathFails.length > 0 ? 'from-red-400 to-red-300' : 'from-emerald-400 to-emerald-300'
              }`} />
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Calculator size={15} className={mathFails.length > 0 ? 'text-red-400' : 'text-emerald-400'} />
                    <span className="text-sm font-semibold text-slate-500 tracking-wide">数学作业</span>
                  </div>
                  <span className={`text-sm font-mono tabular-nums ${
                    mathFails.length > 0 ? 'text-red-500' : 'text-emerald-500'
                  }`}>
                    {mathFails.length > 0 ? `不合格 ${mathFails.length}` : '全部合格'}
                  </span>
                </div>
                <div className="space-y-1">
                  {mathFails.length === 0 ? (
                    <p className="text-xs text-emerald-500">全部合格 ✓</p>
                  ) : (
                    mathFails.map(f => (
                      <div key={f.id} className="flex items-start justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-medium text-red-600 shrink-0">{f.student_name}</span>
                          <span className={`text-[10px] px-1 py-0.5 rounded text-white shrink-0 ${f.group_color || 'bg-gray-400'}`}>
                            {f.group_name}{f.group_leader_name ? `（${f.group_leader_name}）` : ''}
                          </span>
                        </div>
                        <span className="text-slate-400 ml-1 text-right">{f.reason || '-'}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* 值日 */}
            <div className="relative bg-whiterounded-2xl border border-slate-200 overflow-hidden">
              <div className={`h-0.5 bg-gradient-to-r ${
                yesterdayDutyAbsent.length > 0 ? 'from-red-400 to-red-300' : 'from-indigo-400 to-indigo-300'
              }`} />
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={15} className={yesterdayDutyAbsent.length > 0 ? 'text-red-400' : 'text-indigo-400'} />
                    <span className="text-sm font-semibold text-slate-500 tracking-wide">值日</span>
                  </div>
                </div>
                {/* 今日值日名单 */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-400">今日值日</span>
                    <span className="text-xs font-mono tabular-nums text-slate-400">
                      {todayHasDuty ? `${todayDutyStudents.length}人` : '未安排'}
                    </span>
                  </div>
                  {!todayHasDuty || todayDutyStudents.length === 0 ? (
                    <span className="text-xs text-slate-400">{todayHasDuty ? '暂无学生' : '未安排'}</span>
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
                {/* 昨日缺勤 */}
                <div className="border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-400">昨日值日</span>
                    <span className={`text-xs font-mono tabular-nums ${
                      yesterdayDutyAbsent.length > 0 ? 'text-red-500' : 'text-slate-400'
                    }`}>
                      {yesterdayDutyAbsent.length > 0
                        ? `缺勤 ${yesterdayDutyAbsent.length}`
                        : yesterdayHasDuty ? '全勤' : '未安排'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {yesterdayDutyAbsent.length === 0 ? (
                      <span className="text-xs text-slate-400">{yesterdayHasDuty ? '全勤 ✓' : '未安排'}</span>
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

            {/* 宝龙币进度条 */}
            <div className="relative bg-whiterounded-2xl border border-slate-200 overflow-hidden mt-auto">
              <div className="h-0.5 bg-gradient-to-r from-amber-400 to-yellow-300" />
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Coins size={15} className="text-amber-400" />
                    <span className="text-sm font-semibold text-slate-500 tracking-wide">宝龙币</span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono tabular-nums">目标 {COIN_TARGET}</span>
                </div>
                {belowTargetGroups.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-2">全部达标</p>
                ) : (
                  <div className="space-y-2">
                    {belowTargetGroups.map(cg => {
                      const pct = Math.round((cg.coins / COIN_TARGET) * 100)
                      return (
                        <div key={cg.id}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-sm text-slate-500">{cg.name}</span>
                            <span className="text-xs text-slate-400 font-mono tabular-nums">{cg.coins}/{COIN_TARGET}</span>
                          </div>
                          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-[width] duration-500"
                              style={{
                                width: `${Math.min(pct, 100)}%`,
                                background: `linear-gradient(90deg, #fbbf24, ${pct >= 100 ? '#34d399' : '#f59e0b'})`,
                              }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
