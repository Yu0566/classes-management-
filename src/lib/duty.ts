import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun, executeTransaction } from './db'
import type { DutyRecord, DutyStudent } from '@/types'

export const DUTY_DURATION_MINUTES = 20
export const SIGN_IN_WINDOW_SECONDS = 60
export const DUTY_PASSWORD = 'admin'

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

export async function getDutyRecord(date: string): Promise<DutyRecord | undefined> {
  return queryOne<DutyRecord>('SELECT * FROM duty_records WHERE date = ?', [date])
}

export async function getDutyStudents(dutyRecordId: string): Promise<DutyStudent[]> {
  return queryAll<DutyStudent>(
    'SELECT * FROM duty_students WHERE duty_record_id = ?',
    [dutyRecordId]
  )
}

export async function addDutyStudent(
  dutyRecordId: string, studentId: string, studentName: string
): Promise<void> {
  const existing = await queryOne<DutyStudent>(
    'SELECT * FROM duty_students WHERE duty_record_id = ? AND student_id = ?',
    [dutyRecordId, studentId]
  )
  if (existing) return
  await executeRun(
    `INSERT INTO duty_students (id, duty_record_id, student_id, student_name)
     VALUES (?, ?, ?, ?)`,
    [uuid(), dutyRecordId, studentId, studentName]
  )
}

export async function removeDutyStudent(dutyStudentId: string): Promise<void> {
  await executeRun('DELETE FROM duty_students WHERE id = ?', [dutyStudentId])
}

export async function clearDutyStudents(dutyRecordId: string): Promise<void> {
  await executeRun('DELETE FROM duty_students WHERE duty_record_id = ?', [dutyRecordId])
}

// 开始值日（开启倒计时）
export async function startDuty(date: string): Promise<DutyRecord> {
  const record = await getOrCreateDutyRecord(date)
  const now = Date.now()
  await executeRun(
    `UPDATE duty_records
     SET countdown_started_at = ?,
         sign_in_window_start = NULL,
         sign_in_window_end = NULL,
         sign_out_window_start = NULL,
         sign_out_window_end = NULL
     WHERE id = ?`,
    [now, record.id]
  )
  return (await getDutyRecord(date))!
}

// 强制结束倒计时（密码验证在UI层）
export async function forceEndCountdown(date: string): Promise<DutyRecord> {
  const record = await getOrCreateDutyRecord(date)
  const now = Date.now()
  // 把 countdown_started_at 设为很久以前，让倒计时立即归零
  const countdownMs = DUTY_DURATION_MINUTES * 60 * 1000
  await executeRun(
    'UPDATE duty_records SET countdown_started_at = ? WHERE id = ?',
    [now - countdownMs, record.id]
  )
  return (await getDutyRecord(date))!
}

// 开启签到窗口（倒计时结束后自动或手动开启）
export async function openSignInWindow(date: string): Promise<DutyRecord> {
  const record = await getOrCreateDutyRecord(date)
  const now = Date.now()
  await executeRun(
    `UPDATE duty_records
     SET sign_in_window_start = ?,
         sign_in_window_end = NULL
     WHERE id = ?`,
    [now, record.id]
  )
  return (await getDutyRecord(date))!
}

// 关闭签到窗口
export async function closeSignInWindow(date: string): Promise<DutyRecord> {
  const record = await getOrCreateDutyRecord(date)
  const now = Date.now()
  await executeRun(
    'UPDATE duty_records SET sign_in_window_end = ? WHERE id = ?',
    [now, record.id]
  )
  return (await getDutyRecord(date))!
}

// 学生签到（立即写入数据库，数据不丢失）
export async function studentSignIn(dutyStudentId: string): Promise<void> {
  const now = Date.now()
  await executeRun(
    'UPDATE duty_students SET sign_in_time = ? WHERE id = ?',
    [now, dutyStudentId]
  )
}

// 执行未签到扣分
export async function applyPenalty(
  dutyRecordId: string, date: string
): Promise<{ name: string; penalty: number }[]> {
  const students = await getDutyStudents(dutyRecordId)
  const penalties: { name: string; penalty: number }[] = []

  const ops: { sql: string; params: unknown[] }[] = []
  const now = Date.now()

  for (const ds of students) {
    if (!ds.sign_in_time && !ds.penalty_applied) {
      ops.push({
        sql: 'UPDATE students SET manual_offset = manual_offset - 1, updated_at = ? WHERE id = ?',
        params: [now, ds.student_id],
      })
      ops.push({
        sql: `INSERT INTO deduction_records (id, student_id, student_name, points, reason, date, timestamp)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [uuid(), ds.student_id, ds.student_name, 1, '值日未签到', date, now],
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

// 自动根据考勤迟到和作业未交/未交齐生成值日名单
export async function autoAssignDutyStudents(date: string): Promise<{
  added: { name: string; reason: string }[]
}> {
  const record = await getOrCreateDutyRecord(date)
  const existingStudents = await getDutyStudents(record.id)
  const existingIds = new Set(existingStudents.map(ds => ds.student_id))

  const rows = await queryAll<{
    id: string; name: string; attendance: string; homework: string;
  }>(
    `SELECT s.id, s.name,
            COALESCE(ds.attendance, 'normal') as attendance,
            COALESCE(ds.homework, 'complete') as homework
     FROM students s
     LEFT JOIN daily_statuses ds ON ds.student_id = s.id AND ds.date = ?
     ORDER BY s.name`,
    [date]
  )

  const added: { name: string; reason: string }[] = []

  for (const row of rows) {
    if (existingIds.has(row.id)) continue

    let reason = ''
    if (row.attendance === 'late') {
      reason = '考勤迟到'
    } else if ((row.homework === 'incomplete' || row.homework === 'not_submitted') && row.attendance !== 'leave') {
      reason = row.homework === 'not_submitted' ? '作业未交' : '作业未交齐'
    }

    if (reason) {
      await addDutyStudent(record.id, row.id, row.name)
      added.push({ name: row.name, reason })
    }
  }

  return { added }
}

// 测试用：重置值日状态（删除记录和名单，回到idle状态）
export async function resetDutyRecord(date: string): Promise<void> {
  const record = await getDutyRecord(date)
  if (!record) return
  await executeRun('DELETE FROM duty_students WHERE duty_record_id = ?', [record.id])
  await executeRun('DELETE FROM duty_records WHERE id = ?', [record.id])
}
