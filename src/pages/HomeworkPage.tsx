import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, ClipboardList, CheckCircle, XCircle, AlertCircle, BarChart3 } from 'lucide-react'
import * as homeworkApi from '@/lib/homework'
import * as studentApi from '@/lib/students'
import type { Homework, StudentWithGroup } from '@/types'

const STATUS_OPTIONS = [
  { value: 'complete', label: '已交齐', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  { value: 'incomplete', label: '未交齐', color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle },
  { value: 'not_submitted', label: '未交', color: 'bg-red-100 text-red-700', icon: XCircle },
] as const

type StatusValue = typeof STATUS_OPTIONS[number]['value']

export default function HomeworkPage() {
  const [homeworkList, setHomeworkList] = useState<Homework[]>([])
  const [students, setStudents] = useState<StudentWithGroup[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)

  // 表单状态
  const [showForm, setShowForm] = useState(false)
  const [editHw, setEditHw] = useState<Homework | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formDueDate, setFormDueDate] = useState('')

  const loadHomework = useCallback(async () => {
    const list = await homeworkApi.getAllHomework()
    setHomeworkList(list)
    setLoading(false)
  }, [])

  const loadStudents = useCallback(async () => {
    const s = await studentApi.getAllStudents()
    setStudents(s)
  }, [])

  const loadSubmissions = useCallback(async (hwId: string) => {
    const details = await homeworkApi.getSubmissionDetails(hwId)
    const map = new Map<string, string>()
    details.forEach(d => { if (d.id) map.set(d.studentId, d.status) })
    setSubmissions(map)
  }, [])

  useEffect(() => { loadHomework(); loadStudents() }, [loadHomework, loadStudents])
  useEffect(() => {
    if (selectedId) loadSubmissions(selectedId)
  }, [selectedId, loadSubmissions])

  const selectedHw = homeworkList.find(h => h.id === selectedId)
  const stats = homeworkApi.getHomeworkStats // reference the function for inline calc

  // 创建/编辑作业
  const handleSaveHomework = async () => {
    if (!formTitle.trim()) return
    if (editHw) {
      await homeworkApi.updateHomework(editHw.id, {
        title: formTitle.trim(),
        description: formDesc.trim(),
        dueDate: formDueDate,
      })
    } else {
      const today = new Date().toISOString().slice(0, 10)
      await homeworkApi.createHomework({
        title: formTitle.trim(),
        description: formDesc.trim(),
        assignDate: today,
        dueDate: formDueDate,
      })
    }
    setShowForm(false)
    setEditHw(null)
    setFormTitle('')
    setFormDesc('')
    setFormDueDate('')
    await loadHomework()
  }

  // 删除作业
  const handleDelete = async (hw: Homework) => {
    if (!window.confirm(`确认删除作业"${hw.title}"？`)) return
    await homeworkApi.deleteHomework(hw.id)
    if (selectedId === hw.id) setSelectedId(null)
    await loadHomework()
  }

  // 切换提交状态
  const handleCycleStatus = async (studentId: string) => {
    const current = submissions.get(studentId) || 'not_submitted'
    const idx = STATUS_OPTIONS.findIndex(o => o.value === current)
    const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length].value
    if (!selectedId) return
    await homeworkApi.setSubmission(selectedId, studentId, next)
    setSubmissions(prev => {
      const nextMap = new Map(prev)
      nextMap.set(studentId, next)
      return nextMap
    })
  }

  // 批量设置
  const handleBatchSet = async (status: StatusValue) => {
    if (!selectedId) return
    const studentIds = students.map(s => s.id)
    await homeworkApi.batchSetSubmission(selectedId, studentIds, status)
    await loadSubmissions(selectedId)
  }

  // 统计
  const calcStats = () => {
    let complete = 0, incomplete = 0, notSubmitted = 0, total = 0
    for (const [, v] of submissions) {
      total++
      if (v === 'complete') complete++
      else if (v === 'incomplete') incomplete++
      else notSubmitted++
    }
    // 未出现在 submissions 中的学生也算未交
    const unsubmittedCount = students.length - total
    notSubmitted += unsubmittedCount
    total += unsubmittedCount
    return { total, complete, incomplete, notSubmitted }
  }

  const { total, complete, incomplete, notSubmitted } = calcStats()
  const completionRate = total > 0 ? Math.round((complete / total) * 100) : 0

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">作业管理</h1>
          <button
            onClick={() => { setShowForm(true); setEditHw(null) }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
          >
            <Plus size={18} /> 发布作业
          </button>
        </div>

        <div className="flex gap-6">
          {/* 左侧：作业列表 */}
          <div className="w-72 shrink-0">
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50">
                <h2 className="font-medium text-gray-700 flex items-center gap-2">
                  <ClipboardList size={18} /> 作业列表
                </h2>
              </div>
              <div className="divide-y divide-gray-100 max-h-[500px] overflow-auto">
                {homeworkList.map(hw => (
                  <button
                    key={hw.id}
                    onClick={() => setSelectedId(hw.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                      selectedId === hw.id ? 'bg-primary-50 border-l-2 border-primary-500' : ''
                    }`}
                  >
                    <div className="font-medium text-sm truncate">{hw.title}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {hw.due_date ? `截止 ${hw.due_date}` : '无截止日期'}
                    </div>
                  </button>
                ))}
                {homeworkList.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm">暂无作业</div>
                )}
              </div>
            </div>
          </div>

          {/* 右侧：提交详情 */}
          <div className="flex-1 min-w-0">
            {!selectedHw ? (
              <div className="bg-white rounded-xl shadow-sm border flex items-center justify-center h-64 text-gray-400">
                <div className="text-center">
                  <ClipboardList size={48} className="mx-auto mb-2 opacity-30" />
                  <p>选择左侧作业查看提交详情</p>
                </div>
              </div>
            ) : (
              <>
                {/* 作业信息 */}
                <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">{selectedHw.title}</h2>
                      {selectedHw.description && (
                        <p className="text-sm text-gray-500 mt-1">{selectedHw.description}</p>
                      )}
                      <div className="flex gap-4 mt-2 text-xs text-gray-400">
                        <span>布置：{selectedHw.assign_date}</span>
                        {selectedHw.due_date && <span>截止：{selectedHw.due_date}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditHw(selectedHw); setFormTitle(selectedHw.title); setFormDesc(selectedHw.description || ''); setFormDueDate(selectedHw.due_date || ''); setShowForm(true) }}
                        className="p-1.5 text-gray-400 hover:text-primary-500 rounded hover:bg-gray-100"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(selectedHw)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 统计卡片 */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  {[
                    { label: '完成率', value: `${completionRate}%`, color: 'text-green-600' },
                    { label: '已交齐', value: complete, color: 'text-green-600' },
                    { label: '未交齐', value: incomplete, color: 'text-yellow-600' },
                    { label: '未交', value: notSubmitted, color: 'text-red-600' },
                  ].map(item => (
                    <div key={item.label} className="bg-white rounded-lg border p-3 text-center">
                      <div className="text-xs text-gray-500">{item.label}</div>
                      <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
                    </div>
                  ))}
                </div>
                {/* 完成率进度条 */}
                <div className="bg-white rounded-lg border p-3 mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-500">完成进度 ({total}人)</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${completionRate}%` }} />
                  </div>
                </div>

                {/* 批量操作 */}
                <div className="flex gap-2 mb-4">
                  {STATUS_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => handleBatchSet(o.value)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${o.color} hover:opacity-80`}
                    >
                      全部设为"{o.label}"
                    </button>
                  ))}
                </div>

                {/* 学生提交表 */}
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">姓名</th>
                        <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">小组</th>
                        <th className="text-center px-4 py-2 text-sm font-medium text-gray-500">提交状态</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {students.map(s => {
                        const status = (submissions.get(s.id) || 'not_submitted') as StatusValue
                        const opt = STATUS_OPTIONS.find(o => o.value === status)!
                        const Icon = opt.icon
                        return (
                          <tr key={s.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium text-sm">{s.name}</td>
                            <td className="px-4 py-2 text-xs text-gray-500">{s.group_name || '-'}</td>
                            <td className="px-2 py-2 text-center">
                              <button
                                onClick={() => handleCycleStatus(s.id)}
                                className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full cursor-pointer transition-colors ${opt.color}`}
                              >
                                <Icon size={12} />
                                {opt.label}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                      {students.length === 0 && (
                        <tr>
                          <td colSpan={3} className="text-center py-8 text-gray-400 text-sm">
                            还没有学生，请先在学生管理中添加学生
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 作业表单弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[440px] shadow-xl">
            <h3 className="text-lg font-semibold mb-4">
              {editHw ? '编辑作业' : '发布作业'}
            </h3>
            <input
              type="text"
              placeholder="作业标题"
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
              autoFocus
            />
            <textarea
              placeholder="作业描述（可选）"
              value={formDesc}
              onChange={e => setFormDesc(e.target.value)}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
            />
            <div className="mb-3">
              <label className="text-sm text-gray-500 mb-1 block">截止日期</label>
              <input
                type="date"
                value={formDueDate}
                onChange={e => setFormDueDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowForm(false); setEditHw(null) }}
                className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSaveHomework}
                disabled={!formTitle.trim()}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                {editHw ? '保存' : '发布'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
