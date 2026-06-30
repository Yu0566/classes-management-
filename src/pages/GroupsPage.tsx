import { useState, useEffect, useCallback } from 'react'
import { Calculator, TrendingUp, Undo, Trash2, Search } from 'lucide-react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import * as groupApi from '@/lib/groups'
import type { Group } from '@/types'
import { getUnifiedLedger, type LedgerEntry } from '@/lib/score-ledger'

export default function GroupsPage() {
  const { confirm, notify } = useConfirm()
  const [tab, setTab] = useState<'groups' | 'ledger'>('groups')
  const [groups, setGroups] = useState<Group[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [groupView, setGroupView] = useState<'timeline' | 'grouped'>('timeline')
  const [searchName, setSearchName] = useState('')
  const [searchDate, setSearchDate] = useState('')
  const [editingScore, setEditingScore] = useState<{ groupId: string; field: 'study' | 'total' } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const [g, l] = await Promise.all([
      groupApi.getAllGroups(),
      getUnifiedLedger(),
    ])
    setGroups(g)
    setLedger(l)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // 快捷加减学习积分（不影响总积分）
  const handleQuickAdjustStudy = async (groupId: string, delta: number) => {
    try {
      await groupApi.adjustGroupScore(groupId, delta, `学习${delta > 0 ? '+' : ''}${delta}`)
      await loadData()
    } catch (err: any) {
      await notify(`操作失败：${err?.message || err}`)
    }
  }

  // 快捷加减总积分
  const handleQuickAdjustTotal = async (groupId: string, delta: number) => {
    try {
      const group = groups.find(g => g.id === groupId)
      if (!group) return
      await groupApi.setGroupScore(groupId, undefined, group.total_score + delta, `总分${delta > 0 ? '+' : ''}${delta}`)
      await loadData()
    } catch (err: any) {
      await notify(`操作失败：${err?.message || err}`)
    }
  }

  // 内联编辑积分
  const handleInlineEdit = async () => {
    if (!editingScore || !editValue.trim()) {
      setEditingScore(null)
      return
    }
    const val = parseInt(editValue, 10)
    if (isNaN(val)) { setEditingScore(null); return }
    try {
      if (editingScore.field === 'study') {
        await groupApi.setGroupScore(editingScore.groupId, val, undefined, '编辑学习积分')
      } else {
        await groupApi.setGroupScore(editingScore.groupId, undefined, val, '编辑总积分')
      }
      setEditingScore(null)
      await loadData()
    } catch (err: any) {
      await notify(`操作失败：${err?.message || err}`)
    }
  }

  // 撤销上一步
  const handleUndo = async () => {
    const ok = await groupApi.undoLastScoreChange()
    if (!ok) { await notify('没有可撤销的操作'); return }
    await loadData()
    await loadData()
  }

  // 一键算分（排名奖励）
  const handleRankingBonus = async () => {
    const allZero = groups.every(g => g.study_score === 0)
    if (allZero) {
      await notify('所有小组学习积分均为0，无需算分。')
      return
    }
    if (!await confirm({ message: '将按当前学习积分排名发放总积分奖励：\n第1名+8，第2名+7，第3名+6...\n执行后所有小组的学习积分将清零。\n确认执行？', variant: 'normal' })) return
    await groupApi.calculateRankingBonus()
    await loadData()
    await loadData()
  }

  // 全部积分清零
  const handleResetAll = async () => {
    if (!await confirm({ message: '确认将所有小组的学习积分和总积分全部清零？\n此操作可在操作历史中逐条撤销。' })) return
    await groupApi.resetAllScores()
    await loadData()
    await loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-stone-400">加载中...</div>
      </div>
    )
  }

  // 按总赚取排名（total_score + tree_spent），相同时比较累计学习积分
  const rankedGroups = [...groups].sort((a, b) => {
    const earnedA = a.total_score + (a.tree_spent || 0)
    const earnedB = b.total_score + (b.tree_spent || 0)
    const diff = earnedB - earnedA
    if (diff !== 0) return diff
    return b.cumulative_study_score - a.cumulative_study_score
  })

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto p-6">
        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-stone-800">小组积分管理</h1>
            <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
              <button
                onClick={() => setTab('groups')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === 'groups' ? 'bg-white text-stone-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                }`}
              >小组一览</button>
              <button
                onClick={() => setTab('ledger')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === 'ledger' ? 'bg-white text-stone-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                }`}
              >积分流水</button>
            </div>
          </div>
          {tab === 'groups' && (
            <div className="flex gap-2">
              <button
                onClick={handleResetAll}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-stone-600 border rounded-lg hover:bg-stone-50 transition-colors"
                title="所有小组积分清零"
              >
                <Trash2 size={16} />
                清零
              </button>
              <button
                onClick={handleUndo}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-stone-600 border rounded-lg hover:bg-stone-50 transition-colors"
                title="撤销上一步积分操作"
              >
                <Undo size={16} />
                撤销
              </button>
              <button
                onClick={handleRankingBonus}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-stone-600 border rounded-lg hover:bg-stone-50 transition-colors"
              >
                <Calculator size={16} />
                一键算分
              </button>
            </div>
          )}
        </div>

        {tab === 'groups' ? (
          <>
            {/* 排名榜 */}
            <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
          <h2 className="font-semibold text-stone-700 mb-1 flex items-center gap-2">
            <TrendingUp size={18} className="text-primary-500" />
            总积分排名
          </h2>
          <p className="text-xs text-stone-400 mb-3">积分相同时按累计学习积分决胜</p>
          <div className="flex items-end gap-3 h-32">
            {rankedGroups.slice(0, 8).map(group => (
              <div key={group.id} className="flex-1 flex flex-col items-center">
                <div className="text-sm font-bold mb-1">
                  {rankedGroups.indexOf(group) === 0 ? '🥇' : rankedGroups.indexOf(group) === 1 ? '🥈' : rankedGroups.indexOf(group) === 2 ? '🥉' : `#${rankedGroups.indexOf(group) + 1}`}
                </div>
                <div
                  className={`w-full rounded-t-md ${group.color} transition-all duration-500`}
                  style={{
                    height: `${Math.max(12, ((group.total_score + (group.tree_spent || 0)) / Math.max(1, (rankedGroups[0]?.total_score || 0) + (rankedGroups[0]?.tree_spent || 0) || 1)) * 80)}px`,
                    opacity: 0.3 + (rankedGroups.indexOf(group) < 3 ? 0.7 : 0.3 - rankedGroups.indexOf(group) * 0.08),
                  }}
                />
                <div className="text-xs mt-1 text-center font-medium truncate w-full">{group.name}{group.leader_name ? `（${group.leader_name}）` : ''}</div>
                <div className="text-xs text-stone-500">{group.total_score + (group.tree_spent || 0)}<span className="text-stone-300"> · </span><span className="text-amber-600">学{group.cumulative_study_score}</span></div>
              </div>
            ))}
          </div>
        </div>

        {/* 小组卡片列表 */}
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {groups.map(group => (
            <div key={group.id} className="bg-white rounded-xl shadow-sm border hover:shadow-md transition-shadow">
              {/* 卡片头部 */}
              <div className={`${group.color} text-white rounded-t-xl p-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg">{group.name}</h3>
                    {group.leader_name && <p className="text-xs text-white/70">组长：{group.leader_name}</p>}
                  </div>
                </div>
                <div className="flex justify-between mt-2 text-white/90">
                  <div
                    className="cursor-pointer hover:bg-white/10 rounded px-1 -ml-1 transition-colors"
                    onClick={() => { setEditingScore({ groupId: group.id, field: 'study' }); setEditValue(String(group.study_score)) }}
                    title="点击编辑学习积分"
                  >
                    <div className="text-xs">学习积分</div>
                    {editingScore?.groupId === group.id && editingScore?.field === 'study' ? (
                      <input
                        type="number"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={handleInlineEdit}
                        onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(); if (e.key === 'Escape') setEditingScore(null) }}
                        className="w-16 text-xl font-bold bg-white/30 rounded px-1 text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        autoFocus
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <div className="text-xl font-bold">{group.study_score}</div>
                    )}
                  </div>
                  <div
                    className="cursor-pointer hover:bg-white/10 rounded px-1 -mr-1 transition-colors text-right"
                    onClick={() => { setEditingScore({ groupId: group.id, field: 'total' }); setEditValue(String(group.total_score)) }}
                    title="点击编辑总积分"
                  >
                    <div className="text-xs">总积分</div>
                    {editingScore?.groupId === group.id && editingScore?.field === 'total' ? (
                      <input
                        type="number"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={handleInlineEdit}
                        onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(); if (e.key === 'Escape') setEditingScore(null) }}
                        className="w-16 text-xl font-bold bg-white/30 rounded px-1 text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        autoFocus
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <div className="text-xl font-bold">{group.total_score}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* 快捷操作 */}
              <div className="p-3">
                <p className="text-xs text-stone-400 mb-1">学习积分</p>
                <div className="flex gap-1 mb-2">
                  {[1, 2, 3, 5, 10].map(n => (
                    <button
                      key={n}
                      onClick={() => handleQuickAdjustStudy(group.id, n)}
                      className="flex-1 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors"
                    >
                      +{n}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 5, 10].map(n => (
                    <button
                      key={n}
                      onClick={() => handleQuickAdjustStudy(group.id, -n)}
                      className="flex-1 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                    >
                      -{n}
                    </button>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-stone-400 mb-1">总积分</p>
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 5, 10].map(n => (
                      <button
                        key={n}
                        onClick={() => handleQuickAdjustTotal(group.id, n)}
                        className="flex-1 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors"
                      >
                        +{n}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 5, 10].map(n => (
                      <button
                        key={n}
                        onClick={() => handleQuickAdjustTotal(group.id, -n)}
                        className="flex-1 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                      >
                        -{n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {groups.length === 0 && (
            <div className="col-span-full text-center py-12 text-stone-400">
              <p className="text-4xl mb-2">📭</p>
              <p>还没有小组，请到"学生管理 → 小组管理"添加小组</p>
            </div>
          )}
        </div>
          </>
        ) : (
          <>
            {(() => {
              const groupLedger = ledger.filter(e => e.type === 'group')
              const filteredLedger = groupLedger.filter(entry => {
                if (searchName) {
                  const name = entry.groupName || ''
                  if (!name.includes(searchName)) return false
                }
                if (searchDate) {
                  const d = new Date(entry.timestamp)
                  const entryDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                  if (entryDate !== searchDate) return false
                }
                return true
              })
              const totalPoints = groupLedger.reduce((s, e) => s + e.points, 0)

              return (
                <>
                  {/* 统计概览 */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white rounded-lg border p-3 text-center">
                      <div className="text-xs text-stone-500">操作总数</div>
                      <div className="text-lg font-bold text-amber-600">{groupLedger.length}条</div>
                    </div>
                    <div className="bg-white rounded-lg border p-3 text-center">
                      <div className="text-xs text-stone-500">净积分变动</div>
                      <div className={`text-lg font-bold ${totalPoints >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {totalPoints >= 0 ? '+' : ''}{totalPoints}分
                      </div>
                    </div>
                  </div>

                  {/* 筛选 */}
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
                      <button
                        onClick={() => setGroupView('timeline')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          groupView === 'timeline' ? 'bg-white text-stone-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                        }`}
                      >按时间</button>
                      <button
                        onClick={() => setGroupView('grouped')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          groupView === 'grouped' ? 'bg-white text-stone-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                        }`}
                      >按小组</button>
                    </div>
                    <div className="relative">
                      <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400" />
                      <input
                        type="text" placeholder="搜索小组..."
                        value={searchName} onChange={e => setSearchName(e.target.value)}
                        className="pl-7 pr-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-400 w-36"
                      />
                    </div>
                    <input
                      type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)}
                      className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                    {(searchName || searchDate) && (
                      <button
                        onClick={() => { setSearchName(''); setSearchDate('') }}
                        className="text-xs text-stone-400 hover:text-stone-600 underline"
                      >清除筛选</button>
                    )}
                  </div>

                  {/* 流水内容 */}
                  {filteredLedger.length === 0 ? (
                    <div className="text-center py-12 text-stone-400 text-sm">暂无小组积分流水记录</div>
                  ) : groupView === 'timeline' ? (
                    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-stone-50 border-b">
                            <th className="text-left px-4 py-3 text-sm font-medium text-stone-500">小组</th>
                            <th className="text-center px-4 py-3 text-sm font-medium text-stone-500 w-16">变动</th>
                            <th className="text-left px-4 py-3 text-sm font-medium text-stone-500">原因</th>
                            <th className="text-left px-4 py-3 text-sm font-medium text-stone-500 w-36">时间</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredLedger.map(entry => {
                            const pointsCls = entry.points > 0 ? 'text-green-600' : entry.points < 0 ? 'text-red-600' : 'text-stone-400'
                            const pointsStr = entry.points > 0 ? `+${entry.points}` : `${entry.points}`
                            return (
                              <tr key={entry.id} className="hover:bg-stone-50">
                                <td className="px-4 py-2 text-sm font-medium">{entry.groupName || '未知小组'}</td>
                                <td className={`px-4 py-2 text-sm font-bold text-center ${pointsCls}`}>{pointsStr}</td>
                                <td className="px-4 py-2 text-sm text-stone-600">{entry.reason}</td>
                                <td className="px-4 py-2 text-xs text-stone-400">{new Date(entry.timestamp).toLocaleString('zh-CN')}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(() => {
                        const grouped = new Map<string, LedgerEntry[]>()
                        for (const entry of filteredLedger) {
                          const key = entry.groupName || '未知小组'
                          const arr = grouped.get(key) || []
                          arr.push(entry)
                          grouped.set(key, arr)
                        }
                        return [...grouped.entries()].map(([groupName, entries]) => {
                          const total = entries.reduce((s, e) => s + e.points, 0)
                          return (
                            <div key={groupName} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                              <div className="bg-amber-50 px-4 py-3 border-b flex items-center justify-between">
                                <span className="font-semibold text-stone-700">{groupName}</span>
                                <span className={`text-sm font-bold ${total >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  合计：{total >= 0 ? '+' : ''}{total}分 · {entries.length}条
                                </span>
                              </div>
                              <table className="w-full">
                                <tbody className="divide-y divide-gray-100">
                                  {entries.map(entry => {
                                    const pointsCls = entry.points > 0 ? 'text-green-600' : entry.points < 0 ? 'text-red-600' : 'text-stone-400'
                                    const pointsStr = entry.points > 0 ? `+${entry.points}` : `${entry.points}`
                                    return (
                                      <tr key={entry.id} className="hover:bg-stone-50">
                                        <td className={`px-4 py-2 text-sm font-bold w-16 text-center ${pointsCls}`}>{pointsStr}</td>
                                        <td className="px-4 py-2 text-sm text-stone-600">{entry.reason}</td>
                                        <td className="px-4 py-2 text-xs text-stone-400 w-36 text-right">{new Date(entry.timestamp).toLocaleString('zh-CN')}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}
                </>
              )
            })()}
          </>
        )}
      </div>

    </div>
  )
}
