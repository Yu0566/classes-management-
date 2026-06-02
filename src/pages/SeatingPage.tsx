import { useState, useEffect, useCallback, useRef } from 'react'
import { Crown, RotateCcw } from 'lucide-react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import * as seatingApi from '@/lib/seating'
import type { Group } from '@/types'
import type { StudentSeat } from '@/lib/seating'

const SEATS_PER_GROUP = 7
const SEAT_LABELS = ['左前', '左中', '左后', '左后二', '右后二', '右后', '右前']

export default function SeatingPage() {
  const { confirm } = useConfirm()
  const [groups, setGroups] = useState<Group[]>([])
  const [students, setStudents] = useState<StudentSeat[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const data = await seatingApi.getSeatingData()
    setGroups(data.groups)
    setStudents(data.students)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const unseatedStudents = students.filter(s => (s.seat_order ?? -1) === -1)

  const getGroupSeats = (groupId: string): (StudentSeat | null)[] => {
    const members = students
      .filter(s => s.group_id === groupId && (s.seat_order ?? -1) >= 0)
      .sort((a, b) => (a.seat_order ?? 0) - (b.seat_order ?? 0))
    const seats: (StudentSeat | null)[] = Array(SEATS_PER_GROUP).fill(null)
    members.forEach(s => {
      const idx = s.seat_order ?? -1
      if (idx >= 0 && idx < SEATS_PER_GROUP) seats[idx] = s
    })
    return seats
  }

  const isLeader = (groupId: string, studentName: string) => {
    const group = groups.find(g => g.id === groupId)
    return group?.leader_name === studentName
  }

  const handleDragStart = (e: React.DragEvent, student: StudentSeat) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      studentId: student.id,
      studentName: student.name,
      sourceGroupId: student.group_id,
      sourceSeatOrder: student.seat_order ?? -1,
    }))
    e.dataTransfer.effectAllowed = 'move'

    // 用克隆元素替换浏览器默认灰色拖拽幽灵图
    const el = e.currentTarget as HTMLElement
    const ghost = el.cloneNode(true) as HTMLElement
    ghost.style.position = 'fixed'
    ghost.style.top = '0px'
    ghost.style.left = '0px'
    ghost.style.opacity = '0'
    ghost.style.pointerEvents = 'none'
    ghost.style.zIndex = '-9999'
    document.body.appendChild(ghost)
    // 强制布局，确保浏览器渲染该元素再快照为拖拽图像
    ghost.getBoundingClientRect()
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2)
    requestAnimationFrame(() => ghost.remove())
  }

  const handleDropOnSlot = async (
    e: React.DragEvent,
    targetGroupId: string,
    targetSeatOrder: number,
    targetOccupantId: string | null,
    targetOccupantName: string | null,
  ) => {
    e.preventDefault()
    try {
      const raw = e.dataTransfer.getData('application/json')
      if (!raw) return
      const source = JSON.parse(raw) as {
        studentId: string; studentName: string; sourceGroupId: string; sourceSeatOrder: number
      }
      await seatingApi.performDrop({
        studentId: source.studentId,
        studentName: source.studentName,
        sourceGroupId: source.sourceGroupId,
        sourceSeatOrder: source.sourceSeatOrder,
        targetGroupId,
        targetSeatOrder,
        targetOccupantId,
        targetOccupantName,
      })
      await loadData()
    } catch (err) {
      console.error('[handleDropOnSlot]', err)
    }
  }

  const handleDropOnPool = async (e: React.DragEvent) => {
    e.preventDefault()
    try {
      const raw = e.dataTransfer.getData('application/json')
      if (!raw) return
      const source = JSON.parse(raw) as {
        studentId: string; studentName: string; sourceGroupId: string; sourceSeatOrder: number
      }
      if (source.sourceSeatOrder === -1) return
      await seatingApi.performDrop({
        studentId: source.studentId,
        studentName: source.studentName,
        sourceGroupId: source.sourceGroupId,
        sourceSeatOrder: source.sourceSeatOrder,
        targetGroupId: '',
        targetSeatOrder: -1,
        targetOccupantId: null,
        targetOccupantName: null,
      })
      await loadData()
    } catch (err) {
      console.error('[handleDropOnPool]', err)
    }
  }

  const handleReset = async () => {
    if (!await confirm({ message: '确认重置所有座位？\n\n所有学生的座位将被清空，小组组长也将被清除。' })) return
    await seatingApi.resetAllSeating()
    await loadData()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
  }

  const seatedCount = students.filter(s => (s.seat_order ?? -1) >= 0).length

  return (
    <div className="h-full overflow-auto">
      <div className="p-6">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800">座位编排</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {seatedCount} 已安排 / {students.length} 名学生
            </span>
            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <RotateCcw size={14} />
              重置座位
            </button>
          </div>
        </div>

        {/* 待排池 */}
        <UnseatedPool
          students={unseatedStudents}
          groups={groups}
          onDragStart={handleDragStart}
          onDrop={handleDropOnPool}
        />

        {/* 小组座位网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {groups.map(group => {
            const seats = getGroupSeats(group.id)
            const count = seats.filter(Boolean).length
            return (
              <GroupCard
                key={group.id}
                group={group}
                seats={seats}
                seatedCount={count}
                isLeader={isLeader}
                onDragStart={handleDragStart}
                onDropOnSlot={handleDropOnSlot}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ====== 子组件 ======

function UnseatedPool({
  students, groups, onDragStart, onDrop,
}: {
  students: StudentSeat[]
  groups: Group[]
  onDragStart: (e: React.DragEvent, s: StudentSeat) => void
  onDrop: (e: React.DragEvent) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    ref.current?.classList.add('border-primary-400', 'bg-primary-50')
  }
  const handleDragLeave = () => {
    ref.current?.classList.remove('border-primary-400', 'bg-primary-50')
  }
  const handleDrop = (e: React.DragEvent) => {
    ref.current?.classList.remove('border-primary-400', 'bg-primary-50')
    onDrop(e)
  }

  return (
    <div className="mb-6">
      <h2 className="text-sm font-medium text-gray-500 mb-2">
        待安排学生（{students.length}人）
      </h2>
      <div
        ref={ref}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="flex flex-wrap gap-2 p-3 border-2 border-dashed rounded-lg min-h-[44px] transition-colors border-gray-200 bg-gray-50"
      >
        {students.length === 0 ? (
          <p className="text-sm text-gray-400 w-full text-center">所有学生已安排座位</p>
        ) : (
          students.map(s => {
            const g = groups.find(grp => grp.id === s.group_id)
            return (
              <StudentChip
                key={s.id}
                student={s}
                groupColor={g?.color || 'bg-gray-400'}
                isLeader={false}
                onDragStart={onDragStart}
              />
            )
          })
        )}
      </div>
    </div>
  )
}

function GroupCard({
  group, seats, seatedCount, isLeader, onDragStart, onDropOnSlot,
}: {
  group: Group
  seats: (StudentSeat | null)[]
  seatedCount: number
  isLeader: (groupId: string, name: string) => boolean
  onDragStart: (e: React.DragEvent, s: StudentSeat) => void
  onDropOnSlot: (e: React.DragEvent, gid: string, order: number, oid: string | null, oname: string | null) => void
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition-shadow">
      {/* 小组头部 */}
      <div className={`${group.color || 'bg-blue-500'} px-3 py-2 text-white`}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm">{group.name}</span>
          <span className="text-xs opacity-80">{seatedCount}/{SEATS_PER_GROUP}</span>
        </div>
        {group.leader_name && (
          <div className="flex items-center gap-1 mt-0.5 text-xs opacity-90">
            <Crown size={10} />
            {group.leader_name}
          </div>
        )}
      </div>

      {/* 座位槽 */}
      <div className="p-2 space-y-1.5">
        {seats.map((student, idx) => (
          <SeatSlot
            key={idx}
            groupId={group.id}
            seatOrder={idx}
            student={student}
            label={SEAT_LABELS[idx]}
            isLeader={student ? isLeader(group.id, student.name) : false}
            groupColor={group.color || 'bg-blue-500'}
            onDragStart={onDragStart}
            onDrop={onDropOnSlot}
          />
        ))}
      </div>
    </div>
  )
}

function SeatSlot({
  groupId, seatOrder, student, label, isLeader: leader, groupColor, onDragStart, onDrop,
}: {
  groupId: string
  seatOrder: number
  student: StudentSeat | null
  label: string
  isLeader: boolean
  groupColor: string
  onDragStart: (e: React.DragEvent, s: StudentSeat) => void
  onDrop: (e: React.DragEvent, gid: string, order: number, oid: string | null, oname: string | null) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    ref.current?.classList.add('border-primary-400', 'bg-primary-50', 'scale-[1.02]')
  }
  const handleDragLeave = () => {
    ref.current?.classList.remove('border-primary-400', 'bg-primary-50', 'scale-[1.02]')
  }
  const handleDrop = (e: React.DragEvent) => {
    ref.current?.classList.remove('border-primary-400', 'bg-primary-50', 'scale-[1.02]')
    onDrop(e, groupId, seatOrder, student?.id ?? null, student?.name ?? null)
  }

  const baseClass = student
    ? 'border-gray-100 bg-white'
    : 'border-dashed border-gray-200 bg-gray-50'

  return (
    <div
      ref={ref}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border-2 transition-all duration-150 ${baseClass}`}
    >
      <span className="text-xs text-gray-300 w-10 flex-shrink-0">{label}</span>
      {student ? (
        <StudentChip
          student={student}
          groupColor={groupColor}
          isLeader={leader}
          onDragStart={onDragStart}
        />
      ) : (
        <span className="text-xs text-gray-300 italic">空位</span>
      )}
    </div>
  )
}

function StudentChip({
  student, groupColor, isLeader: leader, onDragStart,
}: {
  student: StudentSeat
  groupColor: string
  isLeader: boolean
  onDragStart: (e: React.DragEvent, s: StudentSeat) => void
}) {
  const handleDragStart = (e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement
    el.style.opacity = '0.4'
    onDragStart(e, student)
  }
  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = ''
  }
  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className="flex items-center gap-1 px-2.5 py-1 bg-white border rounded-md shadow-sm cursor-grab hover:shadow-md transition-shadow select-none"
    >
      {leader && <Crown size={12} className="text-amber-500 flex-shrink-0" />}
      <span className="text-sm font-medium truncate max-w-[80px]">{student.name}</span>
    </div>
  )
}
