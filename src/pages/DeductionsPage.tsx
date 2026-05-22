import { useState, useEffect, useCallback } from 'react'
import { Search } from 'lucide-react'
import { queryAll } from '@/lib/db'
import * as studentApi from '@/lib/students'
import type { DeductionRecord, ManualAdjustRecord, StudentWithGroup } from '@/types'

export default function DeductionsPage() {
  const [deductions, setDeductions] = useState<DeductionRecord[]>([])
  const [manualAdjusts, setManualAdjusts] = useState<ManualAdjustRecord[]>([])
  const [students, setStudents] = useState<StudentWithGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [searchName, setSearchName] = useState('')
  const [searchDate, setSearchDate] = useState('')
  const [tab, setTab] = useState<'deductions' | 'manual'>('deductions')

  const loadData = useCallback(async () => {
    const [d, m, s] = await Promise.all([
      queryAll<DeductionRecord>('SELECT * FROM deduction_records ORDER BY timestamp DESC LIMIT 500'),
      queryAll<ManualAdjustRecord>('SELECT * FROM manual_adjust_records ORDER BY timestamp DESC LIMIT 500'),
      studentApi.getAllStudents(),
    ])
    setDeductions(d)
    setManualAdjusts(m)
    setStudents(s)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const filteredDeductions = deductions.filter(d => {
    if (searchName && !d.student_name.includes(searchName)) return false
    if (searchDate && d.date !== searchDate) return false
    return true
  })

  const filteredManual = manualAdjusts.filter(m => {
    if (searchName && !m.student_name.includes(searchName)) return false
    return true
  })

  const totalDeduction = deductions.reduce((sum, d) => sum + d.points, 0)
  const totalManual = manualAdjusts.reduce((sum, m) => sum + m.delta, 0)

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">扣分记录</h1>

        {/* 统计概览 */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: '扣分总条数', value: deductions.length, color: 'text-red-600' },
            { label: '累计扣分', value: -totalDeduction, color: 'text-red-600' },
            { label: '手动调整条数', value: manualAdjusts.length, color: 'text-blue-600' },
            { label: '手动调整净额', value: (totalManual >= 0 ? '+' : '') + totalManual, color: totalManual >= 0 ? 'text-green-600' : 'text-red-600' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-lg border p-3 text-center">
              <div className="text-xs text-gray-500">{item.label}</div>
              <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* 标签切换 + 筛选 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setTab('deductions')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'deductions' ? 'bg-red-500 text-white' : 'border text-gray-600 hover:bg-gray-50'
              }`}
            >
              系统扣分 ({filteredDeductions.length})
            </button>
            <button
              onClick={() => setTab('manual')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'manual' ? 'bg-blue-500 text-white' : 'border text-gray-600 hover:bg-gray-50'
              }`}
            >
              手动调整 ({filteredManual.length})
            </button>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="搜索姓名..."
                value={searchName}
                onChange={e => setSearchName(e.target.value)}
                className="pl-7 pr-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-400 w-32"
              />
            </div>
            <input
              type="date"
              value={searchDate}
              onChange={e => setSearchDate(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
          </div>
        </div>

        {/* 列表 */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {tab === 'deductions' ? (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">姓名</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">扣分</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">原因</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">日期</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">时间</th>
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
                  <tr><td colSpan={5} className="text-center py-12 text-gray-400 text-sm">暂无扣分记录</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">姓名</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">调整</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">原因</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">时间</th>
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
                  <tr><td colSpan={4} className="text-center py-12 text-gray-400 text-sm">暂无手动调整记录</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-2">
          最多显示500条记录 | 扣分总计：{totalDeduction}分 | 手动调整：{(totalManual >= 0 ? '+' : '') + totalManual}分
        </p>
      </div>
    </div>
  )
}
