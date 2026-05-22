import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Check, X, History } from 'lucide-react'
import * as groupApi from '@/lib/groups'
import { getRosterStudents, getSignIns, getScoreAwards, signInStudent, unSignStudent, LABEL_NAMES, type PracticeLabel } from '@/lib/practice-roster'
import type { StudentWithGroup, Group, PracticeSignIn, PracticeScoreAward } from '@/types'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(date: string): string {
  const d = new Date(date)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

interface RosterStudent extends StudentWithGroup {
  sign_in_order: number | null
  signed_at: number | null
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export default function DailyPracticePage() {
  const [date, setDate] = useState(todayStr())
  const [groupMap, setGroupMap] = useState<Map<string, Group>>(new Map())
  const [loading, setLoading] = useState(true)

  // 每个标签的学生+签到状态
  const [qiangjiStudents, setQiangjiStudents] = useState<RosterStudent[]>([])
  const [tishengStudents, setTishengStudents] = useState<RosterStudent[]>([])

  // 每个标签的加分记录
  const [qiangjiAwards, setQiangjiAwards] = useState<(PracticeScoreAward & { group_name: string })[]>([])
  const [tishengAwards, setTishengAwards] = useState<(PracticeScoreAward & { group_name: string })[]>([])

  // 历史查询
  const [showHistory, setShowHistory] = useState(false)
  const [historyDate, setHistoryDate] = useState(todayStr())
  const [historyQiangji, setHistoryQiangji] = useState<RosterStudent[]>([])
  const [historyTisheng, setHistoryTisheng] = useState<RosterStudent[]>([])
  const [historyQAwards, setHistoryQAwards] = useState<(PracticeScoreAward & { group_name: string })[]>([])
  const [historyTAwards, setHistoryTAwards] = useState<(PracticeScoreAward & { group_name: string })[]>([])

  const loadData = useCallback(async () => {
    const [groups, qStudents, tStudents] = await Promise.all([
      groupApi.getAllGroups(),
      getRosterStudents('qiangji'),
      getRosterStudents('tisheng'),
    ])
    setGroupMap(new Map(groups.map(g => [g.id, g])))

    // 加载签到记录
    const [qSignIns, tSignIns, qAwards, tAwards] = await Promise.all([
      getSignIns(date, 'qiangji'),
      getSignIns(date, 'tisheng'),
      getScoreAwards(date, 'qiangji'),
      getScoreAwards(date, 'tisheng'),
    ])

    const mergeStudents = (students: StudentWithGroup[], signIns: (PracticeSignIn & { student_name: string; group_name: string; group_color: string })[]): RosterStudent[] => {
      const signMap = new Map(signIns.map(si => [si.student_id, si]))
      return students.map(s => {
        const si = signMap.get(s.id)
        return { ...s, sign_in_order: si ? si.sign_in_order : null, signed_at: si ? si.signed_at : null }
      })
    }

    setQiangjiStudents(mergeStudents(qStudents, qSignIns))
    setTishengStudents(mergeStudents(tStudents, tSignIns))
    setQiangjiAwards(qAwards)
    setTishengAwards(tAwards)
    setLoading(false)
  }, [date])

  useEffect(() => { loadData() }, [loadData])

  const handleSignIn = async (studentId: string, label: PracticeLabel) => {
    try {
      await signInStudent(studentId, date, label)
      await loadData()
    } catch (err) {
      console.error('[handleSignIn] error:', err)
      alert(`签到失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleUnsign = async (studentId: string, label: PracticeLabel) => {
    await unSignStudent(studentId, date, label)
    await loadData()
  }

  const changeDate = (days: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }

  const openHistory = async () => {
    await loadHistoryDate(todayStr())
    setShowHistory(true)
  }

  const loadHistoryDate = async (d: string) => {
    setHistoryDate(d)
    const [qStudents, tStudents, qSignIns, tSignIns, qAwards, tAwards] = await Promise.all([
      getRosterStudents('qiangji'),
      getRosterStudents('tisheng'),
      getSignIns(d, 'qiangji'),
      getSignIns(d, 'tisheng'),
      getScoreAwards(d, 'qiangji'),
      getScoreAwards(d, 'tisheng'),
    ])

    const mergeStudents = (students: StudentWithGroup[], signIns: (PracticeSignIn & { student_name: string; group_name: string; group_color: string })[]): RosterStudent[] => {
      const signMap = new Map(signIns.map(si => [si.student_id, si]))
      return students.map(s => {
        const si = signMap.get(s.id)
        return { ...s, sign_in_order: si ? si.sign_in_order : null, signed_at: si ? si.signed_at : null }
      })
    }

    setHistoryQiangji(mergeStudents(qStudents, qSignIns))
    setHistoryTisheng(mergeStudents(tStudents, tSignIns))
    setHistoryQAwards(qAwards)
    setHistoryTAwards(tAwards)
  }

  const changeHistoryDate = (days: number) => {
    const d = new Date(historyDate)
    d.setDate(d.getDate() + days)
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    loadHistoryDate(ds)
  }

  const renderBonusSlots = (awards: (PracticeScoreAward & { group_name: string })[], label: PracticeLabel) => {
    const slots = []
    for (let i = 0; i < 5; i++) {
      const award = awards[i]
      if (award) {
        // 查找该组颜色
        const groupAward = [...groupMap.values()].find(g => g.id === award.group_id)
        const bg = groupAward?.color || 'bg-gray-500'
        slots.push(
          <span key={i} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white ${bg}`}>
            {award.group_name}
          </span>
        )
      } else {
        slots.push(
          <span key={i} className="inline-flex items-center justify-center w-6 h-6 rounded-full border-2 border-dashed border-gray-300 text-gray-300 text-xs">
            {i + 1}
          </span>
        )
      }
    }
    return <div className="flex items-center gap-1.5 flex-wrap">{slots}</div>
  }

  const renderStudentList = (students: RosterStudent[], label: PracticeLabel) => {
    const signedCount = students.filter(s => s.sign_in_order !== null).length
    const awards = label === 'qiangji' ? qiangjiAwards : tishengAwards

    return (
      <div className="bg-white rounded-xl border-2 overflow-hidden">
        {/* 标题栏 */}
        <div className={`px-4 py-3 flex items-center justify-between ${
          label === 'qiangji' ? 'bg-blue-50 border-b border-blue-200' : 'bg-orange-50 border-b border-orange-200'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${label === 'qiangji' ? 'text-blue-700' : 'text-orange-700'}`}>
              {LABEL_NAMES[label]}
            </span>
            <span className="text-xs text-gray-500">{signedCount}/{students.length} 已签</span>
          </div>
        </div>

        {/* 加分位 */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 shrink-0">加分位：</span>
            {renderBonusSlots(awards, label)}
          </div>
          {awards.length >= 5 && (
            <p className="text-xs text-gray-400 mt-1">5个加分位已满</p>
          )}
        </div>

        {/* 学生列表 */}
        <div className="divide-y divide-gray-50 max-h-[500px] overflow-auto">
          {students.map(s => {
            const signed = s.sign_in_order !== null
            const group = groupMap.get(s.group_id)
            return (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-gray-800 truncate">{s.name}</span>
                  {group && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full text-white shrink-0 ${group.color}`}>
                      {group.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {signed ? (
                    <>
                      <span className="text-xs text-green-600 font-mono font-bold">
                        #{s.sign_in_order} · {s.signed_at ? formatTime(s.signed_at) : ''}
                      </span>
                      <button
                        onClick={() => handleUnsign(s.id, label)}
                        className="p-0.5 text-gray-300 hover:text-red-500 rounded hover:bg-red-50"
                        title="取消签到"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleSignIn(s.id, label)}
                      className="flex items-center gap-1 px-3 py-1 text-xs bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
                    >
                      <Check size={12} /> 签到
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {students.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              暂无{LABEL_NAMES[label]}学生<br />
              <span className="text-xs">请在学生管理中设置每日一练标签</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-6xl mx-auto">
        {/* 标题 + 日期导航 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800">每日一练</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronLeft size={20} />
            </button>
            <span className="text-lg font-medium min-w-[160px] text-center">{formatDate(date)}</span>
            <button onClick={() => changeDate(1)} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronRight size={20} />
            </button>
            <button
              onClick={() => setDate(todayStr())}
              className="px-3 py-1 text-sm text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50"
            >
              今天
            </button>
            <button
              onClick={openHistory}
              className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
            >
              <History size={14} /> 历史
            </button>
          </div>
        </div>

        {/* 统计行 */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {([
            { label: '强基', signed: qiangjiStudents.filter(s => s.sign_in_order !== null).length, total: qiangjiStudents.length, bg: 'bg-blue-50', text: 'text-blue-700' },
            { label: '提升', signed: tishengStudents.filter(s => s.sign_in_order !== null).length, total: tishengStudents.length, bg: 'bg-orange-50', text: 'text-orange-700' },
            { label: '强基加分', signed: qiangjiAwards.length, total: 5, bg: 'bg-blue-50', text: 'text-blue-700' },
            { label: '提升加分', signed: tishengAwards.length, total: 5, bg: 'bg-orange-50', text: 'text-orange-700' },
          ] as const).map(item => (
            <div key={item.label} className={`rounded-lg border p-3 text-center ${item.bg}`}>
              <div className="text-xs text-gray-500">{item.label}</div>
              <div className={`text-lg font-bold ${item.text}`}>{item.signed}/{item.total}</div>
            </div>
          ))}
        </div>

        {/* 双列布局 */}
        <div className="grid grid-cols-2 gap-4">
          {renderStudentList(qiangjiStudents, 'qiangji')}
          {renderStudentList(tishengStudents, 'tisheng')}
        </div>

        <p className="text-xs text-gray-400 mt-3">
          点击"签到"完成每日一练 · 前5个不同小组各加1学习积分 · 点击 ✕ 取消签到
          · 强基 {qiangjiStudents.length} 人 · 提升 {tishengStudents.length} 人
        </p>
      </div>

      {/* 历史查询弹窗 */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[640px] max-h-[80vh] shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">每日一练历史</h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            {/* 日期选择 */}
            <div className="flex items-center gap-3 mb-4 pb-4 border-b">
              <button onClick={() => changeHistoryDate(-1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={18} /></button>
              <input
                type="date"
                value={historyDate}
                onChange={e => loadHistoryDate(e.target.value)}
                min={`${new Date().getFullYear() - 3}-01-01`}
                max={todayStr()}
                className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 flex-1"
              />
              <button onClick={() => changeHistoryDate(1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight size={18} /></button>
              <button
                onClick={() => loadHistoryDate(todayStr())}
                className="px-3 py-1 text-sm text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50"
              >
                今天
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              {historyQiangji.filter(s => s.sign_in_order !== null).length === 0 && historyTisheng.filter(s => s.sign_in_order !== null).length === 0 ? (
                <p className="text-center text-gray-400 py-8">{historyDate} 无签到记录</p>
              ) : (
                <div className="space-y-3">
                  {/* 强基 */}
                  {historyQiangji.filter(s => s.sign_in_order !== null).length > 0 && (
                    <div className="border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">强基</span>
                        <span className="text-xs text-gray-400">{historyQiangji.filter(s => s.sign_in_order !== null).length}人签到</span>
                        {historyQAwards.length > 0 && (
                          <span className="text-xs text-green-600">（{historyQAwards.map(a => a.group_name).join('、')} 各+1分）</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {historyQiangji.filter(s => s.sign_in_order !== null).sort((a, b) => (a.sign_in_order ?? 0) - (b.sign_in_order ?? 0)).map(s => (
                          <span key={s.id} className="inline-block mr-2 mb-1">
                            <span className="font-mono text-gray-400">#{s.sign_in_order}</span> {s.name}
                            <span className="text-gray-300 ml-0.5">({groupMap.get(s.group_id)?.name || '-'})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* 提升 */}
                  {historyTisheng.filter(s => s.sign_in_order !== null).length > 0 && (
                    <div className="border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">提升</span>
                        <span className="text-xs text-gray-400">{historyTisheng.filter(s => s.sign_in_order !== null).length}人签到</span>
                        {historyTAwards.length > 0 && (
                          <span className="text-xs text-green-600">（{historyTAwards.map(a => a.group_name).join('、')} 各+1分）</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {historyTisheng.filter(s => s.sign_in_order !== null).sort((a, b) => (a.sign_in_order ?? 0) - (b.sign_in_order ?? 0)).map(s => (
                          <span key={s.id} className="inline-block mr-2 mb-1">
                            <span className="font-mono text-gray-400">#{s.sign_in_order}</span> {s.name}
                            <span className="text-gray-300 ml-0.5">({groupMap.get(s.group_id)?.name || '-'})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button onClick={() => setShowHistory(false)} className="mt-4 w-full py-2 text-gray-600 border rounded-lg hover:bg-gray-50">关闭</button>
          </div>
        </div>
      )}
    </div>
  )
}
