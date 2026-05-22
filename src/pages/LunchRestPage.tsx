import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  upsertLunchRest, batchSetLunchRest, getLunchRestWithStudents,
  LUNCH_REST_STATUS, LUNCH_REST_CYCLE, type LunchRestStatus,
} from '@/lib/lunch-rest'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface StudentRecord { studentId: string; studentName: string; groupName: string; status: string; remark: string }

export default function LunchRestPage() {
  const [date, setDate] = useState(todayStr())
  const [records, setRecords] = useState<StudentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showRemark, setShowRemark] = useState<string | null>(null)
  const [remarkText, setRemarkText] = useState('')

  const loadData = useCallback(async () => {
    setRecords(await getLunchRestWithStudents(date))
    setLoading(false)
  }, [date])

  useEffect(() => { loadData() }, [loadData])

  const handleCycle = async (studentId: string, currentStatus: string) => {
    const idx = LUNCH_REST_CYCLE.indexOf(currentStatus as LunchRestStatus)
    const next = LUNCH_REST_CYCLE[(idx + 1) % LUNCH_REST_CYCLE.length]
    await upsertLunchRest(studentId, date, next)
    setRecords(prev => prev.map(r => r.studentId === studentId ? { ...r, status: next } : r))
  }

  const handleBatchSet = async (status: LunchRestStatus) => {
    await batchSetLunchRest(records.map(r => r.studentId), date, status)
    setRecords(prev => prev.map(r => ({ ...r, status })))
  }

  const handleSaveRemark = async (studentId: string, status: string) => {
    await upsertLunchRest(studentId, date, status as LunchRestStatus, remarkText)
    setRecords(prev => prev.map(r => r.studentId === studentId ? { ...r, remark: remarkText } : r))
    setShowRemark(null)
    setRemarkText('')
  }

  const stats = {
    normal: records.filter(r => r.status === 'normal').length,
    violation: records.filter(r => r.status === 'violation').length,
    absent: records.filter(r => r.status === 'absent').length,
  }
  const violationRate = records.length > 0 ? Math.round((stats.violation / records.length) * 100) : 0

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">午餐午休考勤</h1>

        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)) }} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
          <span className="text-lg font-medium min-w-[180px] text-center">{date}</span>
          <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d.toISOString().slice(0, 10)) }} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight size={20} /></button>
          <button onClick={() => setDate(todayStr())} className="px-3 py-1 text-sm text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50">今天</button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: '正常', value: stats.normal, color: 'text-green-600' },
            { label: '违纪率', value: `${violationRate}%`, color: 'text-red-600' },
            { label: '缺席', value: stats.absent, color: 'text-gray-500' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-lg border p-3 text-center">
              <div className="text-xs text-gray-500">{item.label}</div>
              <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-4">
          <span className="text-sm text-gray-500 py-1.5">批量设置：</span>
          {LUNCH_REST_CYCLE.map(s => (
            <button key={s} onClick={() => handleBatchSet(s)} className={`text-xs px-3 py-1.5 rounded-lg border hover:opacity-80 ${LUNCH_REST_STATUS[s].color}`}>
              全部{LUNCH_REST_STATUS[s].label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">姓名</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 w-[80px]">小组</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">午休状态</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map(r => {
                const stat = LUNCH_REST_STATUS[r.status as LunchRestStatus] || LUNCH_REST_STATUS.normal
                return (
                  <tr key={r.studentId} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-sm">{r.studentName}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{r.groupName || '-'}</td>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => handleCycle(r.studentId, r.status)} className={`text-xs px-3 py-1 rounded-full cursor-pointer transition-colors ${stat.color}`}>{stat.label}</button>
                    </td>
                    <td className="px-4 py-2">
                      {showRemark === r.studentId ? (
                        <div className="flex items-center gap-2">
                          <input type="text" value={remarkText} onChange={e => setRemarkText(e.target.value)} placeholder="违纪原因..." className="text-xs border rounded px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-primary-400" autoFocus onKeyDown={e => e.key === 'Enter' && handleSaveRemark(r.studentId, r.status)} />
                          <button onClick={() => handleSaveRemark(r.studentId, r.status)} className="text-xs text-primary-600 hover:underline">保存</button>
                          <button onClick={() => setShowRemark(null)} className="text-xs text-gray-400 hover:underline">取消</button>
                        </div>
                      ) : (
                        <button onClick={() => { setShowRemark(r.studentId); setRemarkText(r.remark || '') }} className="text-xs text-gray-400 hover:text-primary-500">{r.remark || '点击添加备注'}</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">点击状态按钮循环切换 | 共 {records.length} 名学生</p>
      </div>
    </div>
  )
}
