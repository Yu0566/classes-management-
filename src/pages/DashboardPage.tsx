import { useState, useEffect, useCallback } from 'react'
import { Users, TrendingUp, CalendarCheck, AlertTriangle, CheckCircle } from 'lucide-react'
import * as groupApi from '@/lib/groups'
import * as studentApi from '@/lib/students'
import { getDailyStatuses } from '@/lib/daily-status'
import type { Group, StudentWithGroup, DailyStatus } from '@/types'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function DashboardPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [students, setStudents] = useState<StudentWithGroup[]>([])
  const [todayStatuses, setTodayStatuses] = useState<DailyStatus[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const [g, s, st] = await Promise.all([
      groupApi.getAllGroups(),
      studentApi.getAllStudents(),
      getDailyStatuses(todayStr()),
    ])
    setGroups(g)
    setStudents(s)
    setTodayStatuses(st)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
  }

  // 统计
  const attendanceStats = {
    signed: todayStatuses.filter(s => s.attendance === 'signed').length,
    late: todayStatuses.filter(s => s.attendance === 'late').length,
    unsigned: todayStatuses.filter(s => s.attendance === 'unsigned').length,
    leave: todayStatuses.filter(s => s.attendance === 'leave').length,
  }

  const practiceStats = {
    signed: todayStatuses.filter(s => s.daily_practice === 'signed').length,
    unsigned: todayStatuses.filter(s => s.daily_practice === 'unsigned').length,
  }

  const homeworkStats = {
    complete: todayStatuses.filter(s => s.homework === 'complete').length,
    incomplete: todayStatuses.filter(s => s.homework === 'incomplete').length,
    notSubmitted: todayStatuses.filter(s => s.homework === 'not_submitted').length,
  }

  const totalStatusCount = todayStatuses.length
  const attendanceRate = totalStatusCount > 0
    ? Math.round(((attendanceStats.signed + attendanceStats.late + attendanceStats.leave) / totalStatusCount) * 100)
    : 0

  // Top 3 小组
  const top3 = [...groups].sort((a, b) => b.study_score - a.study_score).slice(0, 3)

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">仪表盘</h1>

        {/* 概览卡片 */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: '小组总数', value: groups.length, icon: Users, color: 'text-blue-600 bg-blue-50' },
            { label: '学生总数', value: students.length, icon: Users, color: 'text-green-600 bg-green-50' },
            { label: '今日出勤率', value: `${attendanceRate}%`, icon: CalendarCheck, color: 'text-purple-600 bg-purple-50' },
            { label: '今日签到率', value: totalStatusCount > 0 ? `${Math.round((practiceStats.signed / totalStatusCount) * 100)}%` : '-', icon: CheckCircle, color: 'text-orange-600 bg-orange-50' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-xl border p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${item.color}`}>
                <item.icon size={20} />
              </div>
              <div>
                <div className="text-xs text-gray-500">{item.label}</div>
                <div className="text-xl font-bold text-gray-800">{item.value}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* 小组排名 Top 3 */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-primary-500" />
              小组积分排名 Top 3
            </h2>
            {top3.length === 0 ? (
              <p className="text-center text-gray-400 py-6 text-sm">暂无小组数据</p>
            ) : (
              <div className="space-y-3">
                {top3.map((g, i) => (
                  <div key={g.id} className="flex items-center gap-3">
                    <span className={`text-lg font-bold w-8 ${
                      i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : 'text-orange-400'
                    }`}>
                      #{i + 1}
                    </span>
                    <div className={`flex-1 h-3 rounded-full ${g.color} opacity-50`}>
                      <div className={`h-full rounded-full ${g.color}`}
                        style={{ width: `${Math.min(100, (g.study_score / Math.max(1, top3[0]?.study_score || 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="font-medium text-sm">{g.name}{g.leader_name ? `（${g.leader_name}）` : ''}</span>
                    <span className="font-bold text-sm">{g.study_score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 今日概况 */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <AlertTriangle size={18} className="text-yellow-500" />
              今日待处理事项
            </h2>
            {totalStatusCount === 0 ? (
              <p className="text-center text-gray-400 py-6 text-sm">今日暂无登记数据</p>
            ) : (
              <div className="space-y-2 text-sm">
                {attendanceStats.late > 0 && (
                  <p className="text-yellow-600">⚠ 迟到：{attendanceStats.late} 人</p>
                )}
                {attendanceStats.unsigned > 0 && (
                  <p className="text-gray-500">◐ 待处理：{attendanceStats.unsigned} 人</p>
                )}
                {practiceStats.unsigned > 0 && (
                  <p className="text-red-600">✘ 未签到：{practiceStats.unsigned} 人</p>
                )}
                {homeworkStats.incomplete > 0 && (
                  <p className="text-yellow-600">⚠ 作业未交齐：{homeworkStats.incomplete} 人</p>
                )}
                {homeworkStats.notSubmitted > 0 && (
                  <p className="text-red-600">✘ 作业未交：{homeworkStats.notSubmitted} 人</p>
                )}
                {attendanceStats.late === 0 && attendanceStats.unsigned === 0 &&
                 practiceStats.unsigned === 0 && homeworkStats.incomplete === 0 &&
                 homeworkStats.notSubmitted === 0 && (
                  <p className="text-green-600">✓ 今日无异常，一切正常</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
