import { useState, useEffect, useCallback } from 'react'
import { Plus, Minus, Trash2, History, Coins } from 'lucide-react'
import * as coinsApi from '@/lib/coins'
import type { CoinGroup, CoinHistory } from '@/types'

export default function CoinsPage() {
  const [groups, setGroups] = useState<CoinGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [showHistory, setShowHistory] = useState<string | null>(null)
  const [history, setHistory] = useState<CoinHistory[]>([])
  const [adjustDialog, setAdjustDialog] = useState<{ groupId: string; delta: number } | null>(null)
  const [reason, setReason] = useState('')

  const loadData = useCallback(async () => {
    setGroups(await coinsApi.getAllCoinGroups())
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleAdd = async () => {
    if (!newName.trim()) return
    await coinsApi.createCoinGroup(newName.trim())
    setNewName('')
    setShowAdd(false)
    await loadData()
  }

  const handleDelete = async (g: CoinGroup) => {
    if (!window.confirm(`确认删除"${g.name}"？`)) return
    await coinsApi.deleteCoinGroup(g.id)
    await loadData()
  }

  const handleAdjust = async () => {
    if (!adjustDialog || !reason.trim()) return
    await coinsApi.adjustCoins(adjustDialog.groupId, adjustDialog.delta, reason)
    setAdjustDialog(null)
    setReason('')
    await loadData()
  }

  const handleShowHistory = async (groupId: string) => {
    const h = await coinsApi.getCoinHistory(groupId)
    setHistory(h)
    setShowHistory(groupId)
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
            <p className="text-sm text-gray-500 mt-1">总余额：<span className="font-bold text-yellow-600">{totalCoins}</span> 宝龙币</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
          >
            <Plus size={18} /> 添加小组
          </button>
        </div>

        {/* 小组列表 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(g => (
            <div key={g.id} className="bg-white rounded-xl shadow-sm border hover:shadow-md transition-shadow">
              <div className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-white rounded-t-xl p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">{g.name}</h3>
                  <button
                    onClick={() => handleDelete(g)}
                    className="p-1 rounded hover:bg-white/20 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="text-center mt-3">
                  <Coins size={32} className="mx-auto mb-1 opacity-80" />
                  <div className="text-3xl font-bold">{g.coins}</div>
                  <div className="text-xs text-yellow-100">宝龙币</div>
                </div>
              </div>

              {/* 快捷操作 */}
              <div className="p-3">
                <div className="flex gap-1 mb-2">
                  {[1, 2, 5, 10].map(n => (
                    <button
                      key={n}
                      onClick={() => setAdjustDialog({ groupId: g.id, delta: n })}
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
                      onClick={() => setAdjustDialog({ groupId: g.id, delta: -n })}
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
              <p>还没有宝龙币小组，点击"添加小组"开始</p>
            </div>
          )}
        </div>
      </div>

      {/* 添加小组弹窗 */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">添加宝龙币小组</h3>
            <input
              type="text"
              placeholder="小组名称"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleAdd} disabled={!newName.trim()} className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50">确认</button>
            </div>
          </div>
        </div>
      )}

      {/* 加减弹窗 */}
      {adjustDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">
              {adjustDialog.delta > 0 ? '发放' : '扣除'}宝龙币 - {groups.find(g => g.id === adjustDialog.groupId)?.name}
            </h3>
            <div className="text-center text-3xl font-bold mb-4">
              <span className={adjustDialog.delta > 0 ? 'text-green-500' : 'text-red-500'}>
                {adjustDialog.delta > 0 ? '+' : ''}{adjustDialog.delta}
              </span>
            </div>
            <input
              type="text"
              placeholder="请输入原因..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && reason.trim() && handleAdjust()}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setAdjustDialog(null); setReason('') }} className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleAdjust} disabled={!reason.trim()} className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 ${adjustDialog.delta > 0 ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}`}>确认</button>
            </div>
          </div>
        </div>
      )}

      {/* 历史弹窗 */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[480px] max-h-[70vh] shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {groups.find(g => g.id === showHistory)?.name} — 变动记录
              </h3>
              <button onClick={() => setShowHistory(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="flex-1 overflow-auto space-y-2">
              {history.length === 0 ? (
                <p className="text-center text-gray-400 py-8">暂无变动记录</p>
              ) : (
                history.map(h => (
                  <div key={h.id} className="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
                    <div>
                      <span className="text-gray-600">{h.reason || '无原因'}</span>
                    </div>
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
          </div>
        </div>
      )}
    </div>
  )
}
