import { useState, useEffect, useCallback } from 'react'
import { ArrowUpDown, Trash2, Lock } from 'lucide-react'
import { queryAll, executeRun } from '@/lib/db'
import * as studentApi from '@/lib/students'
import { DUTY_PASSWORD } from '@/lib/duty'
import { useNotification } from '@/components/notify/NotificationProvider'
import type { DailyStatus, StudentWithGroup } from '@/types'

interface GrowthRecord {
  studentId: string
  studentName: string
  groupName: string
  lateCount: number
  homeworkIssueCount: number
  manualDeductionPoints: number
  dutyNoSignInCount: number
  practiceUnsignedCount: number
  total: number
}

type SortKey = keyof GrowthRecord

interface MonthRange {
  start: string
  end: string
  label: string
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDefaultRange() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const startDate = new Date(currentYear, currentMonth - 4, 1)
  const endDate = new Date(currentYear, currentMonth + 1, 0)

  const months: MonthRange[] = []
  const cursor = new Date(startDate)
  while (cursor <= endDate) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    months.push({
      start: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01`,
      end: `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`,
      label: `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return {
    startDate: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`,
    endDate: `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`,
    months,
    label: `${startDate.getFullYear()}年${startDate.getMonth() + 1}月 - ${endDate.getFullYear()}年${endDate.getMonth() + 1}月`,
  }
}

function getMonthsInRange(startDate: string, endDate: string): MonthRange[] {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const months: MonthRange[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cursor <= end) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    months.push({
      start: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01`,
      end: `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`,
      label: `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

// 最早日期：三年前的今天
function minDate(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 3)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function GrowthRecordsPage() {
  const [records, setRecords] = useState<GrowthRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [months, setMonths] = useState<MonthRange[]>([])
  const [startDate, setStartDate] = useState(() => getDefaultRange().startDate)
  const [endDate, setEndDate] = useState(() => getDefaultRange().endDate)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [clearing, setClearing] = useState(false)
  const notify = useNotification()

  const loadData = useCallback(async () => {
    setLoading(true)
    const ms = getMonthsInRange(startDate, endDate)
    setMonths(ms)

    const rangeStart = new Date(startDate + 'T00:00:00').getTime()
    const rangeEnd = new Date(endDate + 'T23:59:59.999').getTime()

    const [students, allStatuses, dutyCounts, adjustTotals] = await Promise.all([
      studentApi.getAllStudents(),
      queryAll<DailyStatus>(
        'SELECT * FROM daily_statuses WHERE date >= ? AND date <= ?',
        [startDate, endDate]
      ),
      queryAll<{ student_id: string; count: number }>(
        `SELECT ds.student_id, COUNT(*) as count
         FROM duty_students ds
         JOIN duty_records dr ON dr.id = ds.duty_record_id
         WHERE ds.sign_in_time IS NULL AND dr.date >= ? AND dr.date <= ?
         GROUP BY ds.student_id`,
        [startDate, endDate]
      ),
      queryAll<{ student_id: string; total_delta: number }>(
        `SELECT student_id, SUM(delta) as total_delta
         FROM manual_adjust_records
         WHERE timestamp >= ? AND timestamp <= ?
         GROUP BY student_id`,
        [rangeStart, rangeEnd]
      ),
    ])

    const lateMap = new Map<string, number>()
    for (const s of allStatuses) {
      if (s.attendance === 'late') {
        lateMap.set(s.student_id, (lateMap.get(s.student_id) || 0) + 1)
      }
    }

    const hwMap = new Map<string, number>()
    for (const s of allStatuses) {
      if (s.homework === 'incomplete' || s.homework === 'not_submitted') {
        hwMap.set(s.student_id, (hwMap.get(s.student_id) || 0) + 1)
      }
    }

    const dutyMap = new Map<string, number>()
    for (const d of dutyCounts) {
      dutyMap.set(d.student_id, d.count)
    }

    const practiceMap = new Map<string, number>()
    for (const s of allStatuses) {
      if (s.daily_practice === 'unsigned') {
        practiceMap.set(s.student_id, (practiceMap.get(s.student_id) || 0) + 1)
      }
    }

    const adjustMap = new Map<string, number>()
    for (const a of adjustTotals) {
      adjustMap.set(a.student_id, a.total_delta)
    }

    const result: GrowthRecord[] = students
      .map(st => {
      const lateCount = lateMap.get(st.id) || 0
      const homeworkIssueCount = hwMap.get(st.id) || 0
      const manualDeductionPoints = adjustMap.get(st.id) || 0
      const dutyNoSignInCount = dutyMap.get(st.id) || 0
      const practiceUnsignedCount = practiceMap.get(st.id) || 0

      return {
        studentId: st.id,
        studentName: st.name,
        groupName: (st as StudentWithGroup).group_name || '',
        lateCount,
        homeworkIssueCount,
        manualDeductionPoints,
        dutyNoSignInCount,
        practiceUnsignedCount,
        total: lateCount + homeworkIssueCount + dutyNoSignInCount + practiceUnsignedCount,
      }
    })

    setRecords(result)
    setLoading(false)
  }, [startDate, endDate])

  useEffect(() => { loadData() }, [loadData])

  const sorted = [...records].sort((a, b) => {
    const va = a[sortKey] as number
    const vb = b[sortKey] as number
    return sortDir === 'desc' ? vb - va : va - vb
  })

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const handleClear = async () => {
    const dutyPassword = localStorage.getItem('duty_password') || DUTY_PASSWORD
    if (passwordInput !== dutyPassword) {
      setPasswordError('密码错误')
      return
    }
    setClearing(true)
    try {
      const now = Date.now()
      await executeRun('DELETE FROM daily_statuses', [])
      await executeRun('DELETE FROM duty_students', [])
      await executeRun('DELETE FROM duty_records', [])
      setPasswordModalOpen(false)
      setPasswordInput('')
      setPasswordError('')
      notify.enqueue('成长记录已清空')
      loadData()
    } catch (e) {
      console.error('清空记录失败:', e)
    } finally {
      setClearing(false)
    }
  }

  const SortableHead = ({ label, skey }: { label: string; skey: SortKey }) => (
    <th
      className="text-center px-3 py-3 text-sm font-medium text-stone-500 cursor-pointer hover:text-stone-700 select-none"
      onClick={() => handleSort(skey)}
    >
      <div className="flex items-center justify-center gap-1">
        {label}
        <ArrowUpDown size={12} className={sortKey === skey ? 'text-primary-500' : 'text-stone-300'} />
      </div>
    </th>
  )

  if (loading) return <div className="flex items-center justify-center h-full text-stone-400">加载中...</div>

  const sum = (key: keyof GrowthRecord) => records.reduce((s, r) => s + (r[key] as number), 0)

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        {/* 标题栏：标题 + 日期范围 + 清空按钮 */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-800">学生成长记录</h1>
            <p className="text-sm text-stone-500 mt-1">
              {startDate} ~ {endDate} · 共 {months.length} 个月
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-stone-500">范围</span>
              <input
                type="date"
                value={startDate}
                min={minDate()}
                max={todayStr()}
                onChange={e => setStartDate(e.target.value)}
                className="border rounded-lg px-2 py-1 text-sm text-stone-600"
              />
              <span className="text-stone-400">至</span>
              <input
                type="date"
                value={endDate}
                min={minDate()}
                max={todayStr()}
                onChange={e => setEndDate(e.target.value)}
                className="border rounded-lg px-2 py-1 text-sm text-stone-600"
              />
            </div>
            <button
              onClick={() => { setPasswordModalOpen(true); setPasswordInput(''); setPasswordError('') }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
            >
              <Trash2 size={14} />
              清空记录
            </button>
          </div>
        </div>

        {/* 概览卡片 */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          {[
            { label: '迟到总次数', value: sum('lateCount'), color: 'text-yellow-600' },
            { label: '作业问题总次数', value: sum('homeworkIssueCount'), color: 'text-purple-600' },
            { label: '手动加减分总分数', value: sum('manualDeductionPoints'), color: 'text-green-600' },
            { label: '值日未签到总次数', value: sum('dutyNoSignInCount'), color: 'text-orange-600' },
            { label: '每日一练未签总次数', value: sum('practiceUnsignedCount'), color: 'text-red-600' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-lg border p-3 text-center">
              <div className="text-xs text-stone-500">{item.label}</div>
              <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
            </div>
          ))}
        </div>

        <p className="text-sm text-stone-500 mb-3">
          汇总 {records.length} 名学生 · 各月数据范围 {months.map(m => m.label).join('、')}
        </p>

        {/* 数据表格 */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-stone-50 border-b">
                <th className="text-left px-4 py-3 text-sm font-medium text-stone-500 w-12">#</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-stone-500">姓名</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-stone-500">小组</th>
                <SortableHead label="迟到" skey="lateCount" />
                <SortableHead label="作业问题" skey="homeworkIssueCount" />
                <SortableHead label="手动加减分" skey="manualDeductionPoints" />
                <SortableHead label="值日未签到" skey="dutyNoSignInCount" />
                <SortableHead label="每日一练未签" skey="practiceUnsignedCount" />
                <SortableHead label="合计" skey="total" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((r, i) => (
                <tr key={r.studentId} className="hover:bg-stone-50">
                  <td className="px-4 py-2 text-sm text-stone-500">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-sm">{r.studentName}</td>
                  <td className="px-4 py-2 text-xs text-stone-500">{r.groupName}</td>
                  <td className="px-3 py-2 text-center text-sm">
                    <span className={r.lateCount > 0 ? 'text-yellow-600 font-semibold' : 'text-stone-300'}>
                      {r.lateCount}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-sm">
                    <span className={r.homeworkIssueCount > 0 ? 'text-purple-600 font-semibold' : 'text-stone-300'}>
                      {r.homeworkIssueCount}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-sm">
                    <span className={
                      r.manualDeductionPoints > 0 ? 'text-green-600 font-semibold' :
                      r.manualDeductionPoints < 0 ? 'text-red-600 font-semibold' :
                      'text-stone-300'
                    }>
                      {r.manualDeductionPoints > 0 ? `+${r.manualDeductionPoints}` : r.manualDeductionPoints || 0}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-sm">
                    <span className={r.dutyNoSignInCount > 0 ? 'text-orange-600 font-semibold' : 'text-stone-300'}>
                      {r.dutyNoSignInCount}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-sm">
                    <span className={r.practiceUnsignedCount > 0 ? 'text-red-600 font-semibold' : 'text-stone-300'}>
                      {r.practiceUnsignedCount}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-sm font-bold">
                    <span className={r.total > 0 ? 'text-stone-700' : 'text-stone-300'}>
                      {r.total}
                    </span>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12 text-stone-400">暂无数据</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 密码验证弹窗 */}
        {passwordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setPasswordModalOpen(false)}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-80" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-4">
                <Lock size={18} className="text-amber-500" />
                <h3 className="text-lg font-bold text-stone-800">验证密码</h3>
              </div>
              <p className="text-sm text-stone-500 mb-3">清空记录将删除所有考勤、值日签到等成长相关数据，不可恢复。</p>
              <input
                type="password"
                value={passwordInput}
                onChange={e => { setPasswordInput(e.target.value); setPasswordError('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleClear() }}
                placeholder="请输入密码"
                className="w-full border rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary-300"
                autoFocus
              />
              {passwordError && <p className="text-xs text-red-500 mb-2">{passwordError}</p>}
              <div className="flex gap-2 justify-end mt-3">
                <button onClick={() => setPasswordModalOpen(false)} className="px-4 py-2 text-sm text-stone-500 hover:bg-stone-100 rounded-lg transition-colors">取消</button>
                <button
                  onClick={handleClear}
                  disabled={clearing}
                  className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {clearing ? '清空中...' : '确认清空'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
