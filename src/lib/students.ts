import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun } from './db'
import type { Student, StudentWithGroup } from '@/types'

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
  practice_label?: string
}): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []
  if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name) }
  if (data.sort_order !== undefined) { sets.push('sort_order = ?'); params.push(data.sort_order) }
  if (data.practice_label !== undefined) { sets.push('practice_label = ?'); params.push(data.practice_label) }
  if (sets.length === 0) return
  sets.push('updated_at = ?')
  params.push(Date.now(), id)
  await executeRun(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`, params)
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
