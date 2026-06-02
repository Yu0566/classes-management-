import { useState, useEffect, useCallback } from 'react'
import { ArrowUpDown, Search } from 'lucide-react'
import * as studentApi from '@/lib/students'
import { adjustStudentScore } from '@/lib/students'
import { queryAll } from '@/lib/db'
import { calculateAllScores, resetAllScores, type StudentScore } from '@/lib/scores'
import { getAllScoreSettings, setScoreSetting, setScorePoints } from '@/lib/score-settings'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { StudentWithGroup, DailyStatus, DeductionRecord, ManualAdjustRecord } from '@/types'

type SortKey = keyof StudentScore

export default function StudentScoresPage() {
  const { confirm } = useConfirm()
  const [tab, setTab] = useState<'scores' | 'deductions'>('scores')
  const [scores, setScores] = useState<StudentScore[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(new Set())
  const [categoryPoints, setCategoryPoints] = useState<Map<string, number>>(new Map())

  // 扣分记录相关
  const [deductions, setDeductions] = useState<DeductionRecord[]>([])
  const [manualAdjusts, setManualAdjusts] = useState<ManualAdjustRecord[]>([])
  const [searchName, setSearchName] = useState('')
  const [searchDate, setSearchDate] = useState('')
  const loadData = useCallback(async () => {
    const [students, allStatuses, d, m] = await Promise.all([
      studentApi.getAllStudents(),
      queryAll<DailyStatus>('SELECT * FROM daily_statuses'),
      queryAll<DeductionRecord>('SELECT * FROM deduction_records ORDER BY timestamp DESC LIMIT 500'),
      queryAll<ManualAdjustRecord>('SELECT * FROM manual_adjust_records ORDER BY timestamp DESC LIMIT 500'),
    ])

    const statusMap = new Map<string, DailyStatus[]>()
    for (const s of allStatuses) {
      const arr = statusMap.get(s.student_id) || []
      arr.push(s)
      statusMap.set(s.student_id, arr)
    }

    const settingsMap = await getAllScoreSettings()
    const enabled = new Set<string>()
    const pts = new Map<string, number>()
    for (const [cat, setting] of settingsMap) {
      if (setting.enabled) enabled.add(cat)
      pts.set(cat, setting.points)
    }
    setEnabledCategories(enabled)
    setCategoryPoints(pts)
    setScores(calculateAllScores(students, statusMap, enabled, pts))
    setDeductions(d)
    setManualAdjusts(m)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const sorted = [...scores].sort((a, b) => {
    const va = a[sortKey] as number
    const vb = b[sortKey] as number
    return sortDir === 'desc' ? vb - va : va - vb
  })

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortableHead = ({ label, skey }: { label: string; skey: SortKey }) => (
    <th
      className="text-center px-3 py-3 text-sm font-medium text-gray-500 cursor-pointer hover:text-gray-700 select-none"
      onClick={() => handleSort(skey)}
    >
      <div className="flex items-center justify-center gap-1">
        {label}
        <ArrowUpDown size={12} className={sortKey === skey ? 'text-primary-500' : 'text-gray-300'} />
      </div>
    </th>
  )

  const filteredDeductions = deductions.filter(d => {
    if (searchName && !d.student_name.includes(searchName)) return false
    if (searchDate && d.date !== searchDate) return false
    return true
  })

  const filteredManual = manualAdjusts.filter(m => {
    if (searchName && !m.student_name.includes(searchName)) return false
    return true
  })

  const quickAdjust = async (studentId: string, studentName: string, delta: number) => {
    try {
      await adjustStudentScore(studentId, studentName, delta, '手动调整')
      await loadData()
    } catch (err) {
      console.error('[quickAdjust]', err)
    }
  }

  const handleToggle = async (category: string) => {
    const newEnabled = !enabledCategories.has(category)
    await setScoreSetting(category, newEnabled)
    await loadData()
  }

  const handlePointsChange = async (category: string, value: string) => {
    const num = parseInt(value, 10)
    if (isNaN(num) || num < 0 || num > 99) return
    await setScorePoints(category, num)
    await loadData()
  }

  const quickPoints = async (category: string, delta: number) => {
    const current = categoryPoints.get(category) ?? 1
    const next = current + delta
    if (next < 0 || next > 99) return
    await setScorePoints(category, next)
    await loadData()
  }

  const handleReset = async () => {
    if (!await confirm({ message: '确认清零所有个人积分？\n\n这将清空所有学生的积分、每日状态、扣分记录和手动调整记录。此操作不可恢复。' })) return
    await resetAllScores()
    await loadData()
  }

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>

  const totalScore = sorted.reduce((sum, s) => sum + s.total, 0)

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800">个人积分</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setTab('scores')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'scores' ? 'bg-primary-500 text-white' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              积分一览
            </button>
            <button
              onClick={() => setTab('deductions')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'deductions' ? 'bg-primary-500 text-white' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              扣分记录
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
            >
              积分清零
            </button>
          </div>
        </div>

        {tab === 'scores' ? (
          <>
            {/* 积分概览卡 */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                { label: '每日一练', value: sorted.reduce((s, x) => s + x.dailyPractice, 0), color: 'text-blue-600' },
                { label: '考勤', value: sorted.reduce((s, x) => s + x.attendance, 0), color: 'text-yellow-600' },
                { label: '作业', value: sorted.reduce((s, x) => s + x.homework, 0), color: 'text-purple-600' },
                { label: '手动调整', value: sorted.reduce((s, x) => s + x.manualOffset, 0), color: 'text-red-600' },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-lg border p-3 text-center">
                  <div className="text-xs text-gray-500">{item.label}</div>
                  <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* 扣分项开关 */}
            <div className="flex items-center gap-4 mb-3 flex-wrap">
              <span className="text-xs text-gray-400">扣分项：</span>
              {[
                { key: 'daily_practice', label: '每日一练' },
                { key: 'attendance', label: '考勤' },
                { key: 'homework', label: '作业' },
              ].map(item => {
                const pts = categoryPoints.get(item.key) ?? 1
                const on = enabledCategories.has(item.key)
                return (
                  <div key={item.key} className="flex items-center gap-2">
                    {/* 开关 */}
                    <div
                      onClick={() => handleToggle(item.key)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                        on ? 'bg-primary-500' : 'bg-gray-300'
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        on ? 'translate-x-4' : 'translate-x-1'
                      }`} />
                    </div>
                    <span className={`text-xs whitespace-nowrap ${on ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                      {item.label}
                    </span>

                    {/* 分数调整 */}
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => quickPoints(item.key, -1)}
                        className="w-5 h-6 flex items-center justify-center text-xs border border-gray-200 rounded-l hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                      >−</button>
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={pts}
                        onChange={e => handlePointsChange(item.key, e.target.value)}
                        className="w-9 h-6 text-center text-xs border-y border-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        title="扣分分值"
                      />
                      <button
                        type="button"
                        onClick={() => quickPoints(item.key, 1)}
                        className="w-5 h-6 flex items-center justify-center text-xs border border-gray-200 rounded-r hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                      >+</button>
                    </div>
                    <span className="text-xs text-gray-400">分</span>
                  </div>
                )
              })}
            </div>

            <p className="text-sm text-gray-500 mb-3">
              汇总 {sorted.length} 名学生 · 总积分 {totalScore}
            </p>

            {/* 积分表 */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">排名</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">姓名</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">小组</th>
                    <SortableHead label="总积分" skey="total" />
                    <SortableHead label="每日一练" skey="dailyPractice" />
                    <SortableHead label="考勤" skey="attendance" />
                    <SortableHead label="作业" skey="homework" />
                    <SortableHead label="手动调整" skey="manualOffset" />
                    <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">统计天数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((s, i) => (
                    <tr key={s.studentId} className={`hover:bg-gray-50 ${i < 3 ? 'bg-yellow-50/50' : ''}`}>
                      <td className="px-4 py-2">
                        <span className={`text-sm font-bold ${
                          i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-gray-500'
                        }`}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-medium">{s.studentName}</td>
                      <td className="px-4 py-2 text-xs text-gray-500">{s.groupName}</td>
                      <td className={`px-3 py-2 text-center font-bold ${s.total >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {s.total}
                      </td>
                      <td className="px-3 py-2 text-center text-sm">{s.dailyPractice}</td>
                      <td className="px-3 py-2 text-center text-sm">{s.attendance}</td>
                      <td className="px-3 py-2 text-center text-sm">{s.homework}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => quickAdjust(s.studentId, s.studentName, -1)}
                            className="w-5 h-5 rounded border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-500 hover:border-red-300 text-xs leading-none flex items-center justify-center transition-colors"
                          >−</button>
                          <span className={`text-sm font-medium w-5 ${s.manualOffset > 0 ? 'text-green-600' : s.manualOffset < 0 ? 'text-red-500' : 'text-gray-300'}`}>
                            {s.manualOffset}
                          </span>
                          <button
                            onClick={() => quickAdjust(s.studentId, s.studentName, 1)}
                            className="w-5 h-5 rounded border border-gray-200 text-gray-400 hover:bg-green-50 hover:text-green-500 hover:border-green-300 text-xs leading-none flex items-center justify-center transition-colors"
                          >+</button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-gray-400">{s.statusCount}天</td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr><td colSpan={9} className="text-center py-12 text-gray-400">暂无数据</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            {/* 扣分统计概览 */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                { label: '扣分总条数', value: deductions.length, color: 'text-red-600' },
                { label: '累计扣分', value: deductions.reduce((s, d) => s + d.points, 0), color: 'text-red-600' },
                { label: '手动调整条数', value: manualAdjusts.length, color: 'text-blue-600' },
                { label: '手动调整净额', value: manualAdjusts.reduce((s, m) => s + m.delta, 0), color: 'text-blue-600' },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-lg border p-3 text-center">
                  <div className="text-xs text-gray-500">{item.label}</div>
                  <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* 筛选 */}
            <div className="flex items-center gap-2 mb-4">
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text" placeholder="搜索姓名..."
                  value={searchName} onChange={e => setSearchName(e.target.value)}
                  className="pl-7 pr-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-400 w-32"
                />
              </div>
              <input
                type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-400"
              />
            </div>

            {/* 系统扣分列表 */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-4">
              <h3 className="px-4 py-2 text-sm font-medium text-gray-500 bg-gray-50 border-b">系统自动扣分</h3>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">姓名</th>
                    <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">扣分</th>
                    <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">原因</th>
                    <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">日期</th>
                    <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredDeductions.map(d => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm font-medium">{d.student_name}</td>
                      <td className="px-4 py-2 text-sm text-red-600 font-bold">-{d.points}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">{d.reason}</td>
                      <td className="px-4 py-2 text-sm text-gray-400">{d.date}</td>
                      <td className="px-4 py-2 text-xs text-gray-400">{new Date(d.timestamp).toLocaleString('zh-CN')}</td>
                    </tr>
                  ))}
                  {filteredDeductions.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">暂无系统扣分记录</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 手动调整列表 */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <h3 className="px-4 py-2 text-sm font-medium text-gray-500 bg-gray-50 border-b">手动调整记录</h3>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">姓名</th>
                    <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">调整</th>
                    <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">原因</th>
                    <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredManual.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm font-medium">{m.student_name}</td>
                      <td className={`px-4 py-2 text-sm font-bold ${m.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {m.delta >= 0 ? '+' : ''}{m.delta}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600">{m.reason}</td>
                      <td className="px-4 py-2 text-xs text-gray-400">{new Date(m.timestamp).toLocaleString('zh-CN')}</td>
                    </tr>
                  ))}
                  {filteredManual.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-gray-400 text-sm">暂无手动调整记录</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

    </div>
  )
}
