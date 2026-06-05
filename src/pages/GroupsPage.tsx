import { useState, useEffect, useCallback } from 'react'
import { Calculator, History, TrendingUp, Undo, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import * as groupApi from '@/lib/groups'
import type { Group, GroupScoreHistory } from '@/types'

export default function GroupsPage() {
  const { confirm, notify } = useConfirm()
  const [groups, setGroups] = useState<Group[]>([])
  const [history, setHistory] = useState<(GroupScoreHistory & { group_name: string })[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [editingScore, setEditingScore] = useState<{ groupId: string; field: 'study' | 'total' } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const g = await groupApi.getAllGroups()
    setGroups(g)
    setLoading(false)
  }, [])

  const loadHistory = useCallback(async () => {
    const h = await groupApi.getScoreHistory(30)
    setHistory(h)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // 快捷加减学习积分（不影响总积分）
  const handleQuickAdjustStudy = async (groupId: string, delta: number) => {
    await groupApi.adjustGroupScore(groupId, delta, '快捷操作')
    await loadData()
    await loadHistory()
  }

  // 快捷加减总积分
  const handleQuickAdjustTotal = async (groupId: string, delta: number) => {
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    await groupApi.setGroupScore(groupId, undefined, group.total_score + delta)
    await loadData()
    await loadHistory()
  }

  // 内联编辑积分
  const handleInlineEdit = async () => {
    if (!editingScore || !editValue.trim()) {
      setEditingScore(null)
      return
    }
    const val = parseInt(editValue, 10)
    if (isNaN(val)) { setEditingScore(null); return }
    if (editingScore.field === 'study') {
      await groupApi.setGroupScore(editingScore.groupId, val, undefined)
    } else {
      await groupApi.setGroupScore(editingScore.groupId, undefined, val)
    }
    setEditingScore(null)
    await loadData()
    await loadHistory()
  }

  // 撤销上一步
  const handleUndo = async () => {
    const ok = await groupApi.undoLastScoreChange()
    if (!ok) { await notify('没有可撤销的操作'); return }
    await loadData()
    await loadHistory()
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
    await loadHistory()
  }

  // 全部积分清零
  const handleResetAll = async () => {
    if (!await confirm({ message: '确认将所有小组的学习积分和总积分全部清零？\n此操作可在操作历史中逐条撤销。' })) return
    await groupApi.resetAllScores()
    await loadData()
    await loadHistory()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-stone-400">加载中...</div>
      </div>
    )
  }

  // 按总积分排名
  const rankedGroups = [...groups].sort((a, b) => b.total_score - a.total_score)

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-6">
        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-stone-800">小组积分管理</h1>
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
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-stone-600 border rounded-lg hover:bg-stone-50 transition-colors"
            >
              <History size={16} />
              操作历史
            </button>
          </div>
        </div>

        {/* 排名榜 */}
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
          <h2 className="font-semibold text-stone-700 mb-3 flex items-center gap-2">
            <TrendingUp size={18} className="text-primary-500" />
            总积分排名
          </h2>
          <div className="flex items-end gap-3 h-32">
            {rankedGroups.slice(0, 8).map(group => (
              <div key={group.id} className="flex-1 flex flex-col items-center">
                <div className="text-sm font-bold mb-1">
                  {rankedGroups.indexOf(group) === 0 ? '🥇' : rankedGroups.indexOf(group) === 1 ? '🥈' : rankedGroups.indexOf(group) === 2 ? '🥉' : `#${rankedGroups.indexOf(group) + 1}`}
                </div>
                <div
                  className={`w-full rounded-t-md ${group.color} transition-all duration-500`}
                  style={{
                    height: `${Math.max(12, (group.total_score / Math.max(1, rankedGroups[0]?.total_score || 1)) * 80)}px`,
                    opacity: 0.3 + (rankedGroups.indexOf(group) < 3 ? 0.7 : 0.3 - rankedGroups.indexOf(group) * 0.08),
                  }}
                />
                <div className="text-xs mt-1 text-center font-medium truncate w-full">{group.name}{group.leader_name ? `（${group.leader_name}）` : ''}</div>
                <div className="text-xs text-stone-500">{group.total_score}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 小组卡片列表 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
      </div>

      {/* 操作历史弹窗 */}
      <Modal open={showHistory} onClose={() => setShowHistory(false)} title="操作历史（最近30条）">
        <div className="space-y-2">
          {history.length === 0 ? (
            <p className="text-center text-stone-400 py-8">暂无操作记录</p>
          ) : (
            history.map(h => (
              <div key={h.id} className="flex items-center justify-between py-2 border-b border-stone-100 text-sm">
                <div>
                  <span className="font-medium">{h.group_name}</span>
                  <span className="text-stone-400 ml-2">{h.reason}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${h.delta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {h.delta >= 0 ? '+' : ''}{h.delta}
                  </span>
                  <span className="text-xs text-stone-400">
                    {new Date(h.created_at).toLocaleString('zh-CN')}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
        <button
          onClick={() => { setShowHistory(false); loadHistory() }}
          className="mt-4 w-full py-2 text-stone-600 border rounded-lg hover:bg-stone-50"
        >
          关闭
        </button>
      </Modal>

    </div>
  )
}
