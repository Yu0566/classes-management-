import { useState, useEffect, useCallback } from 'react'
import { ArrowUpDown, Lock, Search } from 'lucide-react'
import * as studentApi from '@/lib/students'
import { adjustStudentScore } from '@/lib/students'
import { queryAll } from '@/lib/db'
import { calculateAllScores, resetAllScores, type StudentScore } from '@/lib/scores'
import { getAllScoreSettings, setScoreSetting, setScorePoints } from '@/lib/score-settings'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DUTY_PASSWORD } from '@/lib/duty'
import type { StudentWithGroup, DailyStatus } from '@/types'
import { getUnifiedLedger, type LedgerEntry, type LedgerType } from '@/lib/score-ledger'

type SortKey = keyof StudentScore

export default function StudentScoresPage() {
  const { confirm } = useConfirm()
  const [tab, setTab] = useState<'scores' | 'ledger'>('scores')
  const [scores, setScores] = useState<StudentScore[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(new Set())
  const [categoryPoints, setCategoryPoints] = useState<Map<string, number>>(new Map())
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState('')

  // 积分流水
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [ledgerType, setLedgerType] = useState<LedgerType | 'all'>('all')
  const [searchName, setSearchName] = useState('')
  const [searchDate, setSearchDate] = useState('')
  const loadData = useCallback(async () => {
    const [students, allStatuses, ledgerData] = await Promise.all([
      studentApi.getAllStudents(),
      queryAll<DailyStatus>('SELECT * FROM daily_statuses'),
      getUnifiedLedger(),
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
    setLedger(ledgerData)
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
      className="text-center px-3 py-3 text-sm font-medium text-stone-500 cursor-pointer hover:text-stone-700 select-none"
      onClick={() => handleSort(skey)}
    >
      <div className="flex items-center justify-center gap-1">
        {label}
        <ArrowUpDown size={12} className={sortKey === skey ? 'text-primary-500' : 'text-stone-300'} />
      </div>
    </th>
  )

  const filteredLedger = ledger.filter(entry => {
    if (ledgerType !== 'all' && entry.type !== ledgerType) return false
    if (searchName) {
      const name = entry.studentName || entry.groupName || ''
      if (!name.includes(searchName)) return false
    }
    if (searchDate && entry.date !== searchDate) return false
    return true
  })

  const deductionCount = ledger.filter(e => e.type === 'deduction').length
  const deductionTotal = ledger.filter(e => e.type === 'deduction').reduce((s, e) => s + e.points, 0)
  const manualCount = ledger.filter(e => e.type === 'manual').length
  const manualTotal = ledger.filter(e => e.type === 'manual').reduce((s, e) => s + e.points, 0)
  const groupCount = ledger.filter(e => e.type === 'group').length
  const groupTotal = ledger.filter(e => e.type === 'group').reduce((s, e) => s + e.points, 0)

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
    setPasswordModalOpen(true)
    setPasswordInput('')
    setPasswordError('')
  }

  const confirmReset = async () => {
    const dutyPassword = localStorage.getItem('duty_password') || DUTY_PASSWORD
    if (passwordInput !== dutyPassword) {
      setPasswordError('密码错误')
      return
    }
    setPasswordModalOpen(false)
    setPasswordInput('')
    setPasswordError('')
    await resetAllScores()
    await loadData()
  }

  if (loading) return <div className="flex items-center justify-center h-full text-stone-400">加载中...</div>

  const totalScore = sorted.reduce((sum, s) => sum + s.total, 0)

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-stone-800">个人积分</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setTab('scores')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'scores' ? 'bg-primary-500 text-white' : 'border border-stone-200 text-stone-500 hover:bg-stone-50'
              }`}
            >
              积分一览
            </button>
            <button
              onClick={() => setTab('ledger')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'ledger' ? 'bg-primary-500 text-white' : 'border border-stone-200 text-stone-500 hover:bg-stone-50'
              }`}
            >
              积分流水
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
            >
              <Lock size={14} /> 密码清零
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
                  <div className="text-xs text-stone-500">{item.label}</div>
                  <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* 扣分项开关 */}
            <div className="flex items-center gap-6 mb-3 flex-wrap">
              {[
                { key: 'daily_practice', label: '每日一练', color: 'blue' },
                { key: 'attendance', label: '考勤', color: 'yellow' },
                { key: 'homework', label: '作业', color: 'purple' },
              ].map(item => {
                const pts = categoryPoints.get(item.key) ?? 1
                const on = enabledCategories.has(item.key)
                const colorMap: Record<string, string> = {
                  blue: 'bg-blue-500',
                  yellow: 'bg-yellow-500',
                  purple: 'bg-purple-500',
                }
                const onColor = colorMap[item.color]
                return (
                  <div key={item.key} className="flex items-center gap-3 bg-white rounded-xl border px-4 py-2.5 shadow-sm">
                    {/* 标签 */}
                    <span className={`text-sm font-medium whitespace-nowrap ${on ? 'text-stone-800' : 'text-stone-400'}`}>
                      {item.label}
                    </span>
                    {/* 开关 */}
                    <button
                      type="button"
                      onClick={() => handleToggle(item.key)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer focus:outline-none ${
                        on ? onColor : 'bg-stone-300'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        on ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>

                    {/* 分数调整 */}
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => quickPoints(item.key, -1)}
                        disabled={pts <= 0}
                        className="w-7 h-7 flex items-center justify-center text-sm border border-stone-300 rounded-l-lg hover:bg-stone-100 text-stone-500 hover:text-stone-700 transition-colors disabled:opacity-30"
                      >−</button>
                      <span className="w-9 h-7 text-center text-sm font-semibold border-y border-stone-300 flex items-center justify-center bg-stone-50 text-stone-700">
                        {pts}
                      </span>
                      <button
                        type="button"
                        onClick={() => quickPoints(item.key, 1)}
                        disabled={pts >= 99}
                        className="w-7 h-7 flex items-center justify-center text-sm border border-stone-300 rounded-r-lg hover:bg-stone-100 text-stone-500 hover:text-stone-700 transition-colors disabled:opacity-30"
                      >+</button>
                    </div>
                    <span className="text-xs text-stone-400">分/次</span>
                  </div>
                )
              })}
            </div>

            <p className="text-sm text-stone-500 mb-3">
              汇总 {sorted.length} 名学生 · 总积分 {totalScore}
            </p>

            {/* 积分表 */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-stone-50 border-b">
                    <th className="text-left px-4 py-3 text-sm font-medium text-stone-500">排名</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-stone-500">姓名</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-stone-500">小组</th>
                    <SortableHead label="总积分" skey="total" />
                    <SortableHead label="每日一练" skey="dailyPractice" />
                    <SortableHead label="考勤" skey="attendance" />
                    <SortableHead label="作业" skey="homework" />
                    <SortableHead label="手动调整" skey="manualOffset" />
                    <th className="text-center px-3 py-3 text-sm font-medium text-stone-500">统计天数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((s, i) => (
                    <tr key={s.studentId} className={`hover:bg-stone-50 ${i < 3 ? 'bg-yellow-50/50' : ''}`}>
                      <td className="px-4 py-2">
                        <span className={`text-sm font-bold ${
                          i === 0 ? 'text-yellow-500' : i === 1 ? 'text-stone-400' : i === 2 ? 'text-orange-400' : 'text-stone-500'
                        }`}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-medium">{s.studentName}</td>
                      <td className="px-4 py-2 text-xs text-stone-500">{s.groupName}</td>
                      <td className={`px-3 py-2 text-center font-bold ${s.total >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {s.total}
                      </td>
                      <td className="px-3 py-2 text-center text-sm">{s.dailyPractice}</td>
                      <td className="px-3 py-2 text-center text-sm">{s.attendance}</td>
                      <td className="px-3 py-2 text-center text-sm">{s.homework}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => quickAdjust(s.studentId, s.studentName, -1)}
                            className="w-6 h-6 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-500 hover:border-red-300 text-sm flex items-center justify-center transition-all"
                          >−</button>
                          <span className={`text-sm font-semibold w-6 text-center ${s.manualOffset > 0 ? 'text-green-600' : s.manualOffset < 0 ? 'text-red-500' : 'text-stone-300'}`}>
                            {s.manualOffset}
                          </span>
                          <button
                            onClick={() => quickAdjust(s.studentId, s.studentName, 1)}
                            className="w-6 h-6 rounded-lg border border-green-200 text-green-400 hover:bg-green-50 hover:text-green-500 hover:border-green-300 text-sm flex items-center justify-center transition-all"
                          >+</button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-stone-400">{s.statusCount}天</td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr><td colSpan={9} className="text-center py-12 text-stone-400">暂无数据</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            {/* 积分流水统计概览 */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                { label: '系统扣分', value: `${deductionCount}条 / ${deductionTotal}分`, color: 'text-red-600' },
                { label: '手动调整', value: `${manualCount}条 / ${manualTotal >= 0 ? '+' : ''}${manualTotal}分`, color: 'text-blue-600' },
                { label: '小组操作', value: `${groupCount}条 / ${groupTotal >= 0 ? '+' : ''}${groupTotal}分`, color: 'text-amber-600' },
                { label: '流水总计', value: `${ledger.length}条`, color: 'text-stone-600' },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-lg border p-3 text-center">
                  <div className="text-xs text-stone-500">{item.label}</div>
                  <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* 筛选 */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
                {([
                  ['all', '全部'],
                  ['deduction', '系统扣分'],
                  ['manual', '手动调整'],
                  ['group', '小组操作'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setLedgerType(key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      ledgerType === key ? 'bg-white text-stone-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                    }`}
                  >{label}</button>
                ))}
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text" placeholder="搜索姓名/小组..."
                  value={searchName} onChange={e => setSearchName(e.target.value)}
                  className="pl-7 pr-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-400 w-36"
                />
              </div>
              <input
                type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-400"
              />
              {(ledgerType !== 'all' || searchName || searchDate) && (
                <button
                  onClick={() => { setLedgerType('all'); setSearchName(''); setSearchDate('') }}
                  className="text-xs text-stone-400 hover:text-stone-600 underline"
                >清除筛选</button>
              )}
            </div>

            {/* 统一流水表 */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-stone-50 border-b">
                    <th className="text-left px-4 py-3 text-sm font-medium text-stone-500 w-16">类型</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-stone-500">姓名</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-stone-500">小组</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-stone-500 w-16">变动</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-stone-500">原因</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-stone-500 w-24">日期</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-stone-500 w-36">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredLedger.map(entry => {
                    const typeTag = entry.type === 'deduction'
                      ? { label: '系统扣分', cls: 'bg-red-100 text-red-700' }
                      : entry.type === 'manual'
                        ? { label: '手动调整', cls: 'bg-blue-100 text-blue-700' }
                        : { label: '小组操作', cls: 'bg-amber-100 text-amber-700' }
                    const pointsCls = entry.points > 0 ? 'text-green-600' : entry.points < 0 ? 'text-red-600' : 'text-stone-400'
                    const pointsStr = entry.points > 0 ? `+${entry.points}` : `${entry.points}`
                    return (
                      <tr key={`${entry.type}-${entry.id}`} className="hover:bg-stone-50">
                        <td className="px-4 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${typeTag.cls}`}>{typeTag.label}</span>
                        </td>
                        <td className="px-4 py-2 text-sm font-medium">{entry.studentName || '-'}</td>
                        <td className="px-4 py-2 text-sm text-stone-500">{entry.groupName || '-'}</td>
                        <td className={`px-4 py-2 text-sm font-bold text-center ${pointsCls}`}>{pointsStr}</td>
                        <td className="px-4 py-2 text-sm text-stone-600">{entry.reason}</td>
                        <td className="px-4 py-2 text-sm text-stone-400">{entry.date || '-'}</td>
                        <td className="px-4 py-2 text-xs text-stone-400">{new Date(entry.timestamp).toLocaleString('zh-CN')}</td>
                      </tr>
                    )
                  })}
                  {filteredLedger.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-12 text-stone-400 text-sm">暂无积分流水记录</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* 密码验证弹窗 */}
      {passwordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setPasswordModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-stone-800 mb-2">验证密码</h3>
            <p className="text-sm text-stone-500 mb-3">清零个人积分将删除所有学生的积分、每日状态、扣分记录和手动调整记录，此操作不可恢复。</p>
            <input
              type="password"
              value={passwordInput}
              onChange={e => { setPasswordInput(e.target.value); setPasswordError('') }}
              onKeyDown={e => e.key === 'Enter' && passwordInput && confirmReset()}
              placeholder="请输入管理员密码"
              autoFocus
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 mb-2"
            />
            {passwordError && <p className="text-xs text-red-500 mb-2">{passwordError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPasswordModalOpen(false)} className="px-4 py-2 text-sm text-stone-500 hover:bg-stone-100 rounded-lg transition-colors">取消</button>
              <button onClick={confirmReset} disabled={!passwordInput} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">确认清零</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
