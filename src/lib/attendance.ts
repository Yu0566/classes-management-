import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun, executeTransaction } from './db'
import { upsertDailyStatus } from './daily-status'
import type { AttendanceRecord } from '@/types'

export type AttendanceStatus = 'normal' | 'late' | 'absent' | 'leave'

export const ATTENDANCE_STATUS: Record<AttendanceStatus, { label: string; color: string; score: number }> = {
  normal: { label: '正常', color: 'bg-green-100 text-green-700', score: 0 },
  late: { label: '迟到', color: 'bg-yellow-100 text-yellow-700', score: -1 },
  absent: { label: '缺勤', color: 'bg-red-100 text-red-700', score: -2 },
  leave: { label: '请假', color: 'bg-gray-100 text-gray-500', score: 0 },
}

export const ATTENDANCE_CYCLE: AttendanceStatus[] = ['normal', 'late', 'absent', 'leave']

// 获取指定日期的考勤记录
export async function getAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
  return queryAll<AttendanceRecord>(
    'SELECT * FROM attendance_records WHERE date = ?',
    [date]
  )
}

// 获取单个学生的考勤记录
export async function getStudentAttendance(
  studentId: string,
  date: string
): Promise<AttendanceRecord | undefined> {
  return queryOne<AttendanceRecord>(
    'SELECT * FROM attendance_records WHERE student_id = ? AND date = ?',
    [studentId, date]
  )
}

// 更新或插入考勤记录（同时同步到每日登记）
export async function upsertAttendance(
  studentId: string,
  date: string,
  status: AttendanceStatus,
  remark: string = ''
): Promise<void> {
  const existing = await getStudentAttendance(studentId, date)
  const now = Date.now()

  if (existing) {
    await executeRun(
      'UPDATE attendance_records SET status = ?, remark = ?, updated_at = ? WHERE id = ?',
      [status, remark, now, existing.id]
    )
  } else {
    await executeRun(
      `INSERT INTO attendance_records (id, student_id, date, status, remark, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid(), studentId, date, status, remark, now]
    )
  }

  // 同步到每日登记
  await upsertDailyStatus(studentId, date, 'attendance', status)
}

// 批量设置考勤
export async function batchSetAttendance(
  studentIds: string[],
  date: string,
  status: AttendanceStatus
): Promise<void> {
  const now = Date.now()
  const ops = studentIds.map(sid => ({
    sql: `INSERT INTO attendance_records (id, student_id, date, status, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(student_id, date)
          DO UPDATE SET status = ?, updated_at = ?`,
    params: [uuid(), sid, date, status, now, status, now],
  }))
  await executeTransaction(ops)

  // 同步到每日登记
  for (const sid of studentIds) {
    await upsertDailyStatus(sid, date, 'attendance', status)
  }
}

// 考勤统计
export async function getAttendanceStats(
  startDate: string,
  endDate: string
): Promise<{
  total: number
  normal: number
  late: number
  absent: number
  leave: number
  attendanceRate: number
}> {
  const records = await queryAll<AttendanceRecord>(
    'SELECT * FROM attendance_records WHERE date >= ? AND date <= ?',
    [startDate, endDate]
  )
  const total = records.length
  const counts = { normal: 0, late: 0, absent: 0, leave: 0 }
  for (const r of records) {
    counts[r.status as keyof typeof counts]++
  }
  const present = counts.normal + counts.late // 迟到也算出勤
  return {
    total,
    ...counts,
    attendanceRate: total > 0 ? Math.round((present / total) * 100) : 100,
  }
}

// 获取带学生详情的考勤列表
export async function getAttendanceWithStudents(date: string): Promise<{
  studentId: string
  studentName: string
  groupName: string
  status: string
  remark: string
}[]> {
  return queryAll(
    `SELECT
       s.id as studentId,
       s.name as studentName,
       COALESCE(g.name, '') as groupName,
       COALESCE(ar.status, 'normal') as status,
       COALESCE(ar.remark, '') as remark
     FROM students s
     LEFT JOIN groups g ON g.id = s.group_id
     LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.date = ?
     ORDER BY g.sort_order, s.sort_order, s.name`,
    [date]
  )
}
