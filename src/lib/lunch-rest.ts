import { v4 as uuid } from 'uuid'
import { queryAll, executeRun, executeTransaction } from './db'
import { upsertDailyStatus } from './daily-status'
import type { LunchRestRecord } from '@/types'

export type LunchRestStatus = 'normal' | 'violation' | 'absent'

export const LUNCH_REST_STATUS: Record<LunchRestStatus, { label: string; color: string; score: number }> = {
  normal: { label: '正常', color: 'bg-green-100 text-green-700', score: 0 },
  violation: { label: '违纪', color: 'bg-red-100 text-red-700', score: -1 },
  absent: { label: '缺席', color: 'bg-gray-100 text-gray-500', score: -1 },
}

export const LUNCH_REST_CYCLE: LunchRestStatus[] = ['normal', 'violation', 'absent']

export async function upsertLunchRest(
  studentId: string, date: string, status: LunchRestStatus, remark: string = ''
): Promise<void> {
  const now = Date.now()
  const existing = (await queryAll<LunchRestRecord>(
    'SELECT * FROM lunch_rest_records WHERE student_id = ? AND date = ?', [studentId, date]
  ))[0]

  if (existing) {
    await executeRun(
      'UPDATE lunch_rest_records SET status = ?, remark = ?, updated_at = ? WHERE id = ?',
      [status, remark, now, existing.id]
    )
  } else {
    await executeRun(
      `INSERT INTO lunch_rest_records (id, student_id, date, status, remark, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid(), studentId, date, status, remark, now]
    )
  }
  await upsertDailyStatus(studentId, date, 'lunch_rest', status)
}

export async function batchSetLunchRest(
  studentIds: string[], date: string, status: LunchRestStatus
): Promise<void> {
  const now = Date.now()
  const ops = studentIds.map(sid => ({
    sql: `INSERT INTO lunch_rest_records (id, student_id, date, status, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(student_id, date) DO UPDATE SET status = ?, updated_at = ?`,
    params: [uuid(), sid, date, status, now, status, now],
  }))
  await executeTransaction(ops)
  for (const sid of studentIds) {
    await upsertDailyStatus(sid, date, 'lunch_rest', status)
  }
}

export async function getLunchRestWithStudents(date: string): Promise<{
  studentId: string; studentName: string; groupName: string; status: string; remark: string
}[]> {
  return queryAll(
    `SELECT s.id as studentId, s.name as studentName, COALESCE(g.name, '') as groupName,
            COALESCE(lr.status, 'normal') as status, COALESCE(lr.remark, '') as remark
     FROM students s
     LEFT JOIN groups g ON g.id = s.group_id
     LEFT JOIN lunch_rest_records lr ON lr.student_id = s.id AND lr.date = ?
     ORDER BY g.sort_order, s.sort_order, s.name`,
    [date]
  )
}
