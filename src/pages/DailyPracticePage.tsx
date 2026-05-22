import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  upsertPractice, batchSetPractice, getPracticeWithStudents,
  PRACTICE_STATUS, PRACTICE_CYCLE, type PracticeStatus,
} from '@/lib/daily-practice'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface StudentRecord { studentId: string; studentName: string; groupName: string; status: string }

export default function DailyPracticePage() {
  const [date, setDate] = useState(todayStr())
  const [records, setRecords] = useState<StudentRecord[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setRecords(await getPracticeWithStudents(date))
    setLoading(false)
  }, [date])

  useEffect(() => { loadData() }, [loadData])

  const handleCycle = async (studentId: string, currentStatus: string) => {
    const idx = PRACTICE_CYCLE.indexOf(currentStatus as PracticeStatus)
    const next = PRACTICE_CYCLE[(idx + 1) % PRACTICE_CYCLE.length]
    await upsertPractice(studentId, date, next)
    setRecords(prev => prev.map(r => r.studentId === studentId ? { ...r, status: next } : r))
  }

  const handleBatchSet = async (status: PracticeStatus) => {
    await batchSetPractice(records.map(r => r.studentId), date, status)
    setRecords(prev => prev.map(r => ({ ...r, status })))
  }

  const stats = {
    signed: records.filter(r => r.status === 'signed').length,
    unsigned: records.filter(r => r.status === 'unsigned').length,
    notApplicable: records.filter(r => r.status === 'not_applicable').length,
  }
  const signRate = records.length > 0 ? Math.round((stats.signed / records.length) * 100) : 0

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">每日一练签到</h1>

        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)) }} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
          <span className="text-lg font-medium min-w-[180px] text-center">{date}</span>
          <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d.toISOString().slice(0, 10)) }} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight size={20} /></button>
          <button onClick={() => setDate(todayStr())} className="px-3 py-1 text-sm text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50">今天</button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: '签到率', value: `${signRate}%`, color: 'text-green-600' },
            { label: '已签', value: stats.signed, color: 'text-green-600' },
            { label: '未签', value: stats.unsigned, color: 'text-red-600' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-lg border p-3 text-center">
              <div className="text-xs text-gray-500">{item.label}</div>
              <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-4">
          <span className="text-sm text-gray-500 py-1.5">批量操作：</span>
          {PRACTICE_CYCLE.map(s => (
            <button key={s} onClick={() => handleBatchSet(s)} className={`text-xs px-3 py-1.5 rounded-lg border hover:opacity-80 ${PRACTICE_STATUS[s].color}`}>
              全部{PRACTICE_STATUS[s].label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">姓名</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 w-[80px]">小组</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">签到状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map(r => {
                const stat = PRACTICE_STATUS[r.status as PracticeStatus] || PRACTICE_STATUS.unsigned
                return (
                  <tr key={r.studentId} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-sm">{r.studentName}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{r.groupName || '-'}</td>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => handleCycle(r.studentId, r.status)} className={`text-xs px-3 py-1 rounded-full cursor-pointer transition-colors ${stat.color}`}>{stat.label}</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">点击状态按钮循环切换 | 全班一键签到点击"全部已签" | 共 {records.length} 名学生</p>
      </div>
    </div>
  )
}
