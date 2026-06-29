import { useState, useEffect, useCallback } from 'react'
import { History, CheckCheck, Crown, Edit3 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
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

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateCN(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_NAMES[d.getDay()]}`
}

export default function HomeworkPage() {
  const { confirm } = useConfirm()
  const [students, setStudents] = useState<StudentWithGroup[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [date, setDate] = useState(todayStr())
  const [supplementMode, setSupplementMode] = useState(false)
  const [subjects, setSubjects] = useState<string[]>([...DEFAULT_SELECTED])
  const [records, setRecords] = useState<Map<string, HomeworkStatus>>(new Map())
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [historyData, setHistoryData] = useState<homeworkApi.HomeworkRecordWithStudent[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  const isToday = date === todayStr()

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
    const group = groups.find(g => g.id === selectedGroup)
    if (!await confirm({ message: `确认将"${group?.name || '本组'}"所有学生全科设为交齐？\n此操作会清除该组今天的全部作业登记数据。` })) return
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
    return <div className="flex items-center justify-center h-full text-stone-400">加载中...</div>
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 xl:p-8 max-w-6xl xl:max-w-none mx-auto">
        {/* 顶部 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl xl:text-3xl font-bold text-stone-800">作业管理</h1>
          <button
            onClick={openHistory}
            className="flex items-center gap-2 px-4 py-2 xl:text-lg text-stone-600 border rounded-lg hover:bg-stone-50"
          >
            <History size={18} /> 未交记录
          </button>
        </div>

        {/* 日期和科目选择 */}
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            {supplementMode ? (
              <>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
                <button
                  onClick={() => { setDate(todayStr()); setSupplementMode(false) }}
                  className="text-xs px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200"
                >
                  返回今天
                </button>
              </>
            ) : (
              <>
                <span className={`text-lg xl:text-xl font-bold ${isToday ? 'text-primary-600' : 'text-stone-700'}`}>
                  {formatDateCN(date)}
                  {isToday && <span className="ml-2 text-xs bg-primary-100 text-primary-600 px-2 py-0.5 rounded-full align-middle">今天</span>}
                </span>
                <button
                  onClick={() => setSupplementMode(true)}
                  className="text-xs px-2 py-1 text-stone-400 hover:text-stone-600 border rounded hover:bg-stone-50 flex items-center gap-1"
                  title="补登其他日期"
                >
                  <Edit3 size={12} /> 补登
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm xl:text-base text-stone-500 mr-1">今日科目：</span>
            {ALL_SUBJECTS.map(subj => (
              <button
                key={subj}
                onClick={() => toggleSubject(subj)}
                className={`px-3 py-1 xl:px-4 xl:py-1.5 rounded-full text-sm xl:text-base border transition-colors ${
                  subjects.includes(subj)
                    ? 'bg-primary-100 text-primary-700 border-primary-300'
                    : 'bg-stone-50 text-stone-400 border-stone-200'
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
              className={`px-3 py-1.5 xl:px-4 xl:py-2 rounded-full text-xs xl:text-sm font-medium border transition-colors ${
                selectedGroup === g.id
                  ? `${g.color} text-white border-transparent`
                  : 'bg-white text-stone-500 border-stone-200 hover:bg-stone-50'
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
                  <div className={`px-4 py-2 xl:py-3 text-white text-sm xl:text-base font-medium ${group?.color || 'bg-stone-400'} flex items-center justify-between`}>
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
                          <tr className="bg-stone-50 border-b">
                            <th className="text-left px-4 py-2 xl:py-3 text-sm xl:text-base font-medium text-stone-500 sticky left-0 bg-stone-50">
                              姓名
                            </th>
                            {subjects.map(subj => (
                              <th key={subj} className="text-center px-3 py-2 xl:py-3 text-sm xl:text-base font-medium text-stone-500 min-w-[80px] xl:min-w-[110px]">
                                {subj}
                              </th>
                            ))}
                            <th className="text-center px-3 py-2 xl:py-3 text-sm xl:text-base font-medium text-stone-400">
                              操作
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {groupStudents.map(s => (
                            <tr key={s.id} className="hover:bg-stone-50">
                              <td className="px-4 py-2 xl:py-3 text-sm xl:text-base font-medium sticky left-0 bg-white">
                                <div className="flex items-center gap-1">
                                  <span>{s.name}</span>
                                  {group?.leader_name === s.name && (
                                    <Crown size={13} className="text-yellow-500" />
                                  )}
                                </div>
                              </td>
                              {subjects.map(subj => {
                                const status = records.get(`${s.id}:${subj}`) || 'complete'
                                const cfg = STATUS_MAP[status]
                                return (
                                  <td key={subj} className="px-2 py-1.5 text-center">
                                    <button
                                      onClick={() => cycleStatus(s.id, subj)}
                                      className={`text-xs xl:text-sm px-3 py-1 xl:px-4 xl:py-1.5 rounded-full border cursor-pointer transition-colors ${cfg.color}`}
                                    >
                                      {cfg.icon} {cfg.label}
                                    </button>
                                  </td>
                                )
                              })}
                              <td className="px-2 py-1.5 text-center">
                                <button
                                  onClick={() => resetStudentAllIncomplete(s.id)}
                                  className="px-2.5 py-1 xl:px-3 xl:py-1.5 text-xs xl:text-sm rounded-lg border border-red-200 text-red-500 hover:bg-red-50 active:scale-95 transition-all whitespace-nowrap"
                                >
                                  一键未交
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="text-center py-8 text-stone-400 text-sm">该小组暂无学生</div>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        ) : selectedGroup && subjects.length === 0 ? (
          <div className="text-center py-12 text-stone-400">请先选择今天的科目</div>
        ) : null}

        {/* 底部提示 */}
        <p className="text-xs text-stone-400 mt-3">
          默认所有同学状态为"交齐"，点击按钮切换：交齐 → 未交 → 未交齐 → 交齐
        </p>
      </div>

      {/* 未交记录弹窗 */}
      <Modal open={showHistory} onClose={() => setShowHistory(false)} title="未交作业记录" width="lg">
        {historyData.length === 0 ? (
          <p className="text-center text-stone-400 py-8">太棒了，没有未交作业记录！</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-stone-50">
                <th className="text-left px-3 py-2 text-stone-500 font-medium">日期</th>
                <th className="text-left px-3 py-2 text-stone-500 font-medium">姓名</th>
                <th className="text-left px-3 py-2 text-stone-500 font-medium">小组</th>
                <th className="text-left px-3 py-2 text-stone-500 font-medium">科目</th>
                <th className="text-left px-3 py-2 text-stone-500 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {historyData.map(r => {
                const cfg = STATUS_MAP[r.status]
                return (
                  <tr key={r.id} className="hover:bg-stone-50">
                    <td className="px-3 py-2 text-stone-600">{r.date}</td>
                    <td className="px-3 py-2 font-medium">{r.student_name}</td>
                    <td className="px-3 py-2 text-stone-500">{r.group_name || '-'}</td>
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
        <button onClick={() => setShowHistory(false)} className="mt-4 w-full py-2 text-stone-600 border rounded-lg hover:bg-stone-50">
          关闭
        </button>
      </Modal>
    </div>
  )
}
