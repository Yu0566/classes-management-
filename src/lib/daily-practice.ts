import { v4 as uuid } from 'uuid'
import { queryAll, executeRun, executeTransaction } from './db'
import { upsertDailyStatus } from './daily-status'
import type { DailyPracticeRecord } from '@/types'

export type PracticeStatus = 'signed' | 'unsigned' | 'not_applicable'

export const PRACTICE_STATUS: Record<PracticeStatus, { label: string; color: string; score: number }> = {
  signed: { label: '已签', color: 'bg-green-100 text-green-700', score: 0 },
  unsigned: { label: '未签', color: 'bg-red-100 text-red-700', score: -1 },
  not_applicable: { label: '不参与', color: 'bg-gray-100 text-gray-500', score: 0 },
}

export const PRACTICE_CYCLE: PracticeStatus[] = ['unsigned', 'signed', 'not_applicable']

export async function upsertPractice(
  studentId: string, date: string, status: PracticeStatus
): Promise<void> {
  const now = Date.now()
  const existing = (await queryAll<DailyPracticeRecord>(
    'SELECT * FROM daily_practice_records WHERE student_id = ? AND date = ?', [studentId, date]
  ))[0]

  const signedAt = status === 'signed' ? now : (existing?.signed_at || null)

  if (existing) {
    await executeRun(
      'UPDATE daily_practice_records SET status = ?, signed_at = ?, updated_at = ? WHERE id = ?',
      [status, signedAt, now, existing.id]
    )
  } else {
    await executeRun(
      `INSERT INTO daily_practice_records (id, student_id, date, status, signed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid(), studentId, date, status, signedAt, now]
    )
  }
  await upsertDailyStatus(studentId, date, 'daily_practice', status)
}

export async function batchSetPractice(
  studentIds: string[], date: string, status: PracticeStatus
): Promise<void> {
  const now = Date.now()
  const signedAt = status === 'signed' ? now : null
  const ops = studentIds.map(sid => ({
    sql: `INSERT INTO daily_practice_records (id, student_id, date, status, signed_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(student_id, date) DO UPDATE SET status = ?, signed_at = ?, updated_at = ?`,
    params: [uuid(), sid, date, status, signedAt, now, status, signedAt, now],
  }))
  await executeTransaction(ops)
  for (const sid of studentIds) {
    await upsertDailyStatus(sid, date, 'daily_practice', status)
  }
}

export async function getPracticeWithStudents(date: string): Promise<{
  studentId: string; studentName: string; groupName: string; status: string
}[]> {
  return queryAll(
    `SELECT s.id as studentId, s.name as studentName, COALESCE(g.name, '') as groupName,
            COALESCE(dpr.status, 'unsigned') as status
     FROM students s
     LEFT JOIN groups g ON g.id = s.group_id
     LEFT JOIN daily_practice_records dpr ON dpr.student_id = s.id AND dpr.date = ?
     ORDER BY g.sort_order, s.sort_order, s.name`,
    [date]
  )
}
