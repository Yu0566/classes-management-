import { useState, useEffect, useCallback } from 'react'
import { Plus, Minus, Pencil, Trash2, Calculator, History, TrendingUp, RotateCcw } from 'lucide-react'
import * as groupApi from '@/lib/groups'
import * as studentApi from '@/lib/students'
import type { Group, GroupScoreHistory, Student, StudentWithGroup } from '@/types'

// 颜色选项映射
const colorOptions = [
  { value: 'bg-blue-500', label: '蓝色', ring: 'ring-blue-400' },
  { value: 'bg-red-500', label: '红色', ring: 'ring-red-400' },
  { value: 'bg-green-500', label: '绿色', ring: 'ring-green-400' },
  { value: 'bg-yellow-500', label: '黄色', ring: 'ring-yellow-400' },
  { value: 'bg-purple-500', label: '紫色', ring: 'ring-purple-400' },
  { value: 'bg-pink-500', label: '粉色', ring: 'ring-pink-400' },
  { value: 'bg-orange-500', label: '橙色', ring: 'ring-orange-400' },
  { value: 'bg-teal-500', label: '青色', ring: 'ring-teal-400' },
]

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [students, setStudents] = useState<StudentWithGroup[]>([])
  const [history, setHistory] = useState<(GroupScoreHistory & { group_name: string })[]>([])
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [scoreDialog, setScoreDialog] = useState<{ groupId: string; delta: number } | null>(null)
  const [editGroup, setEditGroup] = useState<Group | null>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const [g, s] = await Promise.all([
      groupApi.getAllGroups(),
      studentApi.getAllStudents(),
    ])
    setGroups(g)
    setStudents(s)
    setLoading(false)
  }, [])

  const loadHistory = useCallback(async () => {
    const h = await groupApi.getScoreHistory(30)
    setHistory(h)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // 加分
  const handleAddScore = async (groupId: string) => {
    if (!reason.trim()) return
    await groupApi.adjustGroupScore(groupId, Number(scoreDialog?.delta || 0), reason)
    setReason('')
    setScoreDialog(null)
    await loadData()
    await loadHistory()
  }

  // 减分
  const handleSubScore = async (groupId: string) => {
    if (!reason.trim()) return
    await groupApi.adjustGroupScore(groupId, Number(scoreDialog?.delta || 0), reason)
    setReason('')
    setScoreDialog(null)
    await loadData()
    await loadHistory()
  }

  // 一键算分
  const handleSnapshotCalc = async (groupId: string) => {
    await groupApi.calculateSnapshotDiff(groupId)
    await loadData()
    await loadHistory()
  }

  // 更新快照差异
  const handleRefreshSnapshot = async (groupId: string) => {
    await groupApi.updateSnapshotDiff(groupId)
    await loadData()
  }

  // 删除小组
  const handleDeleteGroup = async (group: Group) => {
    const studentsInGroup = students.filter(s => s.group_id === group.id)
    if (studentsInGroup.length > 0) {
      const confirmed = window.confirm(
        `小组"${group.name}"中有 ${studentsInGroup.length} 名学生。\n删除小组将把这些学生移出小组。\n确认删除？`
      )
      if (!confirmed) return
    }
    await groupApi.deleteGroup(group.id)
    await loadData()
  }

  // 添加小组表单
  const AddGroupForm = () => {
    const [name, setName] = useState('')
    const [color, setColor] = useState('bg-blue-500')

    const handleSubmit = async () => {
      if (!name.trim()) return
      await groupApi.createGroup({ name: name.trim(), color })
      setShowAddGroup(false)
      setName('')
      await loadData()
    }

    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
          <h3 className="text-lg font-semibold mb-4">添加小组</h3>
          <input
            type="text"
            placeholder="小组名称"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
            autoFocus
          />
          <div className="mb-4">
            <p className="text-sm text-gray-500 mb-2">选择颜色</p>
            <div className="flex gap-2">
              {colorOptions.map(c => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`w-8 h-8 rounded-full ${c.value} ${
                    color === c.value ? 'ring-2 ring-offset-2 ' + c.ring : ''
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAddGroup(false)} className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50">
              取消
            </button>
            <button onClick={handleSubmit} className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600">
              确认
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 编辑小组表单
  const EditGroupForm = () => {
    const [name, setName] = useState(editGroup?.name || '')
    const [color, setColor] = useState(editGroup?.color || 'bg-blue-500')

    const handleSubmit = async () => {
      if (!editGroup) return
      await groupApi.updateGroup(editGroup.id, { name: name.trim(), color })
      setEditGroup(null)
      await loadData()
    }

    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
          <h3 className="text-lg font-semibold mb-4">编辑小组</h3>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
            autoFocus
          />
          <div className="mb-4">
            <p className="text-sm text-gray-500 mb-2">选择颜色</p>
            <div className="flex gap-2">
              {colorOptions.map(c => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`w-8 h-8 rounded-full ${c.value} ${
                    color === c.value ? 'ring-2 ring-offset-2 ' + c.ring : ''
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditGroup(null)} className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50">
              取消
            </button>
            <button onClick={handleSubmit} className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600">
              保存
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 积分操作弹窗
  const ScoreDialog = () => {
    if (!scoreDialog) return null
    const isPositive = scoreDialog.delta > 0

    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
          <h3 className="text-lg font-semibold mb-4">
            {isPositive ? '加分' : '减分'} - {groups.find(g => g.id === scoreDialog.groupId)?.name}
          </h3>
          <div className="text-center text-3xl font-bold mb-4">
            <span className={isPositive ? 'text-green-500' : 'text-red-500'}>
              {isPositive ? '+' : ''}{scoreDialog.delta}
            </span>
          </div>
          <input
            type="text"
            placeholder="请输入原因..."
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && reason.trim()) {
                isPositive ? handleAddScore(scoreDialog.groupId) : handleSubScore(scoreDialog.groupId)
              }
            }}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setScoreDialog(null); setReason('') }}
              className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={() => isPositive ? handleAddScore(scoreDialog.groupId) : handleSubScore(scoreDialog.groupId)}
              disabled={!reason.trim()}
              className={`px-4 py-2 text-white rounded-lg ${
                isPositive ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
              } disabled:opacity-50`}
            >
              确认
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">加载中...</div>
      </div>
    )
  }

  // 按学习积分排名
  const rankedGroups = [...groups].sort((a, b) => b.study_score - a.study_score)

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-6">
        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">小组积分管理</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
            >
              <History size={18} />
              操作历史
            </button>
            <button
              onClick={() => setShowAddGroup(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            >
              <Plus size={18} />
              添加小组
            </button>
          </div>
        </div>

        {/* 排名榜 */}
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <TrendingUp size={18} className="text-primary-500" />
            学习积分排名
          </h2>
          <div className="flex items-end gap-3 h-32">
            {rankedGroups.slice(0, 8).map((group, i) => (
              <div key={group.id} className="flex-1 flex flex-col items-center">
                <div className="text-sm font-bold mb-1">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </div>
                <div
                  className={`w-full rounded-t-md ${group.color} transition-all duration-500`}
                  style={{
                    height: `${Math.max(12, (group.study_score / Math.max(1, rankedGroups[0]?.study_score || 1)) * 80)}px`,
                    opacity: 0.3 + (i < 3 ? 0.7 : 0.3 - i * 0.08),
                  }}
                />
                <div className="text-xs mt-1 text-center font-medium truncate w-full">{group.name}</div>
                <div className="text-xs text-gray-500">{group.study_score}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 小组卡片列表 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {groups.map(group => {
            const groupStudents = students.filter(s => s.group_id === group.id)
            return (
              <div key={group.id} className="bg-white rounded-xl shadow-sm border hover:shadow-md transition-shadow">
                {/* 卡片头部 */}
                <div className={`${group.color} text-white rounded-t-xl p-4`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg">{group.name}</h3>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditGroup(group)}
                        className="p-1 rounded hover:bg-white/20 transition-colors"
                        title="编辑"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(group)}
                        className="p-1 rounded hover:bg-white/20 transition-colors"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between mt-2 text-white/90">
                    <div>
                      <div className="text-xs">学习积分</div>
                      <div className="text-xl font-bold">{group.study_score}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs">总积分</div>
                      <div className="text-xl font-bold">{group.total_score}</div>
                    </div>
                  </div>
                  {group.snapshot_diff !== 0 && (
                    <div className="mt-2 text-xs bg-white/20 rounded px-2 py-1 text-center">
                      快照差异：<span className={group.snapshot_diff > 0 ? 'text-green-200' : 'text-red-200'}>
                        {group.snapshot_diff > 0 ? '+' : ''}{group.snapshot_diff}
                      </span>
                    </div>
                  )}
                </div>

                {/* 快捷操作 */}
                <div className="p-3">
                  <div className="flex gap-1 mb-3">
                    {[1, 2, 3, 5, 10].map(n => (
                      <button
                        key={n}
                        onClick={() => setScoreDialog({ groupId: group.id, delta: n })}
                        className="flex-1 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors"
                      >
                        +{n}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 mb-3">
                    {[1, 2, 3, 5, 10].map(n => (
                      <button
                        key={n}
                        onClick={() => setScoreDialog({ groupId: group.id, delta: -n })}
                        className="flex-1 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                      >
                        -{n}
                      </button>
                    ))}
                  </div>

                  {/* 算分按钮 */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRefreshSnapshot(group.id)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-500 border rounded hover:bg-gray-50 transition-colors"
                    >
                      <RotateCcw size={12} />
                      刷新快照
                    </button>
                    {group.snapshot_diff !== 0 && (
                      <button
                        onClick={() => handleSnapshotCalc(group.id)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-primary-50 text-primary-600 border border-primary-200 rounded hover:bg-primary-100 transition-colors"
                      >
                        <Calculator size={12} />
                        一键算分
                      </button>
                    )}
                  </div>

                  {/* 学生列表 */}
                  {groupStudents.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-gray-400 mb-1">
                        成员 ({groupStudents.length}人)
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {groupStudents.map(s => (
                          <span key={s.id} className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {groups.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-400">
              <p className="text-4xl mb-2">📭</p>
              <p>还没有小组，点击"添加小组"开始</p>
            </div>
          )}
        </div>
      </div>

      {/* 操作历史弹窗 */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[480px] max-h-[70vh] shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">操作历史（最近30条）</h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto space-y-2">
              {history.length === 0 ? (
                <p className="text-center text-gray-400 py-8">暂无操作记录</p>
              ) : (
                history.map(h => (
                  <div key={h.id} className="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
                    <div>
                      <span className="font-medium">{h.group_name}</span>
                      <span className="text-gray-400 ml-2">{h.reason}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${h.delta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {h.delta >= 0 ? '+' : ''}{h.delta}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(h.created_at).toLocaleString('zh-CN')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <button
              onClick={() => { setShowHistory(false); loadHistory() }}
              className="mt-4 w-full py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {showAddGroup && <AddGroupForm />}
      {editGroup && <EditGroupForm />}
      <ScoreDialog />
    </div>
  )
}
