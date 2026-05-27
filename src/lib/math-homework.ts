import { v4 as uuid } from 'uuid'
import { queryAll, executeRun } from './db'
import type { MathHomeworkGrade, MathHomeworkGradeWithStudent } from '@/types'

export async function getFailsByDate(date: string): Promise<MathHomeworkGradeWithStudent[]> {
  return queryAll<MathHomeworkGradeWithStudent>(
    `SELECT m.*, s.name as student_name, g.name as group_name, g.id as group_id, g.color as group_color, g.leader_name as group_leader_name
     FROM math_homework_grades m
     JOIN students s ON m.student_id = s.id
     JOIN \`groups\` g ON s.group_id = g.id
     WHERE m.date = ?
     ORDER BY g.sort_order, s.sort_order`,
    [date]
  )
}

export async function getFailHistory(): Promise<MathHomeworkGradeWithStudent[]> {
  return queryAll<MathHomeworkGradeWithStudent>(
    `SELECT m.*, s.name as student_name, g.name as group_name, g.id as group_id, g.color as group_color, g.leader_name as group_leader_name
     FROM math_homework_grades m
     JOIN students s ON m.student_id = s.id
     JOIN \`groups\` g ON s.group_id = g.id
     ORDER BY m.date DESC, g.sort_order, s.sort_order`
  )
}

export async function markFail(
  studentId: string, date: string, reason: string
): Promise<void> {
  const existing = await queryAll<MathHomeworkGrade>(
    'SELECT * FROM math_homework_grades WHERE student_id = ? AND date = ?',
    [studentId, date]
  )
  const now = Date.now()
  if (existing.length > 0) {
    await executeRun(
      'UPDATE math_homework_grades SET reason = ?, created_at = ? WHERE id = ?',
      [reason, now, existing[0].id]
    )
  } else {
    await executeRun(
      `INSERT INTO math_homework_grades (id, student_id, date, reason, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [uuid(), studentId, date, reason, now]
    )
  }
}

export async function removeFail(id: string): Promise<void> {
  await executeRun('DELETE FROM math_homework_grades WHERE id = ?', [id])
}
