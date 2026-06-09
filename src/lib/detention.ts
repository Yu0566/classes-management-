import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun, executeTransaction } from './db'
import type { DetentionRecord, DetentionStudent } from '@/types'

export const DETENTION_DURATION_MINUTES = 30
export const SIGN_IN_WINDOW_SECONDS = 90

async function ensureTables(): Promise<void> {
  await executeRun(`CREATE TABLE IF NOT EXISTS detention_records (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    countdown_started_at INTEGER,
    sign_in_window_start INTEGER,
    sign_in_window_end INTEGER,
    created_at INTEGER
  )`)
  await executeRun(`CREATE TABLE IF NOT EXISTS detention_students (
    id TEXT PRIMARY KEY,
    detention_record_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    sign_in_time INTEGER,
    penalty_applied INTEGER DEFAULT 0
  )`)
}

export async function getOrCreateDetentionRecord(date: string): Promise<DetentionRecord> {
  await ensureTables()
  let record = await queryOne<DetentionRecord>(
    'SELECT * FROM detention_records WHERE date = ?', [date]
  )
  if (!record) {
    const id = uuid()
    await executeRun(
      'INSERT INTO detention_records (id, date, created_at) VALUES (?, ?, ?)',
      [id, date, Date.now()]
    )
    record = (await queryOne<DetentionRecord>('SELECT * FROM detention_records WHERE id = ?', [id]))!
  }
  return record
}

export async function getDetentionRecord(date: string): Promise<DetentionRecord | undefined> {
  return queryOne<DetentionRecord>('SELECT * FROM detention_records WHERE date = ?', [date])
}

export async function getDetentionStudents(recordId: string): Promise<DetentionStudent[]> {
  return queryAll<DetentionStudent>(
    'SELECT * FROM detention_students WHERE detention_record_id = ?', [recordId]
  )
}

export async function addDetentionStudent(
  recordId: string, studentId: string, studentName: string
): Promise<void> {
  await executeRun(
    `INSERT OR IGNORE INTO detention_students (id, detention_record_id, student_id, student_name)
     VALUES (?, ?, ?, ?)`,
    [uuid(), recordId, studentId, studentName]
  )
}

export async function removeDetentionStudent(id: string): Promise<void> {
  await executeRun('DELETE FROM detention_students WHERE id = ?', [id])
}

export async function clearDetentionStudents(recordId: string): Promise<void> {
  await executeRun('DELETE FROM detention_students WHERE detention_record_id = ?', [recordId])
}

export async function startDetention(date: string): Promise<DetentionRecord> {
  const record = await getOrCreateDetentionRecord(date)
  await executeRun(
    `UPDATE detention_records
     SET countdown_started_at = ?,
         sign_in_window_start = NULL,
         sign_in_window_end = NULL
     WHERE id = ?`,
    [Date.now(), record.id]
  )
  return (await getDetentionRecord(date))!
}

export async function openSignInWindow(date: string): Promise<DetentionRecord> {
  const record = await getOrCreateDetentionRecord(date)
  await executeRun(
    `UPDATE detention_records
     SET sign_in_window_start = ?, sign_in_window_end = NULL
     WHERE id = ?`,
    [Date.now(), record.id]
  )
  return (await getDetentionRecord(date))!
}

export async function closeSignInWindow(date: string): Promise<DetentionRecord> {
  const record = await getOrCreateDetentionRecord(date)
  await executeRun(
    'UPDATE detention_records SET sign_in_window_end = ? WHERE id = ?',
    [Date.now(), record.id]
  )
  return (await getDetentionRecord(date))!
}

export async function studentSignIn(dsId: string): Promise<void> {
  await executeRun(
    'UPDATE detention_students SET sign_in_time = ? WHERE id = ?',
    [Date.now(), dsId]
  )
}

export async function applyPenalty(
  recordId: string, date: string, points: number = 1
): Promise<{ name: string; penalty: number }[]> {
  const students = await getDetentionStudents(recordId)
  const penalties: { name: string; penalty: number }[] = []

  for (const ds of students) {
    if (!ds.sign_in_time && !ds.penalty_applied) {
      const claim = await executeRun(
        'UPDATE detention_students SET penalty_applied = 1 WHERE id = ? AND penalty_applied = 0',
        [ds.id]
      )
      if (claim.changes === 0) continue

      const now = Date.now()
      try {
        await executeTransaction([
          {
            sql: 'UPDATE students SET manual_offset = manual_offset - ?, updated_at = ? WHERE id = ?',
            params: [points, now, ds.student_id],
          },
          {
            sql: `INSERT INTO deduction_records (id, student_id, student_name, points, reason, date, timestamp)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            params: [uuid(), ds.student_id, ds.student_name, points, '留堂未签到', date, now],
          },
        ])
        penalties.push({ name: ds.student_name, penalty: points })
      } catch (err) {
        console.error('[detention applyPenalty]', err)
        await executeRun(
          'UPDATE detention_students SET penalty_applied = 0 WHERE id = ?',
          [ds.id]
        )
      }
    }
  }

  return penalties
}

export async function clearDetentionTimers(recordId: string): Promise<void> {
  await executeRun(
    `UPDATE detention_records
     SET countdown_started_at = NULL, sign_in_window_start = NULL, sign_in_window_end = NULL
     WHERE id = ?`,
    [recordId]
  )
}

export async function resetDetentionRecord(date: string): Promise<void> {
  const record = await getDetentionRecord(date)
  if (!record) return

  const deductions = await queryAll<{ student_id: string; points: number }>(
    `SELECT student_id, points FROM deduction_records WHERE date = ? AND reason = '留堂未签到'`,
    [date]
  )
  for (const d of deductions) {
    await executeRun(
      'UPDATE students SET manual_offset = manual_offset + ?, updated_at = ? WHERE id = ?',
      [d.points, Date.now(), d.student_id]
    )
  }
  await executeRun(
    `DELETE FROM deduction_records WHERE date = ? AND reason = '留堂未签到'`,
    [date]
  )
  await executeRun(
    `UPDATE detention_records SET countdown_started_at = NULL, sign_in_window_start = NULL, sign_in_window_end = NULL WHERE id = ?`,
    [record.id]
  )
  await executeRun(
    'UPDATE detention_students SET sign_in_time = NULL, penalty_applied = 0 WHERE detention_record_id = ?',
    [record.id]
  )
}
