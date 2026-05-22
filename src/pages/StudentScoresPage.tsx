import { useState, useEffect, useCallback } from 'react'
import { ArrowUpDown } from 'lucide-react'
import * as studentApi from '@/lib/students'
import { queryAll } from '@/lib/db'
import { calculateAllScores, type StudentScore } from '@/lib/scores'
import type { StudentWithGroup, DailyStatus } from '@/types'

type SortKey = keyof StudentScore

export default function StudentScoresPage() {
  const [scores, setScores] = useState<StudentScore[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const loadData = useCallback(async () => {
    const students = await studentApi.getAllStudents()
    const allStatuses = await queryAll<DailyStatus>(
      'SELECT * FROM daily_statuses'
    )

    // 按学生分组状态
    const statusMap = new Map<string, DailyStatus[]>()
    for (const s of allStatuses) {
      const arr = statusMap.get(s.student_id) || []
      arr.push(s)
      statusMap.set(s.student_id, arr)
    }

    const result = calculateAllScores(students, statusMap)
    setScores(result)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const sorted = [...scores].sort((a, b) => {
    const va = a[sortKey] as number
    const vb = b[sortKey] as number
    return sortDir === 'desc' ? vb - va : va - vb
  })

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
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

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
  }

  const totalScore = sorted.reduce((sum, s) => sum + s.total, 0)

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">个人积分一览</h1>
            <p className="text-sm text-gray-500 mt-1">
              汇总 {sorted.length} 名学生 · 总积分 {totalScore}
            </p>
          </div>
        </div>

        {/* 积分概览卡 */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: '每日一练', value: sorted.reduce((s, x) => s + x.dailyPractice, 0), color: 'text-blue-600' },
            { label: '考勤', value: sorted.reduce((s, x) => s + x.attendance, 0), color: 'text-yellow-600' },
            { label: '作业', value: sorted.reduce((s, x) => s + x.homework, 0), color: 'text-purple-600' },
            { label: '午餐午休', value: sorted.reduce((s, x) => s + x.lunchRest, 0), color: 'text-orange-600' },
            { label: '手动偏移', value: sorted.reduce((s, x) => s + x.manualOffset, 0), color: 'text-red-600' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-lg border p-3 text-center">
              <div className="text-xs text-gray-500">{item.label}</div>
              <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
            </div>
          ))}
        </div>

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
                <SortableHead label="午餐午休" skey="lunchRest" />
                <SortableHead label="手动偏移" skey="manualOffset" />
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
                  <td className="px-3 py-2 text-center text-sm">{s.lunchRest}</td>
                  <td className="px-3 py-2 text-center text-sm">{s.manualOffset}</td>
                  <td className="px-3 py-2 text-center text-xs text-gray-400">{s.statusCount}天</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">暂无数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
