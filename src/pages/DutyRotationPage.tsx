import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Edit3, Camera, Shield, Users, Crown, CalendarDays } from 'lucide-react'
import Modal from '../components/ui/Modal'
import * as rosterApi from '../lib/duty-roster'
import { queryAll } from '../lib/db'
import type { DutyRosterEntry, DutyRole, Student } from '../types'
import { WEEKDAY_NAMES, DUTY_ROLE_LABELS } from '../types'

const ROLE_SORT: Record<DutyRole, number> = {
  monitor: 0,
  captain: 1,
  vice_captain: 2,
  duty_monitor: 3,
  rotation: 4,
}

export default function DutyRotationPage() {
  const [entries, setEntries] = useState<DutyRosterEntry[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<DutyRosterEntry | null>(null)
  const [formRole, setFormRole] = useState<DutyRole>('rotation')
  const [formStudentId, setFormStudentId] = useState('')
  const [formWeekday, setFormWeekday] = useState(1)
  const [formPosition, setFormPosition] = useState(1)
  const [formWeekdayGroup, setFormWeekdayGroup] = useState('mon_wed')
  const [formPhoto, setFormPhoto] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const data = await rosterApi.getAll()
    setEntries(data)
  }, [])

  const loadStudents = useCallback(async () => {
    try {
      const list = await queryAll<Student>('SELECT id, name FROM students ORDER BY name')
      setStudents(list)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load(); loadStudents() }, [load, loadStudents])

  const byRole = (role: DutyRole) =>
    entries.filter(e => e.role === role).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.student_name.localeCompare(b.student_name))

  const byWeekday = (wd: number) =>
    entries.filter(e => e.role === 'rotation' && e.weekday === wd).sort((a, b) => (a.position || 0) - (b.position || 0))

  const openAdd = (role: DutyRole, weekday?: number, position?: number, weekdayGroup?: string) => {
    setEditingEntry(null)
    setFormRole(role)
    setFormStudentId('')
    setFormWeekday(weekday ?? 1)
    setFormPosition(position ?? 1)
    setFormWeekdayGroup(weekdayGroup ?? 'mon_wed')
    setFormPhoto('')
    setModalOpen(true)
  }

  const openEdit = (entry: DutyRosterEntry) => {
    setEditingEntry(entry)
    setFormRole(entry.role)
    setFormStudentId(entry.student_id)
    setFormWeekday(entry.weekday ?? 1)
    setFormPosition(entry.position ?? 1)
    setFormWeekdayGroup(entry.weekday_group ?? 'mon_wed')
    setFormPhoto(entry.photo ?? '')
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!formStudentId) return
    const student = students.find(s => s.id === formStudentId)
    if (!student) return

    if (editingEntry) {
      await rosterApi.update(editingEntry.id, {
        student_id: formStudentId,
        student_name: student.name,
        weekday: formRole === 'rotation' ? formWeekday : null,
        position: formRole === 'rotation' ? formPosition : null,
        weekday_group: formRole === 'captain' || formRole === 'vice_captain' ? formWeekdayGroup : null,
        photo: formPhoto || null,
        sort_order: ROLE_SORT[formRole],
      })
    } else {
      await rosterApi.add({
        student_id: formStudentId,
        student_name: student.name,
        role: formRole,
        weekday: formRole === 'rotation' ? formWeekday : null,
        position: formRole === 'rotation' ? formPosition : null,
        weekday_group: formRole === 'captain' || formRole === 'vice_captain' ? formWeekdayGroup : null,
        photo: formPhoto || null,
        sort_order: ROLE_SORT[formRole],
      })
    }
    setModalOpen(false)
    load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该成员吗？')) return
    await rosterApi.remove(id)
    load()
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setFormPhoto(reader.result as string)
    reader.readAsDataURL(file)
  }

  const monitor = byRole('monitor')[0]
  const captains = byRole('captain')
  const viceCaptains = byRole('vice_captain')

  // 大照片卡片（竖排：照片在上，姓名在下）
  const PhotoCard = ({
    entry, roleLabel, size, icon, ringColor, bgGradient, onEdit, onDelete, onAdd, addLabel,
  }: {
    entry?: DutyRosterEntry
    roleLabel: string
    size: number
    icon: React.ReactNode
    ringColor: string
    bgGradient: string
    onEdit?: () => void
    onDelete?: () => void
    onAdd?: () => void
    addLabel?: string
  }) => (
    <div className="flex flex-col items-center gap-2 group">
      <div
        className={`relative rounded-2xl overflow-hidden bg-gradient-to-br ${bgGradient} p-0.5 shadow-lg`}
        style={{ width: size, height: size * 1.25 }}
      >
        <div className="w-full h-full rounded-2xl bg-stone-50 flex items-center justify-center overflow-hidden">
          {entry?.photo ? (
            <img src={entry.photo} alt={entry.student_name} className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-stone-300">
              {icon}
            </div>
          )}
        </div>
        {/* 操作按钮悬浮层 */}
        {entry && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-2xl flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100">
            <div className="flex gap-1">
              {onEdit && (
                <button onClick={onEdit} className="p-1.5 bg-white/90 rounded-lg text-amber-600 hover:bg-white shadow-sm transition-colors"><Edit3 size={14} /></button>
              )}
              {onDelete && (
                <button onClick={onDelete} className="p-1.5 bg-white/90 rounded-lg text-red-500 hover:bg-white shadow-sm transition-colors"><Trash2 size={14} /></button>
              )}
            </div>
          </div>
        )}
      </div>
      {entry ? (
        <>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ringColor}`}>{roleLabel}</span>
          <span className="text-sm font-bold text-stone-800">{entry.student_name}</span>
        </>
      ) : (
        onAdd && (
          <button onClick={onAdd} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors font-medium border border-dashed border-amber-200">
            <Plus size={14} /> {addLabel || '添加'}
          </button>
        )
      )}
    </div>
  )

  return (
    <div className="h-full overflow-auto bg-gradient-to-b from-slate-50 to-amber-50/20">
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <CalendarDays size={28} className="text-amber-600" />
          <h1 className="text-2xl font-bold text-stone-800">班级轮值管理</h1>
        </div>

        {/* ========== 第一层：班长 ========== */}
        <div className="flex justify-center mb-4">
          {monitor ? (
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                {/* 外层光晕 */}
                <div className="absolute -inset-3 rounded-[20px] bg-gradient-to-br from-amber-300/40 via-yellow-400/20 to-orange-400/30 blur-md animate-pulse" />
                {/* 主卡片 */}
                <div className="relative w-40 h-48 rounded-2xl p-[4px] shadow-2xl shadow-amber-300/40"
                  style={{
                    background: 'conic-gradient(from 0deg, #fbbf24, #f59e0b, #fcd34d, #f97316, #eab308, #fbbf24)',
                  }}
                >
                  {/* 内层金属边框 */}
                  <div className="w-full h-full rounded-[14px] p-[2px] bg-gradient-to-br from-amber-200 via-yellow-100 to-amber-300">
                    <div className="w-full h-full rounded-[12px] bg-stone-900 flex items-center justify-center overflow-hidden relative">
                      {monitor.photo ? (
                        <img src={monitor.photo} alt={monitor.student_name} className="w-full h-full object-cover" />
                      ) : (
                        <Shield size={52} className="text-amber-500/60" />
                      )}
                      {/* 内角装饰 */}
                      <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-amber-400/60 rounded-tl-md" />
                      <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-amber-400/60 rounded-tr-md" />
                      <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-amber-400/60 rounded-bl-md" />
                      <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-amber-400/60 rounded-br-md" />
                    </div>
                  </div>
                </div>
                {/* 皇冠 */}
                <div className="absolute -top-3 -right-3 w-10 h-10 bg-gradient-to-br from-amber-300 to-yellow-500 rounded-full flex items-center justify-center shadow-xl ring-4 ring-amber-100"
                  style={{ filter: 'drop-shadow(0 2px 8px rgba(251,191,36,0.6))' }}
                >
                  <Crown size={18} className="text-stone-800" />
                </div>
              </div>
              <span className="text-sm font-semibold text-amber-700 bg-gradient-to-r from-amber-100 to-yellow-100 px-4 py-1 rounded-full border border-amber-300/60 tracking-wide">班长</span>
              <span className="text-xl font-bold text-stone-800">{monitor.student_name}</span>
              <div className="flex gap-2">
                <button onClick={() => openEdit(monitor)} className="px-3 py-1.5 text-xs text-amber-600 hover:bg-amber-50 rounded-lg transition-colors border border-amber-200"><Edit3 size={14} className="inline mr-1" />修改</button>
                <button onClick={() => handleDelete(monitor.id)} className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-50 rounded-lg transition-colors border border-red-200"><Trash2 size={14} className="inline mr-1" />删除</button>
              </div>
            </div>
          ) : (
            <button onClick={() => openAdd('monitor')} className="flex flex-col items-center gap-3 px-8 py-6 border-2 border-dashed border-amber-300 rounded-2xl text-amber-400 hover:border-amber-400 hover:text-amber-500 transition-colors">
              <Shield size={40} />
              <span className="text-sm font-medium">指定班长</span>
            </button>
          )}
        </div>

        {/* 连接线 */}
        <div className="flex justify-center mb-4">
          <svg width="2" height="24" viewBox="0 0 2 24"><line x1="1" y1="0" x2="1" y2="24" stroke="#FCD34D" strokeWidth="2" /></svg>
        </div>

        {/* ========== 第二层：队长 & 副队长 ========== */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          <div className="flex flex-col items-center bg-white rounded-2xl border shadow-sm p-6">
            <h3 className="font-semibold text-stone-500 text-sm mb-5 bg-amber-50 rounded-lg py-1.5 px-6">周一至周三</h3>
            <PhotoCard
              entry={captains[0]}
              roleLabel="队长"
              size={120}
              icon={<Shield size={40} className="text-amber-300" />}
              ringColor="bg-amber-50 text-amber-600"
              bgGradient="from-amber-200 to-amber-400"
              onEdit={captains[0] ? () => openEdit(captains[0]) : undefined}
              onDelete={captains[0] ? () => handleDelete(captains[0].id) : undefined}
              onAdd={!captains[0] ? () => openAdd('captain', undefined, undefined, 'mon_wed') : undefined}
              addLabel="指定队长"
            />
          </div>
          <div className="flex flex-col items-center bg-white rounded-2xl border shadow-sm p-6">
            <h3 className="font-semibold text-stone-500 text-sm mb-5 bg-stone-50 rounded-lg py-1.5 px-6">周四至周五</h3>
            <PhotoCard
              entry={viceCaptains[0]}
              roleLabel="副队长"
              size={120}
              icon={<Users size={40} className="text-stone-300" />}
              ringColor="bg-stone-50 text-stone-600"
              bgGradient="from-gray-200 to-gray-400"
              onEdit={viceCaptains[0] ? () => openEdit(viceCaptains[0]) : undefined}
              onDelete={viceCaptains[0] ? () => handleDelete(viceCaptains[0].id) : undefined}
              onAdd={!viceCaptains[0] ? () => openAdd('vice_captain', undefined, undefined, 'thu_fri') : undefined}
              addLabel="指定副队长"
            />
          </div>
        </div>

        {/* 连接线 */}
        <div className="flex justify-center mb-4">
          <svg width="2" height="24" viewBox="0 0 2 24"><line x1="1" y1="0" x2="1" y2="24" stroke="#FCD34D" strokeWidth="2" /></svg>
        </div>

        {/* ========== 第三层：每日轮值 ========== */}
        <div className="bg-white rounded-2xl border shadow-sm p-6">
          <h3 className="font-semibold text-stone-500 text-sm mb-5 text-center">每日轮值</h3>
          <div className="grid grid-cols-5 gap-5">
            {[1, 2, 3, 4, 5].map(wd => {
              const dayStudents = byWeekday(wd)
              return (
                <div key={wd} className="flex flex-col items-center">
                  <p className="font-semibold text-stone-500 text-sm mb-4 bg-stone-50 rounded-lg py-1.5 w-full text-center">{WEEKDAY_NAMES[wd]}</p>
                  <div className="flex flex-col items-center gap-4 w-full">
                    {[1, 2].map(pos => {
                      const student = dayStudents.find(s => s.position === pos)
                      return student ? (
                        <PhotoCard
                          key={pos}
                          entry={student}
                          roleLabel="轮值"
                          size={88}
                          icon={<Users size={32} className="text-amber-200" />}
                          ringColor="bg-stone-50 text-stone-500"
                          bgGradient="from-slate-100 to-amber-200"
                          onEdit={() => openEdit(student)}
                          onDelete={() => handleDelete(student.id)}
                        />
                      ) : (
                        <button
                          key={pos}
                          onClick={() => openAdd('rotation', wd, pos)}
                          className="flex flex-col items-center gap-1.5 py-4 w-full border-2 border-dashed border-stone-200 hover:border-amber-300 rounded-xl text-stone-300 hover:text-amber-400 transition-colors"
                        >
                          <Plus size={22} />
                          <span className="text-xs">添加第{pos}位</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ========== 添加/编辑弹窗 ========== */}
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingEntry ? '修改成员' : '添加成员'}>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-600 mb-1">角色</label>
              <select value={formRole} onChange={e => setFormRole(e.target.value as DutyRole)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="monitor">{DUTY_ROLE_LABELS.monitor}</option>
                <option value="captain">{DUTY_ROLE_LABELS.captain}</option>
                <option value="vice_captain">{DUTY_ROLE_LABELS.vice_captain}</option>
                <option value="duty_monitor">{DUTY_ROLE_LABELS.duty_monitor}</option>
                <option value="rotation">{DUTY_ROLE_LABELS.rotation}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-600 mb-1">学生</label>
              <select value={formStudentId} onChange={e => setFormStudentId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">请选择学生</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {formRole === 'rotation' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-stone-600 mb-1">星期</label>
                  <select value={formWeekday} onChange={e => setFormWeekday(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {[1, 2, 3, 4, 5].map(wd => (
                      <option key={wd} value={wd}>{WEEKDAY_NAMES[wd]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-600 mb-1">位置</label>
                  <select value={formPosition} onChange={e => setFormPosition(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value={1}>第1位</option>
                    <option value={2}>第2位</option>
                  </select>
                </div>
              </div>
            )}

            {(formRole === 'captain' || formRole === 'vice_captain') && (
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">负责日期段</label>
                <select value={formWeekdayGroup} onChange={e => setFormWeekdayGroup(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="mon_wed">周一至周三</option>
                  <option value="thu_fri">周四至周五</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-stone-600 mb-1">照片</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              <div className="flex items-center gap-3">
                <div className="w-20 h-24 rounded-xl bg-stone-100 flex items-center justify-center overflow-hidden border">
                  {formPhoto ? (
                    <img src={formPhoto} alt="预览" className="w-full h-full object-cover" />
                  ) : (
                    <Camera size={24} className="text-stone-300" />
                  )}
                </div>
                <div className="space-y-1">
                  <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 text-xs bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors text-stone-600">
                    上传照片
                  </button>
                  {formPhoto && (
                    <button onClick={() => setFormPhoto('')} className="block text-xs text-red-400 hover:text-red-600">
                      清除照片
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2 border-t">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-stone-500 hover:bg-stone-100 rounded-lg transition-colors">
                取消
              </button>
              <button onClick={handleSave} disabled={!formStudentId}
                className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors">
                {editingEntry ? '保存修改' : '添加'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  )
}
