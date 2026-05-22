import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Search, MoveRight } from 'lucide-react'
import * as studentApi from '@/lib/students'
import * as groupApi from '@/lib/groups'
import type { StudentWithGroup, Group } from '@/types'

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentWithGroup[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editStudent, setEditStudent] = useState<StudentWithGroup | null>(null)
  const [moveStudent, setMoveStudent] = useState<StudentWithGroup | null>(null)
  const [formName, setFormName] = useState('')
  const [formGroupId, setFormGroupId] = useState('')

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
    if (!formName.trim()) return
    await studentApi.createStudent({ name: formName.trim(), groupId: formGroupId })
    setShowAdd(false)
    setFormName('')
    setFormGroupId('')
    await loadData()
  }

  // 编辑学生
  const handleEdit = async () => {
    if (!editStudent || !formName.trim()) return
    await studentApi.updateStudent(editStudent.id, { name: formName.trim() })
    setEditStudent(null)
    setFormName('')
    await loadData()
  }

  // 删除学生
  const handleDelete = async (student: StudentWithGroup) => {
    if (!window.confirm(`确认删除学生"${student.name}"？\n这将同时删除该学生的所有相关数据。`)) return
    await studentApi.deleteStudent(student.id)
    await loadData()
  }

  // 换组
  const handleMove = async () => {
    if (!moveStudent) return
    await groupApi.moveStudent(moveStudent.id, formGroupId)
    setMoveStudent(null)
    setFormGroupId('')
    await loadData()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* 顶部 */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">学生管理</h1>
          <button
            onClick={() => { setShowAdd(true); setFormGroupId(groups[0]?.id || '') }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
          >
            <Plus size={18} /> 添加学生
          </button>
        </div>

        {/* 搜索 */}
        <div className="relative mb-4">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索学生姓名或小组..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </div>

        {/* 学生列表 */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">姓名</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">所属小组</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">手动偏移</th>
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
                      {s.group_name || '未分组'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={s.manual_offset !== 0 ? 'text-red-500 font-medium' : 'text-gray-400'}>
                      {s.manual_offset}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditStudent(s)
                          setFormName(s.name)
                        }}
                        className="p-1.5 text-gray-400 hover:text-primary-500 rounded hover:bg-gray-100"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => {
                          setMoveStudent(s)
                          setFormGroupId(groups[0]?.id || '')
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
                  <td colSpan={4} className="text-center py-12 text-gray-400">
                    {search ? '没有匹配的学生' : '还没有学生，点击"添加学生"开始'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 mt-2">共 {filteredStudents.length} 名学生</p>
      </div>

      {/* 添加/编辑弹窗 */}
      {(showAdd || editStudent) && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">
              {showAdd ? '添加学生' : '编辑学生'}
            </h3>
            <input
              type="text"
              placeholder="学生姓名"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && (showAdd ? handleAdd() : handleEdit())}
            />
            {showAdd && (
              <select
                value={formGroupId}
                onChange={e => setFormGroupId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                <option value="">未分组</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowAdd(false); setEditStudent(null); setFormName('') }}
                className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={() => showAdd ? handleAdd() : handleEdit()}
                disabled={!formName.trim()}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                确认
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
              当前小组：{moveStudent.group_name || '未分组'}
            </p>
            <select
              value={formGroupId}
              onChange={e => setFormGroupId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              <option value="">未分组</option>
              {groups.filter(g => g.id !== moveStudent.group_id).map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
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
    </div>
  )
}
