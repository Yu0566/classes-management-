import { useState, useEffect, useCallback } from 'react'
import { History, RefreshCw, CheckCheck, Crown } from 'lucide-react'
import * as homeworkApi from '@/lib/homework'
import * as studentApi from '@/lib/students'
import * as groupApi from '@/lib/groups'
import type { StudentWithGroup, Group } from '@/types'
import type { HomeworkStatus } from '@/lib/homework'

const ALL_SUBJECTS = ['语文', '数学', '英语', '历史', '道法', '生物', '地理', '物理', '化学']
const DEFAULT_SELECTED = ['语文', '数学', '英语']

const STATUS_MAP: Record<HomeworkStatus, { label: string; color: string; icon: string }> = {
  complete:   { label: '交齐',   color: 'bg-green-100 text-green-700 border-green-300', icon: '✓' },
  incomplete:  { label: '未交',   color: 'bg-red-100 text-red-700 border-red-300',     icon: '✗' },
  partial:    { label: '未交齐',  color: 'bg-yellow-100 text-yellow-700 border-yellow-300', icon: '◐' },
}

const STATUS_ORDER: HomeworkStatus[] = ['complete', 'incomplete', 'partial']

export default function HomeworkPage() {
  const [students, setStudents] = useState<StudentWithGroup[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [subjects, setSubjects] = useState<string[]>([...DEFAULT_SELECTED])
  const [records, setRecords] = useState<Map<string, HomeworkStatus>>(new Map())
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [historyData, setHistoryData] = useState<homeworkApi.HomeworkRecordWithStudent[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    const [s, allGroups, subjs, recs] = await Promise.all([
      studentApi.getAllStudents(),
      groupApi.getAllGroups(),
      homeworkApi.getDailySubjects(date),
      homeworkApi.getRecordsByDate(date),
    ])
    setStudents(s)
    setGroups(allGroups)
    setSubjects(subjs)

    if (!selectedGroup && allGroups.length > 0) {
      setSelectedGroup(allGroups[0].id)
    }

    const map = new Map<string, HomeworkStatus>()
    recs.forEach(r => { map.set(`${r.student_id}:${r.subject}`, r.status) })
    setRecords(map)

    setLoading(false)
  }, [date])

  useEffect(() => { loadAll() }, [loadAll])

  const toggleSubject = async (subj: string) => {
    const next = subjects.includes(subj)
      ? subjects.filter(s => s !== subj)
      : [...subjects, subj]
    setSubjects(next)
    await homeworkApi.setDailySubjects(date, next)
  }

  const cycleStatus = async (studentId: string, subject: string) => {
    const key = `${studentId}:${subject}`
    const current = records.get(key) || 'complete'
    const nextIdx = (STATUS_ORDER.indexOf(current) + 1) % STATUS_ORDER.length
    const nextStatus = STATUS_ORDER[nextIdx]
    await homeworkApi.setHomeworkStatus(studentId, date, subject, nextStatus)
    setRecords(prev => {
      const next = new Map(prev)
      if (nextStatus === 'complete') {
        next.delete(key)
      } else {
        next.set(key, nextStatus)
      }
      return next
    })
  }

  const resetStudentAllIncomplete = async (studentId: string) => {
    for (const subj of subjects) {
      await homeworkApi.setHomeworkStatus(studentId, date, subj, 'incomplete')
    }
    setRecords(prev => {
      const next = new Map(prev)
      for (const subj of subjects) {
        next.set(`${studentId}:${subj}`, 'incomplete')
      }
      return next
    })
  }

  const resetGroupAllComplete = async () => {
    if (!selectedGroup) return
    const groupStudents = students.filter(s => s.group_id === selectedGroup)
    for (const s of groupStudents) {
      for (const subj of subjects) {
        await homeworkApi.setHomeworkStatus(s.id, date, subj, 'complete')
      }
    }
    setRecords(prev => {
      const next = new Map(prev)
      for (const s of groupStudents) {
        for (const subj of subjects) {
          next.delete(`${s.id}:${subj}`)
        }
      }
      return next
    })
  }

  const openHistory = async () => {
    const data = await homeworkApi.getUnsubmittedHistory()
    setHistoryData(data)
    setShowHistory(true)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-6xl mx-auto">
        {/* 顶部 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800">作业管理</h1>
          <button
            onClick={openHistory}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
          >
            <History size={18} /> 未交记录
          </button>
        </div>

        {/* 日期和科目选择 */}
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
          <div className="flex items-center gap-4 mb-3">
            <span className="text-sm text-gray-500">日期：</span>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500 mr-1">今日科目：</span>
            {ALL_SUBJECTS.map(subj => (
              <button
                key={subj}
                onClick={() => toggleSubject(subj)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  subjects.includes(subj)
                    ? 'bg-primary-100 text-primary-700 border-primary-300'
                    : 'bg-gray-50 text-gray-400 border-gray-200'
                }`}
              >
                {subj}
              </button>
            ))}
          </div>
        </div>

        {/* 小组切换按钮组 */}
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => setSelectedGroup(g.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                selectedGroup === g.id
                  ? `${g.color} text-white border-transparent`
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {g.name}{g.leader_name ? `（${g.leader_name}）` : ''}
            </button>
          ))}
        </div>

        {/* 当前小组作业表 */}
        {selectedGroup && subjects.length > 0 ? (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            {(() => {
              const group = groups.find(g => g.id === selectedGroup)
              const groupStudents = students.filter(s => s.group_id === selectedGroup)
              return (
                <>
                  <div className={`px-4 py-2 text-white text-sm font-medium ${group?.color || 'bg-gray-400'} flex items-center justify-between`}>
                    <span>{group?.name}{group?.leader_name ? `（${group.leader_name}）` : ''} · {groupStudents.length}人</span>
                    <button
                      onClick={resetGroupAllComplete}
                      className="flex items-center gap-1 px-2 py-0.5 text-xs bg-white/20 rounded hover:bg-white/30 transition-colors"
                      title="本组所有学生全科设为交齐"
                    >
                      <CheckCheck size={12} /> 全部交齐
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    {groupStudents.length > 0 ? (
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 border-b">
                            <th className="text-left px-4 py-2 text-sm font-medium text-gray-500 sticky left-0 bg-gray-50">
                              姓名
                            </th>
                            {subjects.map(subj => (
                              <th key={subj} className="text-center px-3 py-2 text-sm font-medium text-gray-500 min-w-[80px]">
                                {subj}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {groupStudents.map(s => (
                            <tr key={s.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-sm font-medium sticky left-0 bg-white">
                                <div className="flex items-center gap-1">
                                  <span>{s.name}</span>
                                  {group?.leader_name === s.name && (
                                    <Crown size={13} className="text-yellow-500" title="组长" />
                                  )}
                                  <button
                                    onClick={() => resetStudentAllIncomplete(s.id)}
                                    className="p-0.5 text-gray-300 hover:text-red-500 transition-colors"
                                    title="全科设为未交"
                                  >
                                    <RefreshCw size={12} />
                                  </button>
                                </div>
                              </td>
                              {subjects.map(subj => {
                                const status = records.get(`${s.id}:${subj}`) || 'complete'
                                const cfg = STATUS_MAP[status]
                                return (
                                  <td key={subj} className="px-2 py-1.5 text-center">
                                    <button
                                      onClick={() => cycleStatus(s.id, subj)}
                                      className={`text-xs px-3 py-1 rounded-full border cursor-pointer transition-colors ${cfg.color}`}
                                    >
                                      {cfg.icon} {cfg.label}
                                    </button>
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="text-center py-8 text-gray-400 text-sm">该小组暂无学生</div>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        ) : selectedGroup && subjects.length === 0 ? (
          <div className="text-center py-12 text-gray-400">请先选择今天的科目</div>
        ) : null}

        {/* 底部提示 */}
        <p className="text-xs text-gray-400 mt-3">
          默认所有同学状态为"交齐"，点击按钮切换：交齐 → 未交 → 未交齐 → 交齐
        </p>
      </div>

      {/* 未交记录弹窗 */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[640px] max-h-[70vh] shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">未交作业记录</h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="flex-1 overflow-auto">
              {historyData.length === 0 ? (
                <p className="text-center text-gray-400 py-8">太棒了，没有未交作业记录！</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">日期</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">姓名</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">小组</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">科目</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historyData.map(r => {
                      const cfg = STATUS_MAP[r.status]
                      return (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-600">{r.date}</td>
                          <td className="px-3 py-2 font-medium">{r.student_name}</td>
                          <td className="px-3 py-2 text-gray-500">{r.group_name || '-'}</td>
                          <td className="px-3 py-2">{r.subject}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>
                              {cfg.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <button onClick={() => setShowHistory(false)} className="mt-4 w-full py-2 text-gray-600 border rounded-lg hover:bg-gray-50">
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
