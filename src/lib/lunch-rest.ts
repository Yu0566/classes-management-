import { v4 as uuid } from 'uuid'
import { queryAll, executeRun, executeTransaction } from './db'
import { upsertDailyStatus } from './daily-status'
import type { LunchRestRecord } from '@/types'

export type LunchRestStatus = 'unsigned' | 'signed' | 'leave'

export const LUNCH_REST_STATUS: Record<LunchRestStatus, { label: string; color: string }> = {
  unsigned: { label: '未设置', color: 'bg-gray-100 text-gray-500' },
  signed: { label: '签到', color: 'bg-green-100 text-green-700' },
  leave: { label: '请假', color: 'bg-yellow-100 text-yellow-700' },
}

export const LUNCH_REST_CYCLE: LunchRestStatus[] = ['unsigned', 'signed', 'leave']

export const LUNCH_LABEL_NAME = '在校就餐'

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
  studentId: string; studentName: string; groupName: string; status: string; remark: string; longterm: boolean
}[]> {
  const rows = await queryAll<{
    studentId: string; studentName: string; groupName: string
    status: string; remark: string; longterm: number
  }>(
    `SELECT s.id as studentId, s.name as studentName, COALESCE(g.name, '') as groupName,
            COALESCE(lr.status, 'unsigned') as status, COALESCE(lr.remark, '') as remark,
            s.lunch_longterm as longterm
     FROM students s
     LEFT JOIN groups g ON g.id = s.group_id
     LEFT JOIN lunch_rest_records lr ON lr.student_id = s.id AND lr.date = ?
     WHERE s.lunch_label != ''
     ORDER BY g.sort_order, s.sort_order, s.name`,
    [date]
  )
  return rows.map(r => ({ ...r, longterm: r.longterm === 1 }))
}

// 切换长期请假状态
export async function toggleLongtermLeave(studentId: string): Promise<void> {
  const rows = await queryAll<{ lunch_longterm: number }>(
    'SELECT lunch_longterm FROM students WHERE id = ?', [studentId]
  )
  if (rows.length === 0) return
  const newVal = rows[0].lunch_longterm === 1 ? 0 : 1
  await executeRun(
    'UPDATE students SET lunch_longterm = ?, updated_at = ? WHERE id = ?',
    [newVal, Date.now(), studentId]
  )
}
