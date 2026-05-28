import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Users, Coins, Medal, AlertTriangle, CheckCircle, Calculator
} from 'lucide-react'
import * as groupApi from '@/lib/groups'
import * as studentApi from '@/lib/students'
import * as dutyApi from '@/lib/duty'
import * as mathHomeworkApi from '@/lib/math-homework'
import { getDailyStatuses } from '@/lib/daily-status'
import { getRosterStudents, getSignIns, type PracticeLabel } from '@/lib/practice-roster'
import { queryAll } from '@/lib/db'
import type { Group, StudentWithGroup, DailyStatus, CoinGroup, MathHomeworkGradeWithStudent } from '@/types'

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
  <motion.span
    className={`inline-block w-2 h-2 rounded-full ${color} shadow-[0_0_6px] shadow-current`}
    animate={{ opacity: [0.5, 1, 0.5] }}
    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
  />
)

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

export default function DashboardPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [students, setStudents] = useState<StudentWithGroup[]>([])
  const [todayStatuses, setTodayStatuses] = useState<DailyStatus[]>([])
  const [coinGroups, setCoinGroups] = useState<CoinGroup[]>([])
  const [topDeductions, setTopDeductions] = useState<{ student_id: string; student_name: string; total_points: number }[]>([])
  const [yesterdayDutyAbsent, setYesterdayDutyAbsent] = useState<string[]>([])
  const [yesterdayHasDuty, setYesterdayHasDuty] = useState(false)
  const [mathFails, setMathFails] = useState<MathHomeworkGradeWithStudent[]>([])
  const [practiceUnsigned, setPracticeUnsigned] = useState<{ name: string }[]>([])
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
      `SELECT student_id, student_name, SUM(points) as total_points
       FROM deduction_records GROUP BY student_id
       ORDER BY total_points DESC LIMIT 5`
    )
    setTopDeductions(deds)

    const yRecord = await dutyApi.getDutyRecord(yDate)
    if (yRecord) {
      setYesterdayHasDuty(true)
      const yStudents = await dutyApi.getDutyStudents(yRecord.id)
      setYesterdayDutyAbsent(yStudents.filter(ds => ds.penalty_applied === 1).map(ds => ds.student_name))
    }

    const mf = await mathHomeworkApi.getFailsByDate(date)
    setMathFails(mf)

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

    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

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

  const homeworkIssueStudents = todayStatuses
    .filter(s => s.homework === 'incomplete' || s.homework === 'not_submitted')
    .map(s => ({
      name: studentMap.get(s.student_id)?.name || s.student_id,
      status: s.homework === 'incomplete' ? '未交齐' : '未交',
    }))
  const homeworkNotSubmitted = todayStatuses.filter(s => s.homework === 'not_submitted').length
  const homeworkIncomplete = todayStatuses.filter(s => s.homework === 'incomplete').length

  const top3 = [...groups].sort((a, b) => b.study_score - a.study_score).slice(0, 3)
  const totalCoins = coinGroups.reduce((s, cg) => s + (cg.coins || 0), 0)
  const belowTargetGroups = coinGroups.filter(cg => cg.coins < COIN_TARGET)

  const rankMedals = ['🥇', '🥈', '🥉']
  const dateLabel = formatDate(todayStr())

  return (
    <div className="h-full overflow-auto bg-slate-50">
      <motion.div className="p-5 max-w-6xl mx-auto space-y-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible">

        {/* ===== 顶部状态条 ===== */}
        <motion.div variants={cardVariants} className="flex items-center justify-between">
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
          </div>
        </motion.div>

        {/* ===== 考勤数据流（横向） ===== */}
        <motion.div variants={cardVariants} className={`relative overflow-hidden rounded-2xl border backdrop-blur-sm ${
          hasAttendanceIssues ? 'bg-red-50/60 border-red-200' : 'bg-emerald-50/60 border-emerald-200'
        }`}>
          {/* 顶部渐变线 */}
          <div className={`h-0.5 bg-gradient-to-r ${
            hasAttendanceIssues ? 'from-red-400 to-red-300' : 'from-emerald-400 to-emerald-300'
          }`} />
          <div className="px-5 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {hasAttendanceIssues ? (
                  <AlertTriangle size={17} className="text-red-500" />
                ) : (
                  <CheckCircle size={17} className="text-emerald-500" />
                )}
                <span className={`text-sm font-semibold ${hasAttendanceIssues ? 'text-red-600' : 'text-emerald-600'}`}>
                  {hasAttendanceIssues ? '考勤异常' : '今日全勤'}
                </span>
              </div>
              {/* 四个指标指示灯 */}
              <div className="flex items-center gap-5 text-xs">
                {[
                  { label: '已签', count: attendance.signed, color: 'bg-emerald-400', active: true },
                  { label: '迟到', count: attendance.late, color: 'bg-red-400', active: attendance.late > 0 },
                  { label: '请假', count: attendance.leave, color: 'bg-blue-400', active: attendance.leave > 0 },
                  { label: '未签', count: unsignedStudents.length, color: 'bg-slate-400', active: unsignedStudents.length > 0 },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <GlowDot color={item.color} />
                    <span className="text-slate-500">{item.label}</span>
                    <span className={`font-mono font-bold tabular-nums ${item.active ? 'text-slate-700' : 'text-slate-400'}`}>
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 异常学生标签行 */}
            {(lateStudents.length > 0 || leaveStudents.length > 0 || unsignedStudents.length > 0) && (
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-red-200/50">
                {lateStudents.map(s => (
                  <span key={s.name} className="inline-flex items-center gap-1.5 px-2 py-1 bg-white/80 backdrop-blur border border-red-200 rounded-lg text-xs">
                    <GlowDot color="bg-red-400" />
                    <span className="font-medium text-red-600">{s.name}</span>
                    {s.groupName && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded text-white ${s.groupColor || 'bg-gray-400'}`}>
                        {s.groupName}{s.groupLeaderName ? `（${s.groupLeaderName}）` : ''}
                      </span>
                    )}
                  </span>
                ))}
                {leaveStudents.map(s => (
                  <span key={s.name} className="inline-flex items-center gap-1.5 px-2 py-1 bg-white/80 backdrop-blur border border-blue-200 rounded-lg text-xs">
                    <GlowDot color="bg-blue-400" />
                    <span className="font-medium text-blue-600">{s.name}</span>
                    {s.groupName && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded text-white ${s.groupColor || 'bg-gray-400'}`}>
                        {s.groupName}{s.groupLeaderName ? `（${s.groupLeaderName}）` : ''}
                      </span>
                    )}
                  </span>
                ))}
                {unsignedStudents.map(s => (
                  <span key={s.name} className="inline-flex items-center gap-1.5 px-2 py-1 bg-white/80 backdrop-blur border border-slate-300 rounded-lg text-xs">
                    <GlowDot color="bg-slate-400" />
                    <span className="font-medium text-slate-500">{s.name}</span>
                    {s.groupName && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded text-white ${s.groupColor || 'bg-gray-400'}`}>
                        {s.groupName}{s.groupLeaderName ? `（${s.groupLeaderName}）` : ''}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* ===== 中间双栏 ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ---- 左栏：TOP3 + 三个状态卡片 ---- */}
          <motion.div variants={cardVariants} className="lg:col-span-2 flex flex-col gap-4 h-full">

            {/* 前三小组 横条排名 */}
            <div className="bg-white/70 backdrop-blur rounded-2xl border border-slate-200 overflow-hidden">
              <div className="h-0.5 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-200" />
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Medal size={15} className="text-amber-500" />
                  <span className="text-xs font-semibold text-slate-500 tracking-wide">学习积分排名</span>
                </div>
                {top3.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-3">暂无数据</p>
                ) : (
                  <div className="space-y-1.5">
                    {top3.map((g, i) => {
                      const barWidth = i === 0 ? 'w-full' : i === 1 ? 'w-[70%]' : 'w-[50%]'
                      const barGrad = i === 0
                        ? 'from-amber-400 to-amber-300'
                        : i === 1
                        ? 'from-slate-300 to-slate-200'
                        : 'from-orange-400 to-orange-300'
                      return (
                        <div key={g.id} className="flex items-center gap-3">
                          <span className="text-base w-7 text-center">{rankMedals[i]}</span>
                          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-md text-white shadow-sm ${g.color}`}>
                            {g.name}{g.leader_name ? `（${g.leader_name}）` : ''}
                          </span>
                          <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden relative">
                            <div
                              className={`h-full bg-gradient-to-r ${barGrad} rounded-full transition-[width] duration-700`}
                              style={{ width: barWidth }}
                            />
                            <span className="absolute inset-0 flex items-center px-3 text-xs font-mono font-bold text-slate-600 tabular-nums">
                              {g.study_score}
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
              <div className="relative bg-white/70 backdrop-blur rounded-2xl border border-slate-200 overflow-hidden">
                <div className={`h-0.5 bg-gradient-to-r ${
                  homeworkIssueStudents.length > 0 ? 'from-red-400 to-red-300' : 'from-emerald-400 to-emerald-300'
                }`} />
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500">作业</span>
                    <span className="text-[10px] text-slate-400 font-mono tabular-nums">
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
                  <div className="flex flex-wrap gap-1">
                    {homeworkIssueStudents.length === 0 ? (
                      <span className="text-[10px] text-emerald-500">全部交齐 ✓</span>
                    ) : (
                      homeworkIssueStudents.map(s => (
                        <span
                          key={s.name}
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            s.status === '未交' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'
                          }`}
                        >{s.name}</span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* 每日一练 */}
              <div className="relative bg-white/70 backdrop-blur rounded-2xl border border-slate-200 overflow-hidden">
                <div className={`h-0.5 bg-gradient-to-r ${
                  practiceUnsigned.length > 0 ? 'from-red-400 to-red-300' : 'from-emerald-400 to-emerald-300'
                }`} />
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500">每日一练</span>
                    <span className={`text-[10px] font-mono tabular-nums ${
                      practiceUnsigned.length > 0 ? 'text-red-500' : 'text-emerald-500'
                    }`}>
                      {practiceUnsigned.length > 0 ? `未签 ${practiceUnsigned.length}` : '全员完成'}
                    </span>
                  </div>
                  <div>
                    {practiceUnsigned.length === 0 ? (
                      <span className="text-[10px] text-emerald-500">全部完成 ✓</span>
                    ) : (
                      <div className="grid grid-cols-3 gap-0.5">
                        {practiceUnsigned.map(s => (
                          <span key={s.name} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-center truncate">
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 扣分排行 */}
              <div className="relative bg-white/70 backdrop-blur rounded-2xl border border-slate-200 overflow-hidden">
                <div className="h-0.5 bg-gradient-to-r from-red-400 to-rose-300" />
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500">扣分排行</span>
                    <span className="text-[10px] text-slate-400 font-mono tabular-nums">TOP 5</span>
                  </div>
                  {topDeductions.length === 0 ? (
                    <p className="text-[10px] text-emerald-500">暂无记录</p>
                  ) : (
                    <div className="space-y-0">
                      {topDeductions.slice(0, 5).map((d, i) => (
                        <div
                          key={d.student_id}
                          className="flex items-center justify-between text-[10px] py-1 border-b border-slate-100 last:border-0"
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
          </motion.div>

          {/* ---- 右栏 ---- */}
          <motion.div variants={cardVariants} className="flex flex-col gap-4 h-full">

            {/* 数学作业等级 */}
            <div className="relative bg-white/70 backdrop-blur rounded-2xl border border-slate-200 overflow-hidden">
              <div className={`h-0.5 bg-gradient-to-r ${
                mathFails.length > 0 ? 'from-red-400 to-red-300' : 'from-emerald-400 to-emerald-300'
              }`} />
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Calculator size={15} className={mathFails.length > 0 ? 'text-red-400' : 'text-emerald-400'} />
                    <span className="text-xs font-semibold text-slate-500 tracking-wide">数学作业</span>
                  </div>
                  <span className={`text-[10px] font-mono tabular-nums ${
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
                      <div key={f.id} className="flex items-start justify-between text-[10px] py-1 border-b border-slate-100 last:border-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-medium text-red-600 shrink-0">{f.student_name}</span>
                          <span className={`text-[9px] px-1 py-0.5 rounded text-white shrink-0 ${f.group_color || 'bg-gray-400'}`}>
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

            {/* 昨日值日 */}
            <div className="relative bg-white/70 backdrop-blur rounded-2xl border border-slate-200 overflow-hidden">
              <div className={`h-0.5 bg-gradient-to-r ${
                yesterdayDutyAbsent.length > 0 ? 'from-red-400 to-red-300' : 'from-slate-300 to-slate-200'
              }`} />
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={15} className={yesterdayDutyAbsent.length > 0 ? 'text-red-400' : 'text-slate-300'} />
                    <span className="text-xs font-semibold text-slate-500 tracking-wide">昨日值日</span>
                  </div>
                  <span className={`text-[10px] font-mono tabular-nums ${
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
                      <span key={name} className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-500">
                        {name}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* 宝龙币进度条 */}
            <div className="relative bg-white/70 backdrop-blur rounded-2xl border border-slate-200 overflow-hidden mt-auto">
              <div className="h-0.5 bg-gradient-to-r from-amber-400 to-yellow-300" />
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Coins size={15} className="text-amber-400" />
                    <span className="text-xs font-semibold text-slate-500 tracking-wide">宝龙币</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono tabular-nums">目标 {COIN_TARGET}</span>
                </div>
                {belowTargetGroups.length === 0 ? (
                  <p className="text-xs text-emerald-500 text-center py-2">全部达标</p>
                ) : (
                  <div className="space-y-2">
                    {belowTargetGroups.map(cg => {
                      const pct = Math.round((cg.coins / COIN_TARGET) * 100)
                      return (
                        <div key={cg.id}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs text-slate-500">{cg.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono tabular-nums">{cg.coins}/{COIN_TARGET}</span>
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

          </motion.div>
        </div>

      </motion.div>
    </div>
  )
}
