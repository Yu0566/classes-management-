import { v4 as uuid } from 'uuid'
import { queryAll, executeRun, executeTransaction } from './db'
import type { Group, Student } from '@/types'

export interface StudentSeat extends Student {
  seat_order: number
}

export interface SeatingData {
  groups: Group[]
  students: StudentSeat[]
}

export async function getSeatingData(): Promise<SeatingData> {
  const [groups, students] = await Promise.all([
    queryAll<Group>('SELECT * FROM groups ORDER BY sort_order, created_at'),
    queryAll<StudentSeat>('SELECT * FROM students ORDER BY group_id, seat_order, sort_order'),
  ])
  return { groups, students }
}

export async function seatStudent(
  studentId: string,
  groupId: string,
  seatOrder: number
): Promise<void> {
  await executeRun(
    'UPDATE students SET group_id = ?, seat_order = ?, updated_at = ? WHERE id = ?',
    [groupId, seatOrder, Date.now(), studentId]
  )
}

export async function unseatStudent(studentId: string): Promise<void> {
  await executeRun(
    "UPDATE students SET group_id = '', seat_order = -1, updated_at = ? WHERE id = ?",
    [Date.now(), studentId]
  )
}

export async function setGroupLeader(groupId: string, leaderName: string): Promise<void> {
  await executeRun(
    'UPDATE groups SET leader_name = ?, updated_at = ? WHERE id = ?',
    [leaderName, Date.now(), groupId]
  )
}

export async function clearGroupLeader(groupId: string): Promise<void> {
  await executeRun(
    "UPDATE groups SET leader_name = '', updated_at = ? WHERE id = ?",
    [Date.now(), groupId]
  )
}

export async function getGroupSeatedStudents(groupId: string): Promise<StudentSeat[]> {
  return queryAll<StudentSeat>(
    'SELECT * FROM students WHERE group_id = ? AND seat_order >= 0 ORDER BY seat_order',
    [groupId]
  )
}

export async function normalizeGroupSeats(groupId: string): Promise<void> {
  const students = await getGroupSeatedStudents(groupId)
  if (students.length === 0) return
  const now = Date.now()
  const ops = students.map((s, i) => ({
    sql: 'UPDATE students SET seat_order = ?, updated_at = ? WHERE id = ?',
    params: [i, now, s.id],
  }))
  await executeTransaction(ops)
}

export interface DropParams {
  studentId: string
  studentName: string
  sourceGroupId: string
  sourceSeatOrder: number
  targetGroupId: string
  targetSeatOrder: number
  targetOccupantId: string | null
  targetOccupantName: string | null
}

export async function performDrop(p: DropParams): Promise<void> {
  const now = Date.now()
  const ops: { sql: string; params?: unknown[] }[] = []

  // 无操作（同组同位）
  if (p.sourceGroupId === p.targetGroupId && p.sourceSeatOrder === p.targetSeatOrder) {
    return
  }

  // 场景：拖回待排池
  if (p.targetGroupId === '') {
    ops.push({
      sql: "UPDATE students SET group_id = '', seat_order = -1, updated_at = ? WHERE id = ?",
      params: [now, p.studentId],
    })
    // 如果被拖走的是组长
    const sourceGroup = await queryAll<Group>('SELECT * FROM groups WHERE id = ?', [p.sourceGroupId])
    if (sourceGroup[0]?.leader_name === p.studentName) {
      ops.push({
        sql: "UPDATE groups SET leader_name = '', updated_at = ? WHERE id = ?",
        params: [now, p.sourceGroupId],
      })
    }
    await executeTransaction(ops)
    await normalizeGroupSeats(p.sourceGroupId)
    return
  }

  // 场景：移到空位
  if (!p.targetOccupantId) {
    ops.push({
      sql: 'UPDATE students SET group_id = ?, seat_order = ?, updated_at = ? WHERE id = ?',
      params: [p.targetGroupId, p.targetSeatOrder, now, p.studentId],
    })
    // 目标组第一个学生 → 组长
    const targetSeated = await getGroupSeatedStudents(p.targetGroupId)
    if (targetSeated.length === 0) {
      ops.push({
        sql: 'UPDATE groups SET leader_name = ?, updated_at = ? WHERE id = ?',
        params: [p.studentName, now, p.targetGroupId],
      })
    }
    // 源组组长被移走
    if (p.sourceGroupId) {
      const sourceGroup = await queryAll<Group>('SELECT * FROM groups WHERE id = ?', [p.sourceGroupId])
      if (sourceGroup[0]?.leader_name === p.studentName) {
        ops.push({
          sql: "UPDATE groups SET leader_name = '', updated_at = ? WHERE id = ?",
          params: [now, p.sourceGroupId],
        })
      }
    }
    await executeTransaction(ops)
    if (p.sourceGroupId) {
      await normalizeGroupSeats(p.sourceGroupId)
    }
    return
  }

  // 场景：与目标位学生交换
  ops.push({
    sql: 'UPDATE students SET group_id = ?, seat_order = ?, updated_at = ? WHERE id = ?',
    params: [p.targetGroupId, p.targetSeatOrder, now, p.studentId],
  })
  ops.push({
    sql: 'UPDATE students SET group_id = ?, seat_order = ?, updated_at = ? WHERE id = ?',
    params: [p.sourceGroupId, p.sourceSeatOrder, now, p.targetOccupantId],
  })

  // 处理组长变更
  const targetGroup = await queryAll<Group>('SELECT * FROM groups WHERE id = ?', [p.targetGroupId])
  const sourceGroup = p.sourceGroupId ? await queryAll<Group>('SELECT * FROM groups WHERE id = ?', [p.sourceGroupId]) : []

  // 目标组：如果原来被交换的是组长，清除（新来的不是组长）
  if (p.sourceGroupId !== p.targetGroupId && targetGroup[0]?.leader_name === p.targetOccupantName) {
    ops.push({
      sql: "UPDATE groups SET leader_name = ?, updated_at = ? WHERE id = ?",
      params: [p.studentName, now, p.targetGroupId],
    })
  }
  // 源组：如果被拖走的是组长，被交换过来的变成组长
  if (p.sourceGroupId !== p.targetGroupId && sourceGroup[0]?.leader_name === p.studentName && p.targetOccupantName) {
    ops.push({
      sql: 'UPDATE groups SET leader_name = ?, updated_at = ? WHERE id = ?',
      params: [p.targetOccupantName, now, p.sourceGroupId],
    })
  }

  await executeTransaction(ops)
}

export async function resetAllSeating(): Promise<void> {
  const now = Date.now()
  const groups = await queryAll<Group>('SELECT id FROM groups')
  const ops: { sql: string; params?: unknown[] }[] = [
    { sql: "UPDATE students SET group_id = '', seat_order = -1, updated_at = ?", params: [now] },
  ]
  for (const g of groups) {
    ops.push({
      sql: "UPDATE groups SET leader_name = '', updated_at = ? WHERE id = ?",
      params: [now, g.id],
    })
  }
  await executeTransaction(ops)
}
