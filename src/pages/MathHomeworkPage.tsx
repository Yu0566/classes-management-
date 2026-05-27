import { useState, useEffect, useCallback } from 'react'
import { Clock } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import * as mathHomeworkApi from '@/lib/math-homework'
import * as studentApi from '@/lib/students'
import * as groupApi from '@/lib/groups'
import type { StudentWithGroup, Group, MathHomeworkGradeWithStudent } from '@/types'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function MathHomeworkPage() {
  const [students, setStudents] = useState<StudentWithGroup[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [date, setDate] = useState(todayStr())
  const [fails, setFails] = useState<MathHomeworkGradeWithStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [historyData, setHistoryData] = useState<MathHomeworkGradeWithStudent[]>([])
  // 理由临时编辑状态: student_id -> input value
  const [reasons, setReasons] = useState<Record<string, string>>({})

  const loadAll = useCallback(async () => {
    const [s, g, f] = await Promise.all([
      studentApi.getAllStudents(),
      groupApi.getAllGroups(),
      mathHomeworkApi.getFailsByDate(date),
    ])
    setStudents(s)
    setGroups(g)
    setFails(f)

    if (!selectedGroup && g.length > 0) {
      setSelectedGroup(g[0].id)
    }

    // 初始化理由输入值
    const rm: Record<string, string> = {}
    f.forEach(r => { rm[r.student_id] = r.reason })
    setReasons(rm)

    setLoading(false)
  }, [date])

  useEffect(() => { setLoading(true); loadAll() }, [loadAll])

  const failMap = new Map(fails.map(f => [f.student_id, f]))
  const groupStudents = selectedGroup
    ? students.filter(s => s.group_id === selectedGroup)
    : []
  const failCount = groupStudents.filter(s => failMap.has(s.id)).length
  const totalCount = groupStudents.length

  const handleMark = async (studentId: string) => {
    const reason = reasons[studentId]?.trim()
    if (!reason) return
    await mathHomeworkApi.markFail(studentId, date, reason)
    await loadAll()
  }

  const handleUnmark = async (gradeId: string) => {
    await mathHomeworkApi.removeFail(gradeId)
    await loadAll()
  }

  const handleReasonChange = (studentId: string, value: string) => {
    setReasons(prev => ({ ...prev, [studentId]: value }))
  }

  const openHistory = async () => {
    const data = await mathHomeworkApi.getFailHistory()
    setHistoryData(data)
    setShowHistory(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          <span className="text-xs text-slate-400 tracking-widest uppercase">加载中</span>
        </div>
      </div>
    )
  }

  const group = groups.find(g => g.id === selectedGroup)

  return (
    <div className="h-full overflow-auto bg-slate-50">
      <div className="p-5 max-w-5xl mx-auto space-y-4">

        {/* 顶部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 rounded-full bg-gradient-to-b from-indigo-400 to-indigo-600" />
            <h1 className="text-lg font-bold text-slate-700 tracking-wide">数学作业等级</h1>
          </div>
          <button
            onClick={openHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 bg-white/70 backdrop-blur border border-slate-200 rounded-xl hover:bg-white transition-colors"
          >
            <Clock size={13} /> 不合格记录
          </button>
        </div>

        {/* 日期 + 统计 */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/70 backdrop-blur">
          <div className="h-0.5 bg-gradient-to-r from-indigo-400 to-indigo-300" />
          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-500">日期</span>
                <input
                  type="date"
                  value={date}
                  onChange={e => { setDate(e.target.value); setSelectedGroup(null) }}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div className="flex items-center gap-5 text-xs">
                <span className="text-slate-500">总人数 <span className="font-mono font-bold text-slate-700 tabular-nums">{totalCount}</span></span>
                <span className="text-slate-300">|</span>
                <span className={failCount > 0 ? 'text-red-500' : 'text-emerald-500'}>
                  不合格 <span className="font-mono font-bold tabular-nums">{failCount}</span>
                </span>
                <span className="text-slate-300">|</span>
                <span className={failCount === 0 ? 'text-emerald-500' : 'text-slate-500'}>
                  合格率 <span className="font-mono font-bold tabular-nums">{totalCount > 0 ? Math.round((totalCount - failCount) / totalCount * 100) : 0}</span>%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 小组切换 */}
        <div className="grid grid-cols-4 gap-1.5">
          {groups.map(g => {
            const gStudents = students.filter(s => s.group_id === g.id)
            const gFails = gStudents.filter(s => failMap.has(s.id)).length
            return (
              <button
                key={g.id}
                onClick={() => setSelectedGroup(g.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedGroup === g.id
                    ? `${g.color} text-white border-transparent shadow-sm`
                    : 'bg-white/70 text-slate-500 border-slate-200 hover:bg-white'
                }`}
              >
                {g.name}{g.leader_name ? `（${g.leader_name}）` : ''}
                {gFails > 0 && (
                  <span className={`ml-1.5 text-[10px] ${selectedGroup === g.id ? 'text-white/80' : 'text-red-400'}`}>
                    {gFails}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* 学生列表 */}
        {selectedGroup && (
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/70 backdrop-blur">
            <div className={`h-0.5 bg-gradient-to-r ${failCount > 0 ? 'from-red-400 to-red-300' : 'from-emerald-400 to-emerald-300'}`} />
            <div className={`px-4 py-2 text-white text-sm font-medium ${group?.color || 'bg-gray-400'} flex items-center justify-between`}>
              <span>{group?.name}{group?.leader_name ? `（${group.leader_name}）` : ''} · {groupStudents.length}人</span>
            </div>

            {groupStudents.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400">该小组暂无学生</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 w-32">姓名</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">不合格原因</th>
                      <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500 w-28">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {groupStudents.map(s => {
                      const record = failMap.get(s.id)
                      const isFailing = !!record
                      return (
                        <tr
                          key={s.id}
                          className={`transition-colors ${isFailing ? 'bg-red-50/50' : 'hover:bg-slate-50/50'}`}
                        >
                          <td className="px-4 py-2.5">
                            <span className={`text-sm font-medium ${isFailing ? 'text-red-700' : 'text-slate-700'}`}>
                              {s.name}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            {isFailing ? (
                              <input
                                type="text"
                                value={reasons[s.id] || ''}
                                onChange={e => handleReasonChange(s.id, e.target.value)}
                                placeholder="输入不合格原因..."
                                className="w-full max-w-xs border border-red-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-red-400 text-red-700 placeholder:text-red-300"
                              />
                            ) : (
                              <input
                                type="text"
                                value={reasons[s.id] || ''}
                                onChange={e => handleReasonChange(s.id, e.target.value)}
                                placeholder="输入不合格原因..."
                                className="w-full max-w-xs border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-500 placeholder:text-slate-300"
                              />
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {isFailing ? (
                              <button
                                onClick={() => handleUnmark(record.id)}
                                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                              >
                                恢复合格
                              </button>
                            ) : (
                              <button
                                onClick={() => handleMark(s.id)}
                                disabled={!reasons[s.id]?.trim()}
                                className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                标记不合格
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 历史记录弹窗 */}
        <Modal open={showHistory} onClose={() => setShowHistory(false)} title="数学作业不合格记录" width="lg">
          {historyData.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">暂无不合格记录</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">日期</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">姓名</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">小组</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">不合格原因</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historyData.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-600">{r.date}</td>
                    <td className="px-3 py-2 font-medium text-red-600">{r.student_name}</td>
                    <td className="px-3 py-2 text-gray-500">{r.group_name || '-'}</td>
                    <td className="px-3 py-2 text-gray-600">{r.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button
            onClick={() => setShowHistory(false)}
            className="mt-4 w-full py-2 text-gray-600 border rounded-lg hover:bg-gray-50 text-sm"
          >
            关闭
          </button>
        </Modal>

      </div>
    </div>
  )
}
