import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Users, Medal, AlertTriangle, CheckCircle, Calculator,
  X, Maximize2, GripVertical, Coins
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

function formatDate(date: string): string {
  const d = new Date(date)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

const GlowDot = ({ color }: { color: string }) => (
  <span className={`inline-block w-1.5 h-1.5 rounded-full ${color} shadow-[0_0_4px] shadow-current`} />
)

// 卡片类型 ID
type CardId = 'attendance' | 'homework' | 'daily-practice' | 'math-homework' | 'group-ranking' | 'deductions' | 'duty' | 'coins'

const DEFAULT_ORDER: CardId[] = ['attendance', 'homework', 'daily-practice', 'math-homework', 'group-ranking', 'deductions', 'duty', 'coins']

function loadCardOrder(): CardId[] {
  try {
    const saved = localStorage.getItem('dashboard-widget-order')
    if (saved) {
      const arr = JSON.parse(saved) as CardId[]
      // 确保所有卡片都在（兼容新增卡片）
      const set = new Set(arr)
      for (const id of DEFAULT_ORDER) {
        if (!set.has(id)) arr.push(id)
      }
      return arr
    }
  } catch { /* ignore */ }
  return [...DEFAULT_ORDER]
}

function saveCardOrder(order: CardId[]): void {
  try {
    localStorage.setItem('dashboard-widget-order', JSON.stringify(order))
  } catch { /* ignore */ }
}

export default function DashboardWidgetPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [students, setStudents] = useState<StudentWithGroup[]>([])
  const [todayStatuses, setTodayStatuses] = useState<DailyStatus[]>([])
  const [coinGroups, setCoinGroups] = useState<CoinGroup[]>([])
  const [topDeductions, setTopDeductions] = useState<{ student_name: string; total_points: number }[]>([])
  const [yesterdayDutyAbsent, setYesterdayDutyAbsent] = useState<string[]>([])
  const [yesterdayHasDuty, setYesterdayHasDuty] = useState(false)
  const [todayDutyStudents, setTodayDutyStudents] = useState<DutyStudent[]>([])
  const [todayHasDuty, setTodayHasDuty] = useState(false)
  const [mathFails, setMathFails] = useState<MathHomeworkGradeWithStudent[]>([])
  const [homeworkRecords, setHomeworkRecords] = useState<{ student_name: string; subject: string; status: string }[]>([])
  const [practiceUnsigned, setPracticeUnsigned] = useState<string[]>([])
  const [attendanceWindows, setAttendanceWindows] = useState<AttendanceWindow[]>([])
  const [windowRecordsMap, setWindowRecordsMap] = useState<Map<string, AttendanceWindowRecord[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [time, setTime] = useState('')
  const [cardOrder, setCardOrder] = useState<CardId[]>(loadCardOrder)
  const [dragId, setDragId] = useState<CardId | null>(null)
  const dragOverIdRef = useRef<CardId | null>(null)

  const COIN_TARGET = 15

  const loadData = useCallback(async () => {
    try {
    const date = todayStr()
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

    const deds = await queryAll<{ student_name: string; total_points: number }>(
      `SELECT student_name, SUM(points) as total_points FROM (
        SELECT student_name, points FROM deduction_records
        UNION ALL
        SELECT student_name, -delta as points FROM manual_adjust_records WHERE delta < 0
      ) GROUP BY student_name
      ORDER BY total_points DESC LIMIT 3`
    )
    setTopDeductions(deds)

    const yRecord = await dutyApi.getDutyRecord(
      (() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
    )
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
      setTodayDutyStudents(await dutyApi.getDutyStudents(tRecord.id))
    } else {
      setTodayHasDuty(false)
      setTodayDutyStudents([])
    }

    setMathFails(await mathHomeworkApi.getFailsByDate(date))

    const hwRecords = await getRecordsByDate(date)
    setHomeworkRecords(hwRecords.map(r => ({ student_name: r.student_name, subject: r.subject, status: r.status })))

    const labels: PracticeLabel[] = ['qiangji', 'tisheng']
    const unsignedSet = new Set<string>()
    for (const label of labels) {
      const [roster, signIns] = await Promise.all([getRosterStudents(label), getSignIns(date, label)])
      const signedIds = new Set(signIns.map(si => si.student_id))
      roster.forEach(s => { if (!signedIds.has(s.id)) unsignedSet.add(s.name) })
    }
    setPracticeUnsigned(Array.from(unsignedSet))

    const aw = await winApi.getWindows(date)
    setAttendanceWindows(aw)
    const recMap = new Map<string, AttendanceWindowRecord[]>()
    for (const w of aw) {
      recMap.set(w.id, await recApi.getWindowRecords(w.id))
    }
    setWindowRecordsMap(recMap)

    setError(null)
    setLoading(false)
    } catch (e) {
      console.error('[Widget] Load data failed:', e)
      setError(e instanceof Error ? e.message : String(e))
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    setTime(formatDate(todayStr()))
    const timer = setInterval(() => { loadData(); setTime(formatDate(todayStr())) }, 30000)
    return () => clearInterval(timer)
  }, [loadData])

  const isElectron = !!window.electronAPI?.widget

  const handleClose = () => { window.electronAPI?.widget?.close() }
  const handleOpenMain = () => { window.electronAPI?.widget?.openMain() }

  // 拖拽排序
  const handleDragStart = (id: CardId) => {
    setDragId(id)
  }

  const handleDragOver = (e: React.DragEvent, id: CardId) => {
    e.preventDefault()
    dragOverIdRef.current = id
  }

  const handleDragLeave = () => {
    dragOverIdRef.current = null
  }

  const handleDrop = (id: CardId) => {
    if (!dragId || dragId === id) { setDragId(null); return }
    setCardOrder(prev => {
      const next = [...prev]
      const fromIdx = next.indexOf(dragId)
      const toIdx = next.indexOf(id)
      if (fromIdx === -1 || toIdx === -1) return prev
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, dragId)
      saveCardOrder(next)
      return next
    })
    setDragId(null)
  }

  const handleDragEnd = () => {
    setDragId(null)
  }

  // 重置为默认顺序
  const handleResetOrder = () => {
    setCardOrder([...DEFAULT_ORDER])
    saveCardOrder([...DEFAULT_ORDER])
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100">
        <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-100 gap-3 px-4">
        <AlertTriangle size={24} className="text-red-400" />
        <p className="text-xs text-slate-500 text-center">数据加载失败</p>
        <p className="text-[10px] text-red-400 text-center max-w-[280px] break-all">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); loadData() }}
          className="px-3 py-1 text-[11px] rounded bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
        >
          重试
        </button>
      </div>
    )
  }

  const studentMap = new Map(students.map(s => [s.id, s]))
  const groupMap = new Map(groups.map(g => [g.id, g]))

  const unsignedStudents = todayStatuses.filter(s => s.attendance === 'unsigned').map(s => studentMap.get(s.student_id)?.name || s.student_id)
  const lateStudentNames = todayStatuses.filter(s => s.attendance === 'late').map(s => studentMap.get(s.student_id)?.name || s.student_id)
  const leaveStudentNames = todayStatuses.filter(s => s.attendance === 'leave').map(s => studentMap.get(s.student_id)?.name || s.student_id)
  const statusStudentIds = new Set(todayStatuses.map(s => s.student_id))
  students.filter(s => !statusStudentIds.has(s.id)).forEach(s => unsignedStudents.push(s.name))

  const hasAttendanceIssues = lateStudentNames.length > 0 || leaveStudentNames.length > 0 || unsignedStudents.length > 0
  const rankedGroups = [...groups].sort((a, b) => b.total_score - a.total_score)
  const maxTotalScore = rankedGroups.length > 0 ? rankedGroups[0].total_score : 1
  const totalCoins = coinGroups.reduce((s, cg) => s + (cg.coins || 0), 0)
  const belowTargetGroups = coinGroups.filter(cg => cg.coins < COIN_TARGET)
  const rankMedals = ['🥇', '🥈', '🥉']

  // 卡片可见性
  const cardVisible = (id: CardId): boolean => {
    switch (id) {
      case 'attendance': return true
      case 'homework': return homeworkRecords.length > 0
      case 'daily-practice': return practiceUnsigned.length > 0
      case 'math-homework': return mathFails.length > 0
      case 'group-ranking': return true
      case 'deductions': return topDeductions.length > 0
      case 'duty': return true
      case 'coins': return belowTargetGroups.length > 0
    }
  }

  // 渲染单张卡片
  const renderCard = (id: CardId) => {
    const isDragging = dragId === id
    const dragHandle = (
      <div
        className="flex items-center gap-1 px-1 py-0.5 rounded cursor-grab active:cursor-grabbing hover:bg-slate-100 transition-colors"
        draggable
        onDragStart={() => handleDragStart(id)}
        onDragEnd={handleDragEnd}
        title="拖拽排序"
      >
        <GripVertical size={10} className="text-slate-300" />
      </div>
    )

    switch (id) {
      // ===== 考勤 =====
      case 'attendance':
        return (
          <div
            key={id}
            className={`bg-white rounded-xl border overflow-hidden transition-opacity ${isDragging ? 'opacity-40' : ''} ${dragOverIdRef.current === id ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200'}`}
            onDragOver={(e) => handleDragOver(e, id)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(id)}
          >
            <div className={`h-0.5 ${hasAttendanceIssues ? 'bg-gradient-to-r from-red-400 to-red-300' : 'bg-gradient-to-r from-emerald-400 to-emerald-300'}`} />
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  {dragHandle}
                  {hasAttendanceIssues ? <AlertTriangle size={13} className="text-red-400" /> : <CheckCircle size={13} className="text-emerald-400" />}
                  <span className="text-xs font-semibold text-slate-500">考勤</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="flex items-center gap-0.5"><GlowDot color="bg-emerald-400" />已签 {todayStatuses.filter(s => s.attendance === 'signed').length}</span>
                  {lateStudentNames.length > 0 && <span className="flex items-center gap-0.5"><GlowDot color="bg-red-400" />迟到 {lateStudentNames.length}</span>}
                  {leaveStudentNames.length > 0 && <span className="flex items-center gap-0.5"><GlowDot color="bg-blue-400" />请假 {leaveStudentNames.length}</span>}
                  {unsignedStudents.length > 0 && <span className="flex items-center gap-0.5"><GlowDot color="bg-slate-400" />未签 {unsignedStudents.length}</span>}
                </div>
              </div>
              {hasAttendanceIssues && (
                <div className="space-y-0.5">
                  {lateStudentNames.map(name => (
                    <div key={`late-${name}`} className="flex items-center gap-1 text-[11px]"><GlowDot color="bg-red-400" /><span className="text-red-600">{name}</span><span className="text-slate-400">迟到</span></div>
                  ))}
                  {leaveStudentNames.map(name => (
                    <div key={`leave-${name}`} className="flex items-center gap-1 text-[11px]"><GlowDot color="bg-blue-400" /><span className="text-blue-600">{name}</span><span className="text-slate-400">请假</span></div>
                  ))}
                  {unsignedStudents.slice(0, 8).map(name => (
                    <div key={`uns-${name}`} className="flex items-center gap-1 text-[11px]"><GlowDot color="bg-slate-400" /><span className="text-slate-500">{name}</span><span className="text-slate-400">未签</span></div>
                  ))}
                  {unsignedStudents.length > 8 && <div className="text-[10px] text-slate-400 pl-3">...还有 {unsignedStudents.length - 8} 人未签</div>}
                </div>
              )}
              {!hasAttendanceIssues && <p className="text-[11px] text-emerald-500">全部正常</p>}
            </div>
          </div>
        )

      // ===== 作业 =====
      case 'homework':
        return (
          <div
            key={id}
            className={`bg-white rounded-xl border border-red-200 overflow-hidden transition-opacity ${isDragging ? 'opacity-40' : ''} ${dragOverIdRef.current === id ? 'border-indigo-400 ring-1 ring-indigo-200' : ''}`}
            onDragOver={(e) => handleDragOver(e, id)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(id)}
          >
            <div className="h-0.5 bg-gradient-to-r from-red-400 to-red-300" />
            <div className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  {dragHandle}
                  <span className="text-xs font-semibold text-red-500">作业</span>
                </div>
                <span className="text-[10px] text-red-400">{homeworkRecords.length}条记录</span>
              </div>
              <div className="space-y-0.5">
                {homeworkRecords.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">{r.student_name}</span>
                    <span className={`px-1 rounded text-[10px] ${r.status === 'incomplete' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
                      {r.subject}({r.status === 'incomplete' ? '未交' : '未交齐'})
                    </span>
                  </div>
                ))}
                {homeworkRecords.length > 5 && <div className="text-[10px] text-slate-400">...还有 {homeworkRecords.length - 5} 条</div>}
              </div>
            </div>
          </div>
        )

      // ===== 每日一练 =====
      case 'daily-practice':
        return (
          <div
            key={id}
            className={`bg-white rounded-xl border border-red-200 overflow-hidden transition-opacity ${isDragging ? 'opacity-40' : ''} ${dragOverIdRef.current === id ? 'border-indigo-400 ring-1 ring-indigo-200' : ''}`}
            onDragOver={(e) => handleDragOver(e, id)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(id)}
          >
            <div className="h-0.5 bg-gradient-to-r from-red-400 to-red-300" />
            <div className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  {dragHandle}
                  <span className="text-xs font-semibold text-red-500">每日一练未签</span>
                </div>
                <span className="text-[10px] text-red-400">{practiceUnsigned.length}人</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {practiceUnsigned.map(name => (
                  <span key={name} className="text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-500">{name}</span>
                ))}
              </div>
            </div>
          </div>
        )

      // ===== 数学作业 =====
      case 'math-homework':
        return (
          <div
            key={id}
            className={`bg-white rounded-xl border border-red-200 overflow-hidden transition-opacity ${isDragging ? 'opacity-40' : ''} ${dragOverIdRef.current === id ? 'border-indigo-400 ring-1 ring-indigo-200' : ''}`}
            onDragOver={(e) => handleDragOver(e, id)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(id)}
          >
            <div className="h-0.5 bg-gradient-to-r from-red-400 to-red-300" />
            <div className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  {dragHandle}
                  <Calculator size={12} className="text-red-400" />
                  <span className="text-xs font-semibold text-red-500">数学不合格</span>
                </div>
                <span className="text-[10px] text-red-400">{mathFails.length}人</span>
              </div>
              <div className="space-y-0.5">
                {mathFails.map(f => (
                  <div key={f.id} className="flex items-center justify-between text-[11px]">
                    <span className="text-red-600">{f.student_name}</span>
                    <span className="text-slate-400">{f.reason || '-'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )

      // ===== 小组排名 =====
      case 'group-ranking':
        return (
          <div
            key={id}
            className={`bg-white rounded-xl border overflow-hidden transition-opacity ${isDragging ? 'opacity-40' : ''} ${dragOverIdRef.current === id ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200'}`}
            onDragOver={(e) => handleDragOver(e, id)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(id)}
          >
            <div className="h-0.5 bg-gradient-to-r from-amber-400 to-amber-200" />
            <div className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                {dragHandle}
                <Medal size={12} className="text-amber-400" />
                <span className="text-xs font-semibold text-slate-500">小组排名</span>
              </div>
              {rankedGroups.length === 0 ? (
                <p className="text-[11px] text-slate-400">暂无数据</p>
              ) : (
                <div className="space-y-1">
                  {rankedGroups.slice(0, 3).map((g, i) => {
                    const pct = maxTotalScore > 0 ? Math.round((g.total_score / maxTotalScore) * 100) : 0
                    const barGrad = i === 0 ? 'from-amber-400 to-amber-300' : i === 1 ? 'from-slate-300 to-slate-200' : i === 2 ? 'from-orange-400 to-orange-300' : 'from-indigo-300 to-indigo-200'
                    return (
                      <div key={g.id} className="flex items-center gap-2">
                        <span className={`text-xs w-5 text-center font-bold ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-400' : 'text-indigo-400'}`}>
                          {i < 3 ? rankMedals[i] : i + 1}
                        </span>
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded text-white ${g.color || 'bg-gray-400'}`}>
                          {g.name}
                        </span>
                        <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden relative">
                          <div className={`h-full bg-gradient-to-r ${barGrad} rounded-full transition-[width] duration-700`} style={{ width: `${Math.max(pct, 8)}%` }} />
                          <span className="absolute inset-0 flex items-center px-2 text-[10px] font-mono font-bold text-slate-600">{g.total_score}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )

      // ===== 扣分排行 =====
      case 'deductions':
        return (
          <div
            key={id}
            className={`bg-white rounded-xl border overflow-hidden transition-opacity ${isDragging ? 'opacity-40' : ''} ${dragOverIdRef.current === id ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200'}`}
            onDragOver={(e) => handleDragOver(e, id)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(id)}
          >
            <div className="h-0.5 bg-gradient-to-r from-red-400 to-rose-300" />
            <div className="p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                {dragHandle}
                <span className="text-xs font-semibold text-slate-500">扣分排行</span>
              </div>
              <div className="space-y-0.5">
                {topDeductions.map((d, i) => (
                  <div key={d.student_name} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1">
                      <span className={`font-mono font-bold w-4 text-center ${i === 0 ? 'text-red-500' : i === 1 ? 'text-orange-500' : 'text-amber-500'}`}>{i + 1}</span>
                      <span className="text-slate-600">{d.student_name}</span>
                    </div>
                    <span className="font-mono font-bold text-red-500">-{d.total_points}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )

      // ===== 值日 =====
      case 'duty':
        return (
          <div
            key={id}
            className={`bg-white rounded-xl border overflow-hidden transition-opacity ${isDragging ? 'opacity-40' : ''} ${dragOverIdRef.current === id ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200'}`}
            onDragOver={(e) => handleDragOver(e, id)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(id)}
          >
            <div className="h-0.5 bg-gradient-to-r from-indigo-400 to-indigo-300" />
            <div className="p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                {dragHandle}
                <span className="text-xs font-semibold text-slate-500">值日</span>
              </div>
              <div className="space-y-1.5">
                <div>
                  <span className="text-[10px] text-slate-400">今日</span>
                  {!todayHasDuty || todayDutyStudents.length === 0 ? (
                    <span className="text-[11px] text-slate-400 ml-2">未安排</span>
                  ) : (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {todayDutyStudents.map(ds => (
                        <span key={ds.id} className="text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{ds.student_name}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="border-t border-slate-100 pt-1.5">
                  <span className="text-[10px] text-slate-400">昨日</span>
                  {yesterdayDutyAbsent.length === 0 ? (
                    <span className="text-[11px] text-slate-400 ml-2">{yesterdayHasDuty ? '全勤' : '未安排'}</span>
                  ) : (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {yesterdayDutyAbsent.map(name => (
                        <span key={name} className="text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-500">{name}</span>
                      ))}
                      <span className="text-[10px] text-red-400">缺勤</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )

      // ===== 宝龙币 =====
      case 'coins':
        return (
          <div
            key={id}
            className={`bg-white rounded-xl border overflow-hidden transition-opacity ${isDragging ? 'opacity-40' : ''} ${dragOverIdRef.current === id ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200'}`}
            onDragOver={(e) => handleDragOver(e, id)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(id)}
          >
            <div className="h-0.5 bg-gradient-to-r from-amber-400 to-yellow-300" />
            <div className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  {dragHandle}
                  <Coins size={12} className="text-amber-400" />
                  <span className="text-xs font-semibold text-slate-500">宝龙币</span>
                </div>
                <span className="text-[10px] text-slate-400">目标 {COIN_TARGET}</span>
              </div>
              <div className="space-y-1.5">
                {belowTargetGroups.map(cg => {
                  const pct = Math.round((cg.coins / COIN_TARGET) * 100)
                  return (
                    <div key={cg.id}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[11px] text-slate-500">{cg.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{cg.coins}/{COIN_TARGET}</span>
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(pct, 100)}%`, background: `linear-gradient(90deg, #fbbf24, ${pct >= 100 ? '#34d399' : '#f59e0b'})` }} />
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
  }

  return (
    <div className="h-screen flex flex-col bg-slate-100 select-none">
      {/* 自定义标题栏（可拖拽） */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-white border-b border-slate-200 shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2 text-slate-500">
          <GripVertical size={14} />
          <span className="text-xs font-semibold tracking-wide">班级看板</span>
          <span className="text-[10px] text-slate-400 font-mono">{time}</span>
        </div>
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={handleResetOrder}
            className="p-1 rounded hover:bg-slate-100 text-slate-300 hover:text-slate-500 transition-colors text-[10px]"
            title="重置卡片顺序"
          >
            重置
          </button>
          {isElectron && (
            <>
              <button
                onClick={handleOpenMain}
                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-500 transition-colors"
                title="展开完整窗口"
              >
                <Maximize2 size={14} />
              </button>
              <button
                onClick={handleClose}
                className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                title="关闭便签"
              >
                <X size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto px-3 py-2 space-y-2">
        {/* 概览条 */}
        <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
          <span className="flex items-center gap-1"><Users size={10} />{students.length}人</span>
          <span>{groups.length}组</span>
          <span className="flex items-center gap-1"><Coins size={10} className="text-amber-400" />{totalCoins}</span>
        </div>

        {/* 按用户排序渲染卡片 */}
        {cardOrder.filter(cardVisible).map(renderCard)}

        {/* 底部留白 */}
        <div className="h-2" />
      </div>
    </div>
  )
}
