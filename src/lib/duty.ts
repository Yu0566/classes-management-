import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun, executeTransaction } from './db'
import type { DutyRecord, DutyStudent } from '@/types'

// 获取或创建今日值日记录
export async function getOrCreateDutyRecord(date: string): Promise<DutyRecord> {
  let record = await queryOne<DutyRecord>(
    'SELECT * FROM duty_records WHERE date = ?', [date]
  )
  if (!record) {
    const id = uuid()
    const now = Date.now()
    await executeRun(
      `INSERT INTO duty_records (id, date, created_at) VALUES (?, ?, ?)`,
      [id, date, now]
    )
    record = (await queryOne<DutyRecord>('SELECT * FROM duty_records WHERE id = ?', [id]))!
  }
  return record
}

// 获取值日记录
export async function getDutyRecord(date: string): Promise<DutyRecord | undefined> {
  return queryOne<DutyRecord>('SELECT * FROM duty_records WHERE date = ?', [date])
}

// 获取值日学生列表
export async function getDutyStudents(dutyRecordId: string): Promise<DutyStudent[]> {
  return queryAll<DutyStudent>(
    'SELECT * FROM duty_students WHERE duty_record_id = ?',
    [dutyRecordId]
  )
}

// 添加值日学生
export async function addDutyStudent(
  dutyRecordId: string,
  studentId: string,
  studentName: string
): Promise<void> {
  const existing = await queryOne<DutyStudent>(
    'SELECT * FROM duty_students WHERE duty_record_id = ? AND student_id = ?',
    [dutyRecordId, studentId]
  )
  if (existing) return // 已存在
  await executeRun(
    `INSERT INTO duty_students (id, duty_record_id, student_id, student_name)
     VALUES (?, ?, ?, ?)`,
    [uuid(), dutyRecordId, studentId, studentName]
  )
}

// 移除值日学生
export async function removeDutyStudent(dutyStudentId: string): Promise<void> {
  await executeRun('DELETE FROM duty_students WHERE id = ?', [dutyStudentId])
}

// 清空值日学生
export async function clearDutyStudents(dutyRecordId: string): Promise<void> {
  await executeRun('DELETE FROM duty_students WHERE duty_record_id = ?', [dutyRecordId])
}

// 开启签到窗口
export async function openSignInWindow(date: string): Promise<DutyRecord> {
  const record = await getOrCreateDutyRecord(date)
  const now = Date.now()
  await executeRun(
    'UPDATE duty_records SET sign_in_window_start = ?, sign_in_window_end = NULL, sign_out_window_start = NULL, sign_out_window_end = NULL, countdown_started_at = NULL WHERE id = ?',
    [now, record.id]
  )
  return (await getDutyRecord(date))!
}

// 结束签到 → 开始倒计时
export async function closeSignInStartCountdown(date: string): Promise<DutyRecord> {
  const record = await getOrCreateDutyRecord(date)
  const now = Date.now()
  await executeRun(
    'UPDATE duty_records SET sign_in_window_end = ?, countdown_started_at = ? WHERE id = ?',
    [now, now, record.id]
  )
  return (await getDutyRecord(date))!
}

// 开启签退窗口
export async function openSignOutWindow(date: string): Promise<DutyRecord> {
  const record = await getOrCreateDutyRecord(date)
  const now = Date.now()
  await executeRun(
    'UPDATE duty_records SET sign_out_window_start = ? WHERE id = ?',
    [now, record.id]
  )
  return (await getDutyRecord(date))!
}

// 关闭签退窗口
export async function closeSignOutWindow(date: string): Promise<DutyRecord> {
  const record = await getOrCreateDutyRecord(date)
  const now = Date.now()
  await executeRun(
    'UPDATE duty_records SET sign_out_window_end = ? WHERE id = ?',
    [now, record.id]
  )
  return (await getDutyRecord(date))!
}

// 学生签到
export async function studentSignIn(dutyStudentId: string): Promise<void> {
  const now = Date.now()
  await executeRun(
    'UPDATE duty_students SET sign_in_time = ? WHERE id = ?',
    [now, dutyStudentId]
  )
}

// 学生签退
export async function studentSignOut(dutyStudentId: string): Promise<void> {
  const now = Date.now()
  await executeRun(
    'UPDATE duty_students SET sign_out_time = ? WHERE id = ?',
    [now, dutyStudentId]
  )
}

// 执行未签退扣分
export async function applyPenalty(
  dutyRecordId: string,
  date: string
): Promise<{ name: string; penalty: number }[]> {
  const students = await getDutyStudents(dutyRecordId)
  const penalties: { name: string; penalty: number }[] = []

  const ops: { sql: string; params: unknown[] }[] = []
  const now = Date.now()

  for (const ds of students) {
    if (!ds.sign_out_time && !ds.penalty_applied) {
      // 扣1分：写入 manual_offset + 扣分记录
      ops.push({
        sql: 'UPDATE students SET manual_offset = manual_offset - 1, updated_at = ? WHERE id = ?',
        params: [now, ds.student_id],
      })
      ops.push({
        sql: `INSERT INTO deduction_records (id, student_id, student_name, points, reason, date, timestamp)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [uuid(), ds.student_id, ds.student_name, 1, '值日未签退', date, now],
      })
      ops.push({
        sql: 'UPDATE duty_students SET penalty_applied = 1 WHERE id = ?',
        params: [ds.id],
      })
      penalties.push({ name: ds.student_name, penalty: 1 })
    }
  }

  if (ops.length > 0) {
    await executeTransaction(ops)
  }

  return penalties
}
