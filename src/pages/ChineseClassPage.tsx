import { useState, useEffect, useCallback } from 'react'
import { RotateCcw, Plus, Minus, CheckCircle } from 'lucide-react'
import { getChineseClassScores, addChineseClassScore, resetChineseClassScores, settleClassScores, type ChineseClassGroupScore } from '@/lib/chinese-class'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const COLOR_MAP: Record<string, string> = {
  'bg-blue-500': '#3b82f6',
  'bg-red-500': '#ef4444',
  'bg-green-500': '#22c55e',
  'bg-yellow-500': '#eab308',
  'bg-purple-500': '#a855f7',
  'bg-pink-500': '#ec4899',
  'bg-orange-500': '#f97316',
  'bg-teal-500': '#14b8a6',
  'bg-indigo-500': '#6366f1',
  'bg-cyan-500': '#06b6d4',
}

function getHexColor(twClass: string): string {
  return COLOR_MAP[twClass] || '#78716c'
}

export default function ChineseClassPage() {
  const { confirm } = useConfirm()
  const [groups, setGroups] = useState<ChineseClassGroupScore[]>([])
  const [customInput, setCustomInput] = useState<{ groupId: string; value: string } | null>(null)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    try {
      const data = await getChineseClassScores()
      setGroups(data)
      setError('')
    } catch (e: any) {
      setError(e.message || '加载失败')
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // 监听悬浮球等外部加分后的刷新通知
  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api?.onDataChanged) return
    const unsub = api.onDataChanged(() => { loadData() })
    return unsub
  }, [loadData])

  const handleAdd = async (groupId: string, delta: number) => {
    await addChineseClassScore(groupId, delta)
    await loadData()
  }

  const handleReset = async () => {
    const ok = await confirm('确认清零所有课堂积分？不会计入学习积分。')
    if (!ok) return
    await resetChineseClassScores()
    await loadData()
  }

  const handleSettle = async () => {
    const hasScore = groups.some(g => g.score !== 0)
    if (!hasScore) return
    const summary = groups.filter(g => g.score !== 0).map(g => `${g.group_name}: ${g.score > 0 ? '+' : ''}${g.score}`).join('、')
    const ok = await confirm(`确认将课堂积分结算到学习积分？\n\n${summary}\n\n结算后课堂积分将清零。`)
    if (!ok) return
    await settleClassScores()
    await loadData()
  }

  const handleScoreEdit = async (groupId: string, currentScore: number) => {
    if (!customInput) return
    const num = parseInt(customInput.value, 10)
    if (isNaN(num) || num === currentScore) { setCustomInput(null); return }
    const delta = num - currentScore
    await addChineseClassScore(groupId, delta)
    setCustomInput(null)
    await loadData()
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-stone-800">课堂加分</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSettle}
              disabled={!groups.some(g => g.score !== 0)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-green-200 text-green-600 hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircle size={14} /> 结算到学习积分
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
            >
              <RotateCcw size={14} /> 清零
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-4 gap-5">
          {groups.map(g => (
            <div
              key={g.group_id}
              className="rounded-2xl overflow-hidden shadow-sm border flex flex-col"
            >
              {/* 彩色头部 */}
              <div className="px-4 py-3 text-center" style={{ backgroundColor: getHexColor(g.group_color) }}>
                <div className="text-lg font-bold text-white drop-shadow-sm">{g.group_name}</div>
                {g.leader_name && (
                  <div className="text-xs text-white/80 mt-0.5">组长：{g.leader_name}</div>
                )}
              </div>

              {/* 内容区 */}
              <div className="flex flex-col items-center px-4 py-5 bg-white flex-1">
                {/* 分数（点击可编辑） */}
                {customInput?.groupId === g.group_id ? (
                  <input
                    type="number"
                    autoFocus
                    value={customInput.value}
                    onChange={e => setCustomInput({ groupId: g.group_id, value: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleScoreEdit(g.group_id, g.score)
                      if (e.key === 'Escape') setCustomInput(null)
                    }}
                    onBlur={() => handleScoreEdit(g.group_id, g.score)}
                    className="w-24 text-5xl font-black text-center mb-5 border-b-2 border-primary-400 outline-none bg-transparent"
                  />
                ) : (
                  <div
                    onClick={() => setCustomInput({ groupId: g.group_id, value: String(g.score) })}
                    className={`text-5xl font-black mb-5 cursor-pointer hover:opacity-70 transition-opacity ${g.score > 0 ? 'text-green-600' : g.score < 0 ? 'text-red-500' : 'text-stone-300'}`}
                    title="点击编辑分数"
                  >
                    {g.score}
                  </div>
                )}

                {/* 大号加减按钮 */}
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={() => handleAdd(g.group_id, -1)}
                    className="w-12 h-12 rounded-full flex items-center justify-center bg-red-50 border-2 border-red-200 text-red-500 hover:bg-red-100 active:scale-90 transition-all"
                  >
                    <Minus size={22} strokeWidth={3} />
                  </button>
                  <button
                    onClick={() => handleAdd(g.group_id, 1)}
                    className="w-12 h-12 rounded-full flex items-center justify-center bg-green-50 border-2 border-green-200 text-green-600 hover:bg-green-100 active:scale-90 transition-all"
                  >
                    <Plus size={22} strokeWidth={3} />
                  </button>
                </div>

                {/* 快捷加分 */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 mb-3">
                  <button
                    onClick={() => handleAdd(g.group_id, 2)}
                    className="px-4 py-2 rounded-lg text-base font-bold border border-green-200 text-green-600 hover:bg-green-50 active:scale-95 transition-all"
                  >+2</button>
                  <button
                    onClick={() => handleAdd(g.group_id, 3)}
                    className="px-4 py-2 rounded-lg text-base font-bold border border-green-200 text-green-600 hover:bg-green-50 active:scale-95 transition-all"
                  >+3</button>
                  <button
                    onClick={() => handleAdd(g.group_id, 5)}
                    className="px-4 py-2 rounded-lg text-base font-bold border border-green-200 text-green-600 hover:bg-green-50 active:scale-95 transition-all"
                  >+5</button>
                  <button
                    onClick={() => handleAdd(g.group_id, -2)}
                    className="px-4 py-2 rounded-lg text-base font-bold border border-red-200 text-red-500 hover:bg-red-50 active:scale-95 transition-all"
                  >−2</button>
                  <button
                    onClick={() => handleAdd(g.group_id, -3)}
                    className="px-4 py-2 rounded-lg text-base font-bold border border-red-200 text-red-500 hover:bg-red-50 active:scale-95 transition-all"
                  >−3</button>
                  <button
                    onClick={() => handleAdd(g.group_id, -5)}
                    className="px-4 py-2 rounded-lg text-base font-bold border border-red-200 text-red-500 hover:bg-red-50 active:scale-95 transition-all"
                  >−5</button>
                </div>

              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
