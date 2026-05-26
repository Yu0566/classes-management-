import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun } from './db'
import type { Student, StudentWithGroup, ManualAdjustRecord } from '@/types'

// 获取所有学生
export async function getAllStudents(): Promise<StudentWithGroup[]> {
  return queryAll<StudentWithGroup>(
    `SELECT s.*, g.name as group_name
     FROM students s
     LEFT JOIN groups g ON g.id = s.group_id
     ORDER BY s.group_id, s.sort_order, s.created_at`
  )
}

// 获取单个学生
export async function getStudent(id: string): Promise<Student | undefined> {
  return queryOne<Student>('SELECT * FROM students WHERE id = ?', [id])
}

// 创建学生
export async function createStudent(data: {
  name: string
  groupId: string
}): Promise<Student> {
  const id = uuid()
  const now = Date.now()
  await executeRun(
    `INSERT INTO students (id, name, group_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, data.name, data.groupId, now, now]
  )
  return (await getStudent(id))!
}

// 批量创建学生
export async function batchCreateStudents(
  names: string[],
  groupId: string
): Promise<number> {
  const now = Date.now()
  const validNames = names.map(n => n.trim()).filter(n => n.length > 0)
  if (validNames.length === 0) return 0

  const sqls: { sql: string; params: unknown[] }[] = []
  for (const name of validNames) {
    sqls.push({
      sql: `INSERT INTO students (id, name, group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      params: [uuid(), name, groupId, now, now],
    })
  }

  // 逐条执行
  for (const { sql, params } of sqls) {
    await executeRun(sql, params)
  }

  return validNames.length
}

// 更新学生
export async function updateStudent(id: string, data: {
  name?: string
  sort_order?: number
  manual_offset?: number
  practice_label?: string
  lunch_label?: string
  lunch_longterm?: number
}): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []
  if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name) }
  if (data.sort_order !== undefined) { sets.push('sort_order = ?'); params.push(data.sort_order) }
  if (data.manual_offset !== undefined) { sets.push('manual_offset = ?'); params.push(data.manual_offset) }
  if (data.practice_label !== undefined) { sets.push('practice_label = ?'); params.push(data.practice_label) }
  if (data.lunch_label !== undefined) { sets.push('lunch_label = ?'); params.push(data.lunch_label) }
  if (data.lunch_longterm !== undefined) { sets.push('lunch_longterm = ?'); params.push(data.lunch_longterm) }
  if (sets.length === 0) return
  sets.push('updated_at = ?')
  params.push(Date.now(), id)
  await executeRun(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`, params)
}

// 批量设置午餐午休标签：根据名单自动匹配学生
export async function batchSetLunchLabel(names: string[]): Promise<{ matched: string[]; unmatched: string[] }> {
  const cleanNames = names.map(n => n.trim()).filter(n => n.length > 0)
  const allStudents = await getAllStudents()
  const matched: string[] = []
  const unmatched: string[] = []

  const now = Date.now()
  for (const name of cleanNames) {
    const student = allStudents.find(s => s.name === name)
    if (student) {
      await executeRun(
        'UPDATE students SET lunch_label = ?, updated_at = ? WHERE id = ?',
        ['zaixiao', now, student.id]
      )
      matched.push(name)
    } else {
      unmatched.push(name)
    }
  }
  return { matched, unmatched }
}

// 手动调整学生积分（同时更新 student.manual_offset 和插入 manual_adjust_records）
export async function adjustStudentScore(
  studentId: string,
  studentName: string,
  delta: number,
  reason: string
): Promise<void> {
  const student = await getStudent(studentId)
  if (!student) throw new Error('学生不存在')
  const newOffset = (student.manual_offset || 0) + delta
  await updateStudent(studentId, { manual_offset: newOffset })
  const id = uuid()
  const now = Date.now()
  await executeRun(
    `INSERT INTO manual_adjust_records (id, student_id, student_name, delta, reason, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, studentId, studentName, delta, reason, now]
  )
}

// 删除学生
export async function deleteStudent(id: string): Promise<void> {
  await executeRun('DELETE FROM daily_statuses WHERE student_id = ?', [id])
  await executeRun('DELETE FROM deduction_records WHERE student_id = ?', [id])
  await executeRun('DELETE FROM manual_adjust_records WHERE student_id = ?', [id])
  await executeRun('DELETE FROM duty_students WHERE student_id = ?', [id])
  await executeRun('DELETE FROM homework_submissions WHERE student_id = ?', [id])
  await executeRun('DELETE FROM attendance_records WHERE student_id = ?', [id])
  await executeRun('DELETE FROM lunch_rest_records WHERE student_id = ?', [id])
  await executeRun('DELETE FROM daily_practice_records WHERE student_id = ?', [id])
  await executeRun('DELETE FROM practice_signins WHERE student_id = ?', [id])
  await executeRun('DELETE FROM practice_score_awards WHERE student_id = ?', [id])
  await executeRun('DELETE FROM students WHERE id = ?', [id])
}
