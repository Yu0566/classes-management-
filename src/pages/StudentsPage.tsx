import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Search, MoveRight, Users, Building2, ArrowLeftRight, RefreshCw, Upload } from 'lucide-react'
import * as studentApi from '@/lib/students'
import * as groupApi from '@/lib/groups'
import type { StudentWithGroup, Group } from '@/types'

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

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentWithGroup[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'students' | 'groups'>('students')

  // 添加学生弹窗
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addGroupId, setAddGroupId] = useState('')

  // 编辑学生弹窗
  const [editStudent, setEditStudent] = useState<StudentWithGroup | null>(null)
  const [editName, setEditName] = useState('')
  const [editPracticeLabel, setEditPracticeLabel] = useState('')
  const [editLunchLabel, setEditLunchLabel] = useState('')
  const [editLunchLongterm, setEditLunchLongterm] = useState(false)

  // 批量添加
  const [showBatchAdd, setShowBatchAdd] = useState(false)
  const [batchNames, setBatchNames] = useState('')
  const [batchGroupId, setBatchGroupId] = useState('')

  // 换组
  const [moveStudent, setMoveStudent] = useState<StudentWithGroup | null>(null)
  const [moveGroupId, setMoveGroupId] = useState('')

  // 小组管理
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [addGroupName, setAddGroupName] = useState('')
  const [addGroupColor, setAddGroupColor] = useState('bg-blue-500')
  const [editGroup, setEditGroup] = useState<Group | null>(null)
  const [editGroupName, setEditGroupName] = useState('')
  const [editGroupColor, setEditGroupColor] = useState('bg-blue-500')
  const [editGroupLeader, setEditGroupLeader] = useState('')

  // 换组（交换学生）
  const [swapSource, setSwapSource] = useState<Group | null>(null)
  const [swapTargetId, setSwapTargetId] = useState('')

  // 批量导入午餐午休名单
  const [showLunchImport, setShowLunchImport] = useState(false)
  const [lunchImportText, setLunchImportText] = useState('')
  const [lunchImportResult, setLunchImportResult] = useState<{ matched: string[]; unmatched: string[] } | null>(null)

  const loadData = useCallback(async () => {
    const [s, g] = await Promise.all([
      studentApi.getAllStudents(),
      groupApi.getAllGroups(),
    ])
    setStudents(s)
    setGroups(g)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const filteredStudents = search.trim()
    ? students.filter(s =>
        s.name.includes(search.trim()) ||
        s.group_name?.includes(search.trim())
      )
    : students

  // 添加学生
  const handleAdd = async () => {
    if (!addName.trim()) return
    await studentApi.createStudent({ name: addName.trim(), groupId: addGroupId })
    setShowAdd(false)
    setAddName('')
    setAddGroupId('')
    await loadData()
  }

  // 批量添加
  const handleBatchAdd = async () => {
    const names = batchNames.split(/[\n,，]+/).filter(n => n.trim())
    if (names.length === 0) return
    const count = await studentApi.batchCreateStudents(names, batchGroupId)
    alert(`成功添加 ${count} 名学生`)
    setShowBatchAdd(false)
    setBatchNames('')
    setBatchGroupId('')
    await loadData()
  }

  // 批量导入午餐午休名单
  const handleLunchImport = async () => {
    const names = lunchImportText.split(/[\n,，]+/).filter(n => n.trim())
    if (names.length === 0) {
      alert('请粘贴学生姓名')
      return
    }
    try {
      const result = await studentApi.batchSetLunchLabel(names)
      setLunchImportResult(result)
      if (result.matched.length > 0) {
        await loadData()
      }
    } catch (err) {
      console.error('[handleLunchImport]', err)
      alert(`导入失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // 编辑学生
  const handleEdit = async () => {
    if (!editStudent || !editName.trim()) return
    await studentApi.updateStudent(editStudent.id, {
      name: editName.trim(),
      practice_label: editPracticeLabel,
      lunch_label: editLunchLabel,
      lunch_longterm: editLunchLongterm ? 1 : 0,
    })
    setEditStudent(null)
    setEditName('')
    setEditPracticeLabel('')
    setEditLunchLabel('')
    setEditLunchLongterm(false)
    await loadData()
  }

  // 删除学生
  const handleDelete = async (student: StudentWithGroup) => {
    if (!window.confirm(`确认删除学生"${student.name}"？\n这将同时删除该学生的所有相关数据。`)) return
    // 关闭可能打开的相关弹窗
    if (editStudent?.id === student.id) {
      setEditStudent(null)
      setEditName('')
      setEditPracticeLabel('')
      setEditLunchLabel('')
      setEditLunchLongterm(false)
    }
    if (moveStudent?.id === student.id) {
      setMoveStudent(null)
    }
    await studentApi.deleteStudent(student.id)
    await loadData()
  }

  // 换组
  const handleMove = async () => {
    if (!moveStudent) return
    await groupApi.moveStudent(moveStudent.id, moveGroupId)
    setMoveStudent(null)
    setMoveGroupId('')
    await loadData()
  }

  // 添加小组
  const handleAddGroup = async () => {
    if (!addGroupName.trim()) return
    await groupApi.createGroup({ name: addGroupName.trim(), color: addGroupColor })
    setShowAddGroup(false)
    setAddGroupName('')
    setAddGroupColor('bg-blue-500')
    await loadData()
  }

  // 编辑小组
  const handleEditGroup = async () => {
    if (!editGroup || !editGroupName.trim()) return
    await groupApi.updateGroup(editGroup.id, { name: editGroupName.trim(), color: editGroupColor, leader_name: editGroupLeader } as any)
    setEditGroup(null)
    await loadData()
  }

  // 删除小组
  const handleDeleteGroup = async (group: Group) => {
    const studentsInGroup = students.filter(s => s.group_id === group.id)
    if (studentsInGroup.length > 0) {
      if (!window.confirm(`小组"${group.name}"${group.leader_name ? `（${group.leader_name}）` : ''}中有 ${studentsInGroup.length} 名学生，删除后这些学生将变为未分组。确认删除？`)) return
    } else {
      if (!window.confirm(`确认删除小组"${group.name}"${group.leader_name ? `（${group.leader_name}）` : ''}？`)) return
    }
    await groupApi.deleteGroup(group.id)
    await loadData()
  }

  // 交换两组学生
  const handleSwap = async () => {
    if (!swapSource || !swapTargetId) return
    const target = groups.find(g => g.id === swapTargetId)
    if (!target) return
    if (!window.confirm(`确认交换"${swapSource.name}${swapSource.leader_name ? `（${swapSource.leader_name}）` : ''}"和"${target.name}${target.leader_name ? `（${target.leader_name}）` : ''}"的全部学生？`)) return
    await groupApi.swapGroupStudents(swapSource.id, swapTargetId)
    setSwapSource(null)
    setSwapTargetId('')
    await loadData()
  }

  // 一键轮换
  const handleRotate = async () => {
    if (groups.length < 2) return
    const order = groups.map(g => `${g.name}${g.leader_name ? `（${g.leader_name}）` : ''}`).join(' → ')
    const first = groups[0].name
    const last = groups[groups.length - 1].name
    if (!window.confirm(`各组学生将按顺序移动到下一组：\n${order}\n其中"${last}"的学生将移动到"${first}"。\n确认执行？`)) return
    await groupApi.rotateGroupStudents()
    await loadData()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
  }

  const groupCount = groups.length
  const studentsInGroups = students.filter(s => s.group_id).length

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* 顶部 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">学生管理</h1>
            <p className="text-sm text-gray-500 mt-1">
              {groupCount} 个小组 · {students.length} 名学生 · {studentsInGroups} 名已分组
            </p>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 w-fit">
          <button
            onClick={() => setTab('students')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'students' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            学生列表
          </button>
          <button
            onClick={() => setTab('groups')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'groups' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            小组管理
          </button>
        </div>

        {/* ========== 学生列表 Tab ========== */}
        {tab === 'students' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowBatchAdd(true)
                  setBatchGroupId(groups[0]?.id || '')
                }}
                className="flex items-center gap-2 px-4 py-2 border text-gray-600 rounded-lg hover:bg-gray-50"
              >
                <Users size={18} /> 批量添加
              </button>
              <button
                onClick={() => {
                  setShowAdd(true)
                  setAddName('')
                  setAddGroupId(groups[0]?.id || '')
                }}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
              >
                <Plus size={18} /> 添加学生
              </button>
              <button
                onClick={() => { setShowLunchImport(true); setLunchImportText(''); setLunchImportResult(null) }}
                className="flex items-center gap-2 px-4 py-2 border border-green-200 text-green-600 rounded-lg hover:bg-green-50"
              >
                <Upload size={18} /> 午餐午休导入
              </button>
            </div>
            {/* 搜索 */}
            <div className="relative w-64">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="搜索学生姓名或小组..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>
          </div>

          {/* 学生列表 */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">姓名</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">所属小组</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">每日一练</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">午餐午休</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStudents.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white ${
                        groups.find(g => g.id === s.group_id)?.color || 'bg-gray-400'
                      }`}>
                        {(() => { const grp = groups.find(g => g.id === s.group_id); return grp ? `${grp.name}${grp.leader_name ? `（${grp.leader_name}）` : ''}` : (s.group_name || '未分组'); })()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {s.practice_label === 'qiangji' ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">强基</span>
                      ) : s.practice_label === 'tisheng' ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">提升</span>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.lunch_label ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">在校就餐</span>
                          {(s as any).lunch_longterm === 1 && (
                            <span className="text-xs px-1 py-0.5 rounded bg-amber-100 text-amber-700">长期请假</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditStudent(s)
                            setEditName(s.name)
                            setEditPracticeLabel(s.practice_label || '')
                            setEditLunchLabel(s.lunch_label || '')
                            setEditLunchLongterm((s as any).lunch_longterm === 1)
                          }}
                          className="p-1.5 text-gray-400 hover:text-primary-500 rounded hover:bg-gray-100"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => {
                            setMoveStudent(s)
                            setMoveGroupId(groups[0]?.id || '')
                          }}
                          className="p-1.5 text-gray-400 hover:text-blue-500 rounded hover:bg-gray-100"
                          title="换组"
                        >
                          <MoveRight size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(s)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-400">
                      {search ? '没有匹配的学生' : '还没有学生，点击"添加学生"开始'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-2">共 {filteredStudents.length} 名学生</p>
        </>
        )}

        {/* ========== 小组管理 Tab ========== */}
        {tab === 'groups' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">共 {groups.length} 个小组</p>
            <div className="flex gap-2">
              <button
                onClick={handleRotate}
                className="flex items-center gap-2 px-4 py-2 border border-orange-200 text-orange-600 rounded-lg hover:bg-orange-50"
                title="每组学生移动到下一组"
              >
                <RefreshCw size={18} /> 一键轮换
              </button>
              <button
                onClick={() => {
                  setShowAddGroup(true)
                  setAddGroupName('')
                  setAddGroupColor('bg-blue-500')
                }}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
              >
                <Plus size={18} /> 添加小组
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {groups.map(group => (
              <div key={group.id} className="bg-white rounded-xl shadow-sm border hover:shadow-md transition-shadow">
                <div className={`${group.color} text-white rounded-t-xl p-4`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-lg">{group.name}</h3>
                      {group.leader_name && (
                        <p className="text-xs text-white/70">组长：{group.leader_name}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setSwapSource(group)
                          setSwapTargetId('')
                        }}
                        className="p-1 rounded hover:bg-white/20 transition-colors"
                        title="交换学生"
                      >
                        <ArrowLeftRight size={14} />
                      </button>
                      <button
                        onClick={() => {
                          setEditGroup(group)
                          setEditGroupName(group.name)
                          setEditGroupColor(group.color)
                          setEditGroupLeader(group.leader_name || '')
                        }}
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
                  <div className="text-center mt-3">
                    <Building2 size={32} className="mx-auto mb-1 opacity-80" />
                    <div className="text-sm text-white/80">
                      {students.filter(s => s.group_id === group.id).length} 名成员
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">学习积分</span>
                    <span className="font-bold">{group.study_score}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-400">总积分</span>
                    <span className="font-bold">{group.total_score}</span>
                  </div>
                </div>
              </div>
            ))}

            {groups.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-400">
                <Building2 size={48} className="mx-auto mb-2 opacity-30" />
                <p>还没有小组，点击"添加小组"开始</p>
              </div>
            )}
          </div>
        </>
        )}
      </div>

      {/* 批量添加弹窗 */}
      {showBatchAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[480px] shadow-xl">
            <h3 className="text-lg font-semibold mb-4">批量添加学生</h3>
            <textarea
              placeholder="粘贴学生姓名，每行一个，或逗号分隔&#10;例如：&#10;张三&#10;李四&#10;王五"
              value={batchNames}
              onChange={e => setBatchNames(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400 h-32 resize-none"
              autoFocus
            />
            {batchNames.trim() && (
              <p className="text-xs text-gray-400 mb-3">
                识别到 {batchNames.split(/[\n,，]+/).filter(n => n.trim()).length} 名学生
              </p>
            )}
            <select
              value={batchGroupId}
              onChange={e => setBatchGroupId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <option value="">未分组</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}{g.leader_name ? `（${g.leader_name}）` : ''}</option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowBatchAdd(false); setBatchNames('') }}
                className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleBatchAdd}
                disabled={!batchNames.trim()}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 添加学生弹窗 */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">添加学生</h3>
            <input
              type="text"
              placeholder="学生姓名"
              value={addName}
              onChange={e => setAddName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && addName.trim() && handleAdd()}
            />
            <select
              value={addGroupId}
              onChange={e => setAddGroupId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <option value="">未分组</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}{g.leader_name ? `（${g.leader_name}）` : ''}</option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowAdd(false); setAddName('') }}
                className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleAdd}
                disabled={!addName.trim()}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑学生弹窗 */}
      {editStudent && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">编辑学生</h3>
            <input
              type="text"
              placeholder="学生姓名"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && editName.trim() && handleEdit()}
            />
            <div className="mb-3">
              <label className="text-sm text-gray-500 block mb-1">每日一练标签</label>
              <select
                value={editPracticeLabel}
                onChange={e => setEditPracticeLabel(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                <option value="">不参与每日一练</option>
                <option value="qiangji">强基</option>
                <option value="tisheng">提升</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="text-sm text-gray-500 block mb-1">午餐午休标签</label>
              <select
                value={editLunchLabel}
                onChange={e => setEditLunchLabel(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                <option value="">不参与午餐午休</option>
                <option value="zaixiao">在校就餐</option>
              </select>
            </div>
            {editLunchLabel === 'zaixiao' && (
              <div className="mb-3 flex items-center gap-2">
                <label className="text-sm text-gray-500">长期请假</label>
                <button
                  type="button"
                  onClick={() => setEditLunchLongterm(!editLunchLongterm)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    editLunchLongterm ? 'bg-amber-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    editLunchLongterm ? 'translate-x-4' : 'translate-x-1'
                  }`} />
                </button>
                <span className="text-xs text-gray-400">{editLunchLongterm ? '每天自动请假' : '每日手动考勤'}</span>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setEditStudent(null); setEditName(''); setEditPracticeLabel(''); setEditLunchLabel(''); setEditLunchLongterm(false) }}
                className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleEdit}
                disabled={!editName.trim()}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 换组弹窗 */}
      {moveStudent && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">
              移动 "{moveStudent.name}" 到其他小组
            </h3>
            <p className="text-sm text-gray-500 mb-3">
              当前小组：{(() => { const grp = groups.find(g => g.id === moveStudent.group_id); return grp ? `${grp.name}${grp.leader_name ? `（${grp.leader_name}）` : ''}` : (moveStudent.group_name || '未分组'); })()}
            </p>
            <select
              value={moveGroupId}
              onChange={e => setMoveGroupId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <option value="">未分组</option>
              {groups.filter(g => g.id !== moveStudent.group_id).map(g => (
                <option key={g.id} value={g.id}>{g.name}{g.leader_name ? `（${g.leader_name}）` : ''}</option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setMoveStudent(null)}
                className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleMove}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
              >
                确认移动
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 添加小组弹窗 */}
      {showAddGroup && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">添加小组</h3>
            <input
              type="text"
              placeholder="小组名称"
              value={addGroupName}
              onChange={e => setAddGroupName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && addGroupName.trim() && handleAddGroup()}
            />
            <div className="mb-4">
              <p className="text-sm text-gray-500 mb-2">选择颜色</p>
              <div className="flex gap-2">
                {colorOptions.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setAddGroupColor(c.value)}
                    className={`w-8 h-8 rounded-full ${c.value} ${
                      addGroupColor === c.value ? 'ring-2 ring-offset-2 ' + c.ring : ''
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddGroup(false)} className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleAddGroup} disabled={!addGroupName.trim()} className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50">确认</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑小组弹窗 */}
      {editGroup && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">编辑小组</h3>
            <input
              type="text"
              value={editGroupName}
              onChange={e => setEditGroupName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && editGroupName.trim() && handleEditGroup()}
            />
            <div className="mb-3">
              <p className="text-sm text-gray-500 mb-2">选择组长</p>
              <select
                value={editGroupLeader}
                onChange={e => setEditGroupLeader(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                <option value="">未指定</option>
                {students.filter(s => s.group_id === editGroup?.id).map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-500 mb-2">选择颜色</p>
              <div className="flex gap-2">
                {colorOptions.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setEditGroupColor(c.value)}
                    className={`w-8 h-8 rounded-full ${c.value} ${
                      editGroupColor === c.value ? 'ring-2 ring-offset-2 ' + c.ring : ''
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditGroup(null)} className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleEditGroup} disabled={!editGroupName.trim()} className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 交换学生弹窗 */}
      {swapSource && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">交换学生</h3>
            <p className="text-sm text-gray-500 mb-3">
              将 <span className="font-medium text-gray-800">"{swapSource.name}{swapSource.leader_name ? `（${swapSource.leader_name}）` : ''}"</span> 的全部学生与目标小组交换
            </p>
            <select
              value={swapTargetId}
              onChange={e => setSwapTargetId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <option value="">请选择目标小组...</option>
              {groups.filter(g => g.id !== swapSource.id).map(g => (
                <option key={g.id} value={g.id}>
                  {g.name}{g.leader_name ? `（${g.leader_name}）` : ''} — {students.filter(s => s.group_id === g.id).length}人
                </option>
              ))}
            </select>
            {swapTargetId && (
              <p className="text-xs text-gray-400 mb-3">
                "{swapSource.name}{swapSource.leader_name ? `（${swapSource.leader_name}）` : ''}"（{students.filter(s => s.group_id === swapSource.id).length}人）
                ↔
                "{(() => { const tg = groups.find(g => g.id === swapTargetId); return tg ? `${tg.name}${tg.leader_name ? `（${tg.leader_name}）` : ''}` : ''; })()}"（{students.filter(s => s.group_id === swapTargetId).length}人）
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setSwapSource(null); setSwapTargetId('') }} className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleSwap} disabled={!swapTargetId} className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">确认交换</button>
            </div>
          </div>
        </div>
      )}

      {/* 批量导入午餐午休名单弹窗 */}
      {showLunchImport && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[480px] shadow-xl">
            <h3 className="text-lg font-semibold mb-2">批量导入午餐午休名单</h3>
            <p className="text-xs text-gray-500 mb-4">
              粘贴学生姓名，每行一个，或用逗号分隔。系统会自动匹配已有学生并设为"在校就餐"。
            </p>
            <textarea
              placeholder={"张三\n李四\n王五"}
              value={lunchImportText}
              onChange={e => { setLunchImportText(e.target.value); setLunchImportResult(null) }}
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400 h-32 resize-none"
              autoFocus
            />
            {lunchImportText.trim() && (
              <p className="text-xs text-gray-400 mb-3">
                识别到 {lunchImportText.split(/[\n,，]+/).filter(n => n.trim()).length} 个姓名
              </p>
            )}

            {lunchImportResult && (
              <div className="mb-3 text-xs">
                {lunchImportResult.matched.length > 0 && (
                  <p className="text-green-600">已匹配 {lunchImportResult.matched.length} 人：{lunchImportResult.matched.join('、')}</p>
                )}
                {lunchImportResult.unmatched.length > 0 && (
                  <p className="text-red-500 mt-1">未匹配 {lunchImportResult.unmatched.length} 人：{lunchImportResult.unmatched.join('、')}</p>
                )}
                {lunchImportResult.unmatched.length === 0 && lunchImportResult.matched.length > 0 && (
                  <p className="text-green-600 mt-1">全部匹配成功！</p>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowLunchImport(false); setLunchImportText(''); setLunchImportResult(null) }}
                className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50 text-sm"
              >
                关闭
              </button>
              <button
                onClick={handleLunchImport}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm"
              >
                确认导入
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
