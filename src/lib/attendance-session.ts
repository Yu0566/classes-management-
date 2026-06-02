import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun } from './db'
import type { AttendanceWindow, AttendanceWindowRecord } from '@/types'

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

export async function resetAttendanceWindow(windowId: string): Promise<void> {
  const win = await queryOne<AttendanceWindow>(
    'SELECT * FROM attendance_windows WHERE id = ?', [windowId]
  )
  if (!win) throw new Error('考勤时段不存在')

  const records = await queryAll<AttendanceWindowRecord>(
    'SELECT * FROM attendance_window_records WHERE window_id = ?', [windowId]
  )

  // 撤销考勤迟到产生的扣分
  for (const r of records) {
    if (r.status === 'late') {
      await executeRun(
        "DELETE FROM deduction_records WHERE student_id = ? AND date = ? AND reason = '考勤迟到'",
        [r.student_id, win.date]
      )
    }
  }

  // 清空受影响学生的 daily_statuses.attendance
  for (const r of records) {
    await executeRun(
      "UPDATE daily_statuses SET attendance = '', updated_at = ? WHERE student_id = ? AND date = ?",
      [Date.now(), r.student_id, win.date]
    )
  }

  // 移除值日名单中因考勤迟到被加入的学生
  const lateIds = records.filter(r => r.status === 'late').map(r => r.student_id)
  if (lateIds.length > 0) {
    const dutyRecord = await queryOne<{ id: string }>(
      'SELECT id FROM duty_records WHERE date = ?', [win.date]
    )
    if (dutyRecord) {
      const placeholders = lateIds.map(() => '?').join(',')
      await executeRun(
        `DELETE FROM duty_students WHERE duty_record_id = ? AND student_id IN (${placeholders})`,
        [dutyRecord.id, ...lateIds]
      )
    }
  }

  // 删除窗口记录
  await executeRun('DELETE FROM attendance_window_records WHERE window_id = ?', [windowId])

  // 重置窗口状态为 idle
  await executeRun(
    "UPDATE attendance_windows SET status = 'idle', updated_at = ? WHERE id = ?",
    [Date.now(), windowId]
  )
}
