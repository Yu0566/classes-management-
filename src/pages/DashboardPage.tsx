import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Star, CalendarCheck, ClipboardList, Pencil,
  Utensils, Coins, Clock, TrendingUp, CheckCircle, XCircle, AlertTriangle
} from 'lucide-react'
import * as groupApi from '@/lib/groups'
import * as studentApi from '@/lib/students'
import * as dutyApi from '@/lib/duty'
import { getDailyStatuses } from '@/lib/daily-status'
import { queryAll } from '@/lib/db'
import { calculateAllScores } from '@/lib/scores'
import type { Group, StudentWithGroup, DailyStatus, CoinGroup } from '@/types'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<Group[]>([])
  const [students, setStudents] = useState<StudentWithGroup[]>([])
  const [todayStatuses, setTodayStatuses] = useState<DailyStatus[]>([])
  const [dutySummary, setDutySummary] = useState<{ state: string; total: number; signed: number }>({ state: 'idle', total: 0, signed: 0 })
  const [coinGroups, setCoinGroups] = useState<CoinGroup[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const date = todayStr()
    const [g, s, st, cg] = await Promise.all([
      groupApi.getAllGroups(),
      studentApi.getAllStudents(),
      getDailyStatuses(date),
      queryAll<CoinGroup>('SELECT * FROM coin_groups'),
    ])
    setGroups(g)
    setStudents(s)
    setTodayStatuses(st)
    setCoinGroups(cg)

    // 值日状态
    const record = await dutyApi.getDutyRecord(date)
    if (record) {
      const ds = await dutyApi.getDutyStudents(record.id)
      let state = 'idle'
      if (record.sign_in_window_end) state = 'finished'
      else if (record.sign_in_window_start) state = 'signing_in'
      else if (record.countdown_started_at) {
        const countdownMs = dutyApi.DUTY_DURATION_MINUTES * 60 * 1000
        if (record.countdown_started_at + countdownMs > Date.now()) state = 'counting_down'
        else state = 'signing_in'
      }
      setDutySummary({
        state,
        total: ds.length,
        signed: ds.filter(d => d.sign_in_time).length,
      })
    }

    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
  }

  // 各模块统计
  const totalStatusCount = todayStatuses.length

  const attendance = {
    signed: todayStatuses.filter(s => s.attendance === 'signed').length,
    late: todayStatuses.filter(s => s.attendance === 'late').length,
    unsigned: todayStatuses.filter(s => s.attendance === 'unsigned').length,
    leave: todayStatuses.filter(s => s.attendance === 'leave').length,
  }
  const attendanceTotal = attendance.signed + attendance.late + attendance.unsigned + attendance.leave

  const practice = {
    signed: todayStatuses.filter(s => s.daily_practice === 'signed').length,
    unsigned: todayStatuses.filter(s => s.daily_practice === 'unsigned').length,
    notApplicable: todayStatuses.filter(s => s.daily_practice === 'not_applicable').length,
  }

  const homework = {
    complete: todayStatuses.filter(s => s.homework === 'complete').length,
    incomplete: todayStatuses.filter(s => s.homework === 'incomplete').length,
    notSubmitted: todayStatuses.filter(s => s.homework === 'not_submitted').length,
  }

  const lunchRest = {
    signed: todayStatuses.filter(s => s.lunch_rest === 'signed').length,
    unsigned: todayStatuses.filter(s => s.lunch_rest === 'unsigned').length,
    leave: todayStatuses.filter(s => s.lunch_rest === 'leave').length,
  }

  // 个人积分
  const statusMap = new Map<string, DailyStatus[]>()
  for (const s of todayStatuses) {
    statusMap.set(s.student_id, [s])
  }
  const allScores = calculateAllScores(students, new Map())
  const totalScore = allScores.reduce((sum, s) => sum + s.total, 0)
  const topScorer = allScores.length > 0 ? [...allScores].sort((a, b) => b.total - a.total)[0] : null
  const bottomScorer = allScores.length > 0 ? [...allScores].sort((a, b) => a.total - b.total)[0] : null // lowest

  // 小组排名
  const top3 = [...groups].sort((a, b) => b.study_score - a.study_score).slice(0, 3)
  const topGroup = top3[0]

  // 宝龙币
  const totalCoins = coinGroups.reduce((s, cg) => s + (cg.coins || 0), 0)
  const topCoinGroup = coinGroups.length > 0 ? [...coinGroups].sort((a, b) => b.coins - a.coins)[0] : null

  // 值日状态文本
  const dutyStateLabel: Record<string, string> = {
    idle: '未开始', counting_down: '倒计时中', signing_in: '签到中', finished: '已完成',
  }

  const modules = [
    {
      path: '/groups', label: '小组积分', icon: Star, color: 'text-amber-600 bg-amber-50',
      summary: topGroup
        ? `🏆 ${topGroup.name} 领先 (${topGroup.study_score}分)`
        : '暂无数据',
      detail: top3.length > 0
        ? `Top3: ${top3.map(g => `${g.name}(${g.study_score})`).join('、')}`
        : '暂无小组数据',
    },
    {
      path: '/students', label: '学生管理', icon: Users, color: 'text-blue-600 bg-blue-50',
      summary: `${students.length} 名学生 · ${groups.length} 个小组`,
      detail: `共管理 ${students.length} 名学生，分配至 ${groups.length} 个小组`,
    },
    {
      path: '/student-scores', label: '个人积分', icon: TrendingUp, color: 'text-green-600 bg-green-50',
      summary: topScorer && bottomScorer
        ? `最高 ${topScorer.studentName}(${topScorer.total}) · 最低 ${bottomScorer.studentName}(${bottomScorer.total})`
        : '暂无数据',
      detail: `${allScores.length} 名学生参与积分 · 总积分 ${totalScore}`,
    },
    {
      path: '/daily-register', label: '每日考勤', icon: CalendarCheck, color: 'text-purple-600 bg-purple-50',
      summary: attendanceTotal > 0
        ? `已签 ${attendance.signed} · 迟到 ${attendance.late} · 未签 ${attendance.unsigned} · 请假 ${attendance.leave}`
        : '今日暂无考勤数据',
      detail: attendanceTotal > 0
        ? `出勤率 ${Math.round(((attendance.signed + attendance.late + attendance.leave) / Math.max(1, attendanceTotal)) * 100)}%`
        : '请前往每日考勤登记',
    },
    {
      path: '/homework', label: '作业管理', icon: ClipboardList, color: 'text-orange-600 bg-orange-50',
      summary: totalStatusCount > 0
        ? `已交齐 ${homework.complete} · 未交齐 ${homework.incomplete} · 未交 ${homework.notSubmitted}`
        : '今日暂无作业数据',
      detail: totalStatusCount > 0
        ? `完成率 ${Math.round((homework.complete / Math.max(1, homework.complete + homework.incomplete + homework.notSubmitted)) * 100)}%`
        : '请前往作业管理登记',
    },
    {
      path: '/duty', label: '值日管理', icon: Clock, color: 'text-red-600 bg-red-50',
      summary: dutySummary.total > 0
        ? `${dutyStateLabel[dutySummary.state]} · ${dutySummary.signed}/${dutySummary.total} 已签到`
        : '今日暂无值日安排',
      detail: dutySummary.total > 0
        ? `状态：${dutyStateLabel[dutySummary.state]}`
        : '系统将自动扫描违规学生生成名单',
    },
    {
      path: '/lunch-rest', label: '午餐午休', icon: Utensils, color: 'text-teal-600 bg-teal-50',
      summary: totalStatusCount > 0
        ? `签到 ${lunchRest.signed} · 未设置 ${lunchRest.unsigned} · 请假 ${lunchRest.leave}`
        : '今日暂无数据',
      detail: totalStatusCount > 0
        ? `在校就餐 ${lunchRest.signed + lunchRest.unsigned} 人 · 请假 ${lunchRest.leave} 人`
        : '请前往午餐午休登记',
    },
    {
      path: '/daily-practice', label: '每日一练', icon: Pencil, color: 'text-indigo-600 bg-indigo-50',
      summary: totalStatusCount > 0
        ? `已签 ${practice.signed} · 未签 ${practice.unsigned} · 不参与 ${practice.notApplicable}`
        : '今日暂无数据',
      detail: totalStatusCount > 0
        ? `签到率 ${Math.round((practice.signed / Math.max(1, practice.signed + practice.unsigned)) * 100)}%`
        : '请前往每日一练签到',
    },
    {
      path: '/coins', label: '宝龙币', icon: Coins, color: 'text-yellow-600 bg-yellow-50',
      summary: coinGroups.length > 0
        ? `${coinGroups.length} 个小组 · 共 ${totalCoins} 币`
        : '暂无数据',
      detail: topCoinGroup
        ? `${topCoinGroup.name} 最多 (${topCoinGroup.coins}币)`
        : '请前往宝龙币管理',
    },
  ]

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">班级看板</h1>

        {/* 概览数字 */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: '小组总数', value: groups.length, icon: Users, color: 'text-blue-600 bg-blue-50' },
            { label: '学生总数', value: students.length, icon: Users, color: 'text-green-600 bg-green-50' },
            { label: '宝龙币总量', value: totalCoins, icon: Coins, color: 'text-yellow-600 bg-yellow-50' },
            { label: '积分总分', value: totalScore, icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
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

        {/* 模块摘要卡片 */}
        <div className="grid grid-cols-3 gap-4">
          {modules.map(mod => {
            const Icon = mod.icon
            return (
              <button
                key={mod.path}
                onClick={() => navigate(mod.path)}
                className="bg-white rounded-xl shadow-sm border p-4 text-left hover:shadow-md hover:border-primary-200 transition-all group"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={`p-1.5 rounded-lg ${mod.color}`}>
                    <Icon size={16} />
                  </div>
                  <h3 className="font-semibold text-gray-700 group-hover:text-primary-600 transition-colors">
                    {mod.label}
                  </h3>
                  <span className="text-xs text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">查看 →</span>
                </div>
                <p className="text-sm text-gray-800 mb-1">{mod.summary}</p>
                <p className="text-xs text-gray-400">{mod.detail}</p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
