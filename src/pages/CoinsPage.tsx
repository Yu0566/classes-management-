import { useState, useEffect, useCallback } from 'react'
import { History, Coins, Calculator } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import * as coinsApi from '@/lib/coins'
import * as groupApi from '@/lib/groups'
import type { CoinGroup, CoinHistory } from '@/types'

export default function CoinsPage() {
  const [groups, setGroups] = useState<CoinGroup[]>([])
  const [leaderMap, setLeaderMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState<string | null>(null)
  const [history, setHistory] = useState<CoinHistory[]>([])
  const [editingCoin, setEditingCoin] = useState<string | null>(null)
  const [editCoinValue, setEditCoinValue] = useState('')
  const [target, setTarget] = useState(15)

  const loadData = useCallback(async () => {
    const [cgs, classGroups] = await Promise.all([
      coinsApi.syncCoinGroups(),
      groupApi.getAllGroups(),
    ])
    setGroups(cgs)
    const lm = new Map<string, string>()
    classGroups.forEach(g => { if (g.leader_name) lm.set(g.name, g.leader_name) })
    setLeaderMap(lm)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleAdjust = async (groupId: string, delta: number) => {
    await coinsApi.adjustCoins(groupId, delta, '快捷操作')
    await loadData()
  }

  const handleSettle = async () => {
    if (!window.confirm(`确认结算？\n将对各组宝龙币按公式（币数 - ${target}）× 3 计算积分（加分上限12），计入总分后全部归零。`)) return
    await coinsApi.settleCoins(target)
    await loadData()
  }

  const handleCoinEdit = async () => {
    if (!editingCoin || !editCoinValue.trim()) {
      setEditingCoin(null)
      return
    }
    const val = parseInt(editCoinValue, 10)
    if (isNaN(val) || val < 0) { setEditingCoin(null); return }
    const group = groups.find(g => g.id === editingCoin)
    if (!group) return
    await coinsApi.adjustCoins(editingCoin, val - group.coins, '手动编辑')
    setEditingCoin(null)
    await loadData()
  }

  const handleShowHistory = async (groupId: string) => {
    const h = await coinsApi.getCoinHistory(groupId)
    setHistory(h)
    setShowHistory(groupId)
  }

  const displayName = (g: CoinGroup) => {
    const leader = leaderMap.get(g.name)
    return leader ? `${g.name}（${leader}）` : g.name
  }

  const totalCoins = groups.reduce((s, g) => s + g.coins, 0)

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">宝龙币管理</h1>
            <p className="text-sm text-gray-500 mt-1">总余额：<span className="font-bold text-yellow-600">{totalCoins}</span> 宝龙币 · 小组同步自学生管理</p>
          </div>
        </div>

        {/* 结算区域 */}
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Calculator size={18} className="text-yellow-500" />
            宝龙币结算
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">目标数量：</span>
              <input
                type="number"
                value={target}
                onChange={e => {
                  const newTarget = Number(e.target.value)
                  if (isNaN(newTarget) || newTarget < 0) return
                  setTarget(newTarget)
                }}
                className="w-20 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            公式：(宝龙币数 - {target}) × 3 计入总积分 · 加分上限12分 · 扣分不设限 · 点击"结算"后计入总分并归零
          </p>
          <button
            onClick={handleSettle}
            className="mt-3 w-full py-2 bg-yellow-500 text-white font-medium rounded-lg hover:bg-yellow-600 transition-colors flex items-center justify-center gap-2"
          >
            <Calculator size={18} /> 结算（计入总分并归零）
          </button>

          {/* 结算预览 */}
          {groups.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-gray-500 mb-2">结算预览：</p>
              <div className="grid grid-cols-4 gap-2">
                {groups.map(g => {
                  const rawDelta = (g.coins - target) * 3
                  const delta = rawDelta > 0 ? Math.min(rawDelta, 12) : rawDelta
                  return (
                    <div key={g.id} className="text-xs bg-gray-50 rounded p-2 text-center">
                      <span className="font-medium">{displayName(g)}</span>
                      <span className="text-gray-400 ml-1">{g.coins}币</span>
                      <span className={`block mt-0.5 font-bold ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '0'}
                        {rawDelta > 12 ? <span className="text-gray-400 font-normal"> (上限)</span> : null}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 小组列表 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(g => (
            <div key={g.id} className="bg-white rounded-xl shadow-sm border hover:shadow-md transition-shadow">
              <div className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-white rounded-t-xl p-4">
                <div>
                  <h3 className="font-bold text-lg">{g.name}</h3>
                  {leaderMap.get(g.name) && <p className="text-xs text-white/70">组长：{leaderMap.get(g.name)}</p>}
                </div>
                <div className="text-center mt-3">
                  <Coins size={32} className="mx-auto mb-1 opacity-80" />
                  {editingCoin === g.id ? (
                    <input
                      type="number"
                      value={editCoinValue}
                      onChange={e => setEditCoinValue(e.target.value)}
                      onBlur={handleCoinEdit}
                      onKeyDown={e => { if (e.key === 'Enter') handleCoinEdit(); if (e.key === 'Escape') setEditingCoin(null) }}
                      className="w-20 text-3xl font-bold bg-white/30 rounded px-1 text-white text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      autoFocus
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <div
                      className="text-3xl font-bold cursor-pointer hover:bg-white/10 rounded"
                      onClick={() => { setEditingCoin(g.id); setEditCoinValue(String(g.coins)) }}
                      title="点击编辑"
                    >
                      {g.coins}
                    </div>
                  )}
                  <div className="text-xs text-yellow-100">宝龙币</div>
                </div>
              </div>

              {/* 快捷操作 */}
              <div className="p-3">
                <div className="flex gap-1 mb-2">
                  {[1, 2, 5, 10].map(n => (
                    <button
                      key={n}
                      onClick={() => handleAdjust(g.id, n)}
                      className="flex-1 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100"
                    >
                      +{n}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 mb-2">
                  {[1, 2, 5, 10].map(n => (
                    <button
                      key={n}
                      onClick={() => handleAdjust(g.id, -n)}
                      className="flex-1 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
                    >
                      -{n}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => handleShowHistory(g.id)}
                  className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-gray-500 border rounded hover:bg-gray-50"
                >
                  <History size={12} /> 变动记录
                </button>
              </div>
            </div>
          ))}

          {groups.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-400">
              <Coins size={48} className="mx-auto mb-2 opacity-30" />
              <p>还没有班级小组，请先在"学生管理 → 小组管理"中添加</p>
            </div>
          )}
        </div>
      </div>

      {/* 历史弹窗 */}
      <Modal
        open={showHistory !== null}
        onClose={() => setShowHistory(null)}
        title={`${(() => { const cg = groups.find(g => g.id === showHistory); return cg ? displayName(cg) : ''; })()} — 变动记录`}
      >
        <div className="space-y-2">
          {history.length === 0 ? (
            <p className="text-center text-gray-400 py-8">暂无变动记录</p>
          ) : (
            history.map(h => (
              <div key={h.id} className="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
                <span className="text-gray-600">{h.reason || '无原因'}</span>
                <div className="flex items-center gap-3">
                  <span className={`font-bold ${h.delta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {h.delta >= 0 ? '+' : ''}{h.delta}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(h.timestamp).toLocaleString('zh-CN')}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
        <button onClick={() => setShowHistory(null)} className="mt-4 w-full py-2 text-gray-600 border rounded-lg hover:bg-gray-50">关闭</button>
      </Modal>
    </div>
  )
}
