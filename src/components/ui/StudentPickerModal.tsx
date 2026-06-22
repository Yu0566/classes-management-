import { useState, useMemo } from 'react'
import Modal from './Modal'
import type { StudentWithGroup } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (studentId: string, studentName: string) => void
  students: StudentWithGroup[]
  excludeIds?: string[]
  title?: string
}

export default function StudentPickerModal({ open, onClose, onSelect, students, excludeIds = [], title = '选择学生' }: Props) {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  const available = useMemo(
    () => students.filter(s => !excludeIds.includes(s.id)),
    [students, excludeIds]
  )

  const groups = useMemo(() => {
    const map = new Map<string, StudentWithGroup[]>()
    for (const s of available) {
      const key = s.group_name || '未分组'
      const arr = map.get(key) || []
      arr.push(s)
      map.set(key, arr)
    }
    return map
  }, [available])

  const groupNames = useMemo(() => [...groups.keys()], [groups])

  const groupLeaderMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const [name, members] of groups) {
      const leader = members[0]?.leader_name
      if (leader) map.set(name, leader)
    }
    return map
  }, [groups])

  const displayStudents = selectedGroup ? (groups.get(selectedGroup) || []) : available

  return (
    <Modal open={open} onClose={onClose} title={title} width="lg">
      {/* 小组选择栏 */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setSelectedGroup(null)}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            selectedGroup === null
              ? 'bg-stone-800 text-white shadow-sm'
              : 'bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700'
          }`}
        >
          全部 <span className="opacity-60">{available.length}</span>
        </button>
        {groupNames.map(name => {
          const leader = groupLeaderMap.get(name)
          return (
            <button
              key={name}
              onClick={() => setSelectedGroup(name)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                selectedGroup === name
                  ? 'bg-stone-800 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700'
              }`}
            >
              {name}{leader ? `（${leader}）` : ''} <span className="opacity-60">{groups.get(name)!.length}</span>
            </button>
          )
        })}
      </div>

      {/* 学生网格 */}
      {displayStudents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-stone-400">
          <div className="text-3xl mb-2">🎓</div>
          <p className="text-sm">没有可选的学生</p>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-3 max-h-72 overflow-auto">
          {displayStudents.map(s => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id, s.name)}
              className="flex flex-col items-center gap-2 py-3 px-1 rounded-xl border border-transparent hover:border-primary-200 hover:bg-primary-50/50 transition-all active:scale-95"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-stone-100 to-stone-200 flex items-center justify-center shadow-inner">
                <span className="text-sm font-bold text-stone-600">{s.name.charAt(0)}</span>
              </div>
              <span className="text-xs font-medium text-stone-700 truncate w-full text-center leading-tight">
                {s.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
