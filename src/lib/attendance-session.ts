import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun } from './db'
import type { AttendanceWindow } from '@/types'

export async function getWindows(date: string): Promise<AttendanceWindow[]> {
  return queryAll<AttendanceWindow>(
    'SELECT * FROM attendance_windows WHERE date = ? ORDER BY window_start',
    [date]
  )
}

export async function addWindow(
  date: string,
  label: string,
  windowStart: string,
  windowEnd: string
): Promise<AttendanceWindow> {
  const id = uuid()
  const now = Date.now()
  await executeRun(
    'INSERT INTO attendance_windows (id, date, label, window_start, window_end, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, date, label, windowStart, windowEnd, 'idle', now, now]
  )
  return { id, date, label, window_start: windowStart, window_end: windowEnd, status: 'idle', created_at: now, updated_at: now }
}

export async function updateWindow(
  id: string,
  windowStart: string,
  windowEnd: string
): Promise<void> {
  await executeRun(
    'UPDATE attendance_windows SET window_start = ?, window_end = ?, updated_at = ? WHERE id = ?',
    [windowStart, windowEnd, Date.now(), id]
  )
}

export async function deleteWindow(id: string): Promise<void> {
  await executeRun('DELETE FROM attendance_windows WHERE id = ?', [id])
}

export async function setWindowStatus(
  id: string,
  status: 'idle' | 'active' | 'closed'
): Promise<void> {
  await executeRun(
    'UPDATE attendance_windows SET status = ?, updated_at = ? WHERE id = ?',
    [status, Date.now(), id]
  )
}

export async function getAllWindows(): Promise<AttendanceWindow[]> {
  return queryAll<AttendanceWindow>('SELECT * FROM attendance_windows ORDER BY date DESC, window_start')
}
