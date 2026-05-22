import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react'
import * as studentApi from '@/lib/students'
import {
  upsertAttendance, batchSetAttendance, getAttendanceWithStudents,
  ATTENDANCE_STATUS, ATTENDANCE_CYCLE,
  type AttendanceStatus,
} from '@/lib/attendance'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(date: string): string {
  const d = new Date(date)
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${weekdays[d.getDay()]}`
}

interface StudentAttendance {
  studentId: string
  studentName: string
  groupName: string
  status: string
  remark: string
}

export default function AttendancePage() {
  const [date, setDate] = useState(todayStr())
  const [records, setRecords] = useState<StudentAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [showRemark, setShowRemark] = useState<string | null>(null)
  const [remarkText, setRemarkText] = useState('')
  const [activeTab, setActiveTab] = useState<'register' | 'stats'>('register')

  // 统计日期范围
  const [statsStart, setStatsStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [statsEnd, setStatsEnd] = useState(todayStr())

  const loadData = useCallback(async () => {
    const data = await getAttendanceWithStudents(date)
    setRecords(data)
    setLoading(false)
  }, [date])

  useEffect(() => { loadData() }, [loadData])

  // 切换状态
  const handleCycle = async (studentId: string, currentStatus: string) => {
    const idx = ATTENDANCE_CYCLE.indexOf(currentStatus as AttendanceStatus)
    const next = ATTENDANCE_CYCLE[(idx + 1) % ATTENDANCE_CYCLE.length]
    await upsertAttendance(studentId, date, next)

    setRecords(prev =>
      prev.map(r => r.studentId === studentId ? { ...r, status: next } : r)
    )
  }

  // 批量设置
  const handleBatchSet = async (status: AttendanceStatus) => {
    const ids = records.map(r => r.studentId)
    await batchSetAttendance(ids, date, status)
    setRecords(prev =>
      prev.map(r => ({ ...r, status }))
    )
  }

  // 更新备注
  const handleSaveRemark = async (studentId: string, status: string) => {
    await upsertAttendance(studentId, date, status as AttendanceStatus, remarkText)
    setRecords(prev =>
      prev.map(r => r.studentId === studentId ? { ...r, remark: remarkText } : r)
    )
    setShowRemark(null)
    setRemarkText('')
  }

  const changeDate = (days: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    setDate(d.toISOString().slice(0, 10))
  }

  // 统计
  const total = records.length
  const stats = {
    normal: records.filter(r => r.status === 'normal').length,
    late: records.filter(r => r.status === 'late').length,
    absent: records.filter(r => r.status === 'absent').length,
    leave: records.filter(r => r.status === 'leave').length,
  }
  const presentCount = stats.normal + stats.late + stats.leave
  const attendanceRate = total > 0 ? Math.round((presentCount / total) * 100) : 100

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        {/* 顶部 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800">每日考勤</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('register')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'register' ? 'bg-primary-500 text-white' : 'border text-gray-600 hover:bg-gray-50'
              }`}
            >
              考勤登记
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'stats' ? 'bg-primary-500 text-white' : 'border text-gray-600 hover:bg-gray-50'
              }`}
            >
              <BarChart3 size={16} className="inline mr-1" />
              统计视图
            </button>
          </div>
        </div>

        {activeTab === 'register' ? (
          <>
            {/* 日期导航 */}
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
                <ChevronLeft size={20} />
              </button>
              <span className="text-lg font-medium min-w-[200px] text-center">{formatDate(date)}</span>
              <button onClick={() => changeDate(1)} className="p-2 hover:bg-gray-100 rounded-lg">
                <ChevronRight size={20} />
              </button>
              <button
                onClick={() => setDate(todayStr())}
                className="px-3 py-1 text-sm text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50"
              >
                今天
              </button>
            </div>

            {/* 统计概览 */}
            <div className="grid grid-cols-5 gap-3 mb-4">
              {[
                { label: '出勤率', value: `${attendanceRate}%`, color: 'text-green-600' },
                { label: '正常', value: stats.normal, color: 'text-green-600' },
                { label: '迟到', value: stats.late, color: 'text-yellow-600' },
                { label: '缺勤', value: stats.absent, color: 'text-red-600' },
                { label: '请假', value: stats.leave, color: 'text-gray-500' },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-lg border p-3 text-center">
                  <div className="text-xs text-gray-500">{item.label}</div>
                  <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* 批量操作 */}
            <div className="flex gap-2 mb-4">
              <span className="text-sm text-gray-500 py-1.5">批量设置：</span>
              {ATTENDANCE_CYCLE.map(s => (
                <button
                  key={s}
                  onClick={() => handleBatchSet(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg border hover:opacity-80 transition-colors ${ATTENDANCE_STATUS[s].color}`}
                >
                  全部{ATTENDANCE_STATUS[s].label}
                </button>
              ))}
            </div>

            {/* 考勤表 */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">姓名</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 w-[80px]">小组</th>
                    <th className="text-center px-4 py-3 text-sm font-medium text-gray-500">考勤状态</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">备注</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.map(r => {
                    const stat = ATTENDANCE_STATUS[r.status as AttendanceStatus] || ATTENDANCE_STATUS.normal
                    return (
                      <tr key={r.studentId} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-sm">{r.studentName}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{r.groupName || '-'}</td>
                        <td className="px-2 py-2 text-center">
                          <button
                            onClick={() => handleCycle(r.studentId, r.status)}
                            className={`text-xs px-3 py-1 rounded-full cursor-pointer transition-colors ${stat.color}`}
                          >
                            {stat.label}
                          </button>
                        </td>
                        <td className="px-4 py-2">
                          {showRemark === r.studentId ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={remarkText}
                                onChange={e => setRemarkText(e.target.value)}
                                placeholder="请输入原因..."
                                className="text-xs border rounded px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-primary-400"
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && handleSaveRemark(r.studentId, r.status)}
                              />
                              <button
                                onClick={() => handleSaveRemark(r.studentId, r.status)}
                                className="text-xs text-primary-600 hover:underline"
                              >
                                保存
                              </button>
                              <button
                                onClick={() => setShowRemark(null)}
                                className="text-xs text-gray-400 hover:underline"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setShowRemark(r.studentId); setRemarkText(r.remark || '') }}
                              className="text-xs text-gray-400 hover:text-primary-500 cursor-pointer"
                            >
                              {r.remark || '点击添加备注'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-gray-400 mt-2">
              点击状态按钮循环切换 | 点击备注列添加请假原因等 | 共 {total} 名学生
            </p>
          </>
        ) : (
          <>
            {/* 统计视图 */}
            <div className="flex items-center gap-3 mb-4">
              <input
                type="date"
                value={statsStart}
                onChange={e => setStatsStart(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm"
              />
              <span className="text-gray-400">至</span>
              <input
                type="date"
                value={statsEnd}
                onChange={e => setStatsEnd(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm"
              />
            </div>

            {/* 汇总统计 */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              {[
                { label: '日均出勤率', value: `${attendanceRate}%`, color: 'text-green-600' },
                { label: '迟到总人次', value: stats.late, color: 'text-yellow-600' },
                { label: '缺勤总人次', value: stats.absent, color: 'text-red-600' },
                { label: '请假总人次', value: stats.leave, color: 'text-gray-500' },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-lg border p-4 text-center">
                  <div className="text-sm text-gray-500 mb-1">{item.label}</div>
                  <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-400">
              统计范围：{statsStart} ~ {statsEnd}（统计功能将在后续版本支持更多维度）
            </p>
          </>
        )}
      </div>
    </div>
  )
}
