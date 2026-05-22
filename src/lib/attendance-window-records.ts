import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun, executeTransaction } from './db'
import type { AttendanceWindowRecord } from '@/types'

export async function getWindowRecords(windowId: string): Promise<AttendanceWindowRecord[]> {
  return queryAll<AttendanceWindowRecord>(
    'SELECT * FROM attendance_window_records WHERE window_id = ?',
    [windowId]
  )
}

export async function getStudentWindowRecord(
  windowId: string,
  studentId: string
): Promise<AttendanceWindowRecord | undefined> {
  return queryOne<AttendanceWindowRecord>(
    'SELECT * FROM attendance_window_records WHERE window_id = ? AND student_id = ?',
    [windowId, studentId]
  )
}

export async function upsertWindowRecord(
  windowId: string,
  studentId: string,
  status: string
): Promise<void> {
  const existing = await getStudentWindowRecord(windowId, studentId)
  const now = Date.now()
  if (existing) {
    await executeRun(
      'UPDATE attendance_window_records SET status = ?, updated_at = ? WHERE id = ?',
      [status, now, existing.id]
    )
  } else {
    await executeRun(
      'INSERT INTO attendance_window_records (id, window_id, student_id, status, updated_at) VALUES (?, ?, ?, ?, ?)',
      [uuid(), windowId, studentId, status, now]
    )
  }
}

export async function initWindowRecords(
  windowId: string,
  studentIds: string[]
): Promise<void> {
  const existing = await getWindowRecords(windowId)
  const existingIds = new Set(existing.map(r => r.student_id))
  const ops: { sql: string; params?: unknown[] }[] = []
  const now = Date.now()
  for (const sid of studentIds) {
    if (!existingIds.has(sid)) {
      ops.push({
        sql: 'INSERT INTO attendance_window_records (id, window_id, student_id, status, updated_at) VALUES (?, ?, ?, ?, ?)',
        params: [uuid(), windowId, sid, 'unsigned', now],
      })
    }
  }
  if (ops.length > 0) {
    await executeTransaction(ops)
  }
}
