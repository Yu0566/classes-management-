import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, CheckCheck } from 'lucide-react'
import * as studentApi from '@/lib/students'
import {
  getDailyStatuses, initDailyStatuses, upsertDailyStatus,
  cycleStatus, STATUS_CYCLES, STATUS_LABELS, STATUS_COLORS,
  type StatusField,
} from '@/lib/daily-status'
import type { StudentWithGroup, DailyStatus } from '@/types'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(date: string): string {
  const d = new Date(date)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

export default function DailyRegisterPage() {
  const [date, setDate] = useState(todayStr())
  const [students, setStudents] = useState<StudentWithGroup[]>([])
  const [statuses, setStatuses] = useState<Map<string, DailyStatus>>(new Map())
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const s = await studentApi.getAllStudents()
    setStudents(s)
    // 初始化当日状态
    await initDailyStatuses(s.map(x => ({ id: x.id })), date)
    const statusList = await getDailyStatuses(date)
    const map = new Map<string, DailyStatus>()
    statusList.forEach(st => map.set(st.student_id, st))
    setStatuses(map)
    setLoading(false)
  }, [date])

  useEffect(() => { loadData() }, [loadData])

  // 切换状态
  const handleCycle = async (studentId: string, field: StatusField) => {
    const current = statuses.get(studentId)
    const currentVal = current ? current[field] : STATUS_CYCLES[field][0]
    const newVal = cycleStatus(currentVal, STATUS_CYCLES[field])
    await upsertDailyStatus(studentId, date, field, newVal)

    // 更新本地状态
    setStatuses(prev => {
      const next = new Map(prev)
      const st = next.get(studentId)
      if (st) {
        next.set(studentId, { ...st, [field]: newVal })
      }
      return next
    })
  }

  // 批量设置
  const handleBatchSet = async (field: StatusField, value: string) => {
    for (const student of students) {
      await upsertDailyStatus(student.id, date, field, value)
    }
    const statusList = await getDailyStatuses(date)
    const map = new Map<string, DailyStatus>()
    statusList.forEach(st => map.set(st.student_id, st))
    setStatuses(map)
  }

  // 日期导航
  const changeDate = (days: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    setDate(todayStr)
  }

  // 获取默认状态的辅助（用于展示尚未在数据库中的学生状态）
  const getStatus = (studentId: string, field: StatusField) => {
    return statuses.get(studentId)?.[field] || STATUS_CYCLES[field][0]
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
  }

  const statusFields: { key: StatusField; label: string }[] = [
    { key: 'daily_practice', label: '每日一练' },
    { key: 'attendance', label: '考勤' },
    { key: 'homework', label: '作业' },
    { key: 'lunch_rest', label: '午餐午休' },
  ]

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        {/* 日期导航 */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">每日登记</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronLeft size={20} />
            </button>
            <span className="text-lg font-medium min-w-[160px] text-center">
              {formatDate(date)}
            </span>
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
        </div>

        {/* 登记表 */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 w-[120px]">姓名</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 w-[100px]">小组</th>
                {statusFields.map(f => (
                  <th key={f.key} className="text-center px-2 py-3 text-sm font-medium text-gray-500">
                    <div className="mb-1">{f.label}</div>
                    <select
                      className="text-xs border rounded px-1 py-0.5 text-gray-400"
                      onChange={e => {
                        if (e.target.value) handleBatchSet(f.key, e.target.value)
                        e.target.value = ''
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>批量</option>
                      {STATUS_CYCLES[f.key].map(v => (
                        <option key={v} value={v}>{STATUS_LABELS[f.key][v]}</option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{s.name}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{s.group_name || '-'}</td>
                  {statusFields.map(f => {
                    const val = getStatus(s.id, f.key)
                    return (
                      <td key={f.key} className="px-1 py-2 text-center">
                        <button
                          onClick={() => handleCycle(s.id, f.key)}
                          className={`text-xs px-2 py-1 rounded-full cursor-pointer transition-colors ${
                            STATUS_COLORS[f.key][val] || 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {STATUS_LABELS[f.key][val] || val}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 mt-2">
          点击状态按钮即可循环切换 | 共 {students.length} 名学生
        </p>
      </div>
    </div>
  )
}
