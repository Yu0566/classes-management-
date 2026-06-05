import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import {
  upsertLunchRest, batchSetLunchRest, getLunchRestWithStudents,
  toggleLongtermLeave,
  LUNCH_REST_STATUS, LUNCH_REST_CYCLE, type LunchRestStatus,
} from '@/lib/lunch-rest'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface StudentRecord {
  studentId: string; studentName: string; groupName: string
  status: string; remark: string; longterm: boolean
}

export default function LunchRestPage() {
  const [date, setDate] = useState(todayStr())
  const [records, setRecords] = useState<StudentRecord[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setRecords(await getLunchRestWithStudents(date))
    setLoading(false)
  }, [date])

  useEffect(() => { loadData() }, [loadData])

  const handleToggle = async (studentId: string, currentStatus: string) => {
    const idx = LUNCH_REST_CYCLE.indexOf(currentStatus as LunchRestStatus)
    const next = LUNCH_REST_CYCLE[(idx + 1) % LUNCH_REST_CYCLE.length]
    await upsertLunchRest(studentId, date, next)
    setRecords(prev => prev.map(r => r.studentId === studentId ? { ...r, status: next } : r))
  }

  const handleBatchSet = async (status: LunchRestStatus) => {
    // 长期请假的学生不改变状态
    const ids = records.filter(r => !r.longterm).map(r => r.studentId)
    if (ids.length === 0) return
    await batchSetLunchRest(ids, date, status)
    setRecords(prev => prev.map(r => r.longterm ? r : { ...r, status }))
  }

  const handleLongtermToggle = async (studentId: string) => {
    await toggleLongtermLeave(studentId)
    await loadData()
  }

  const signedCount = records.filter(r => r.status === 'signed').length
  const leaveCount = records.filter(r => r.status === 'leave').length
  const unsignedCount = records.filter(r => r.status === 'unsigned').length
  const longtermCount = records.filter(r => r.longterm).length

  if (loading) return <div className="flex items-center justify-center h-full text-stone-400">加载中...</div>

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-stone-800 mb-4">午餐午休考勤</h1>

        {/* 日期导航 */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)) }} className="p-2 hover:bg-stone-100 rounded-lg"><ChevronLeft size={20} /></button>
          <span className="text-lg font-medium min-w-[180px] text-center">{date}</span>
          <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d.toISOString().slice(0, 10)) }} className="p-2 hover:bg-stone-100 rounded-lg"><ChevronRight size={20} /></button>
          <button onClick={() => setDate(todayStr())} className="px-3 py-1 text-sm text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50">今天</button>
        </div>

        {/* 统计 */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: '已签到', value: signedCount, color: 'text-green-600' },
            { label: '请假', value: leaveCount, color: 'text-yellow-600' },
            { label: '未设置', value: unsignedCount, color: 'text-stone-500' },
            { label: '长期请假', value: longtermCount, color: 'text-amber-600' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-lg border p-3 text-center">
              <div className="text-xs text-stone-500">{item.label}</div>
              <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* 批量操作 */}
        <div className="flex gap-2 mb-4">
          <span className="text-sm text-stone-500 py-1.5">批量操作：</span>
          <button
            onClick={() => handleBatchSet('signed')}
            className="text-xs px-3 py-1.5 rounded-lg border bg-green-50 text-green-600 hover:bg-green-100"
          >
            全部签到
          </button>
          <button
            onClick={() => handleBatchSet('leave')}
            className="text-xs px-3 py-1.5 rounded-lg border bg-yellow-50 text-yellow-600 hover:bg-yellow-100"
          >
            全部请假
          </button>
          <span className="text-xs text-stone-400 py-1.5 ml-2">（长期请假学生不受影响）</span>
        </div>

        {/* 学生列表 */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-stone-50 border-b">
                <th className="text-left px-4 py-3 text-sm font-medium text-stone-500">姓名</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-stone-500 w-[80px]">小组</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-stone-500">午休状态</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-stone-500 w-[80px]">长期请假</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map(r => {
                const stat = LUNCH_REST_STATUS[r.status as LunchRestStatus] || LUNCH_REST_STATUS.leave
                return (
                  <tr key={r.studentId} className={`hover:bg-stone-50 ${r.longterm ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-4 py-2 font-medium text-sm">
                      {r.studentName}
                      {r.longterm && <span className="ml-1 text-xs text-amber-500">(长期)</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-stone-500">{r.groupName || '-'}</td>
                    <td className="px-2 py-2 text-center">
                      {r.longterm ? (
                        <span className="text-xs px-3 py-1 rounded-full bg-amber-100 text-amber-700">请假</span>
                      ) : (
                        <button
                          onClick={() => handleToggle(r.studentId, r.status)}
                          className={`text-xs px-3 py-1 rounded-full cursor-pointer transition-colors ${stat.color}`}
                        >
                          {stat.label}
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => handleLongtermToggle(r.studentId)}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          r.longterm
                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                            : 'text-stone-300 hover:text-amber-500 hover:bg-amber-50'
                        }`}
                        title={r.longterm ? '取消长期请假' : '设为长期请假'}
                      >
                        <Clock size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-stone-400 mt-2">
          点击状态切换签到/请假 | 共 {records.length} 名在校就餐学生 | {longtermCount} 名长期请假
        </p>
      </div>
    </div>
  )
}
