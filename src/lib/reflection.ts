import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun, executeTransaction } from './db'
import type { ReflectionRecord, ReflectionStudent } from '@/types'

export const SIGN_IN_WINDOW_SECONDS = 90

async function ensureTables(): Promise<void> {
  await executeRun(`CREATE TABLE IF NOT EXISTS reflection_records (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    group_id TEXT NOT NULL,
    group_name TEXT NOT NULL DEFAULT '',
    countdown_started_at INTEGER,
    sign_in_window_start INTEGER,
    sign_in_window_end INTEGER,
    created_at INTEGER
  )`)
  await executeRun(`CREATE TABLE IF NOT EXISTS reflection_students (
    id TEXT PRIMARY KEY,
    reflection_record_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    sign_in_time INTEGER,
    penalty_applied INTEGER DEFAULT 0,
    group_id TEXT
  )`)

  // 先清理重复，再创建唯一索引
  // 注意：必须先删属于重复 record 的 students（外键约束），再删 records
  await executeRun(`DELETE FROM reflection_students WHERE reflection_record_id IN (SELECT id FROM reflection_records WHERE id NOT IN (SELECT MIN(id) FROM reflection_records GROUP BY date, group_id))`)
  await executeRun(`DELETE FROM reflection_records WHERE id NOT IN (SELECT MIN(id) FROM reflection_records GROUP BY date, group_id)`)
  await executeRun(`DELETE FROM reflection_students WHERE reflection_record_id NOT IN (SELECT id FROM reflection_records)`)
  await executeRun(`DELETE FROM reflection_students WHERE id NOT IN (SELECT MIN(id) FROM reflection_students GROUP BY reflection_record_id, student_id)`)
  await executeRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_reflection_records_date_group ON reflection_records(date, group_id)')
  await executeRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_reflection_students_unique ON reflection_students(reflection_record_id, student_id)')
}

export async function getOrCreateRecord(date: string, groupId: string, groupName: string): Promise<ReflectionRecord> {
  await ensureTables()
  // 尝试 INSERT OR IGNORE — 唯一索引存在时防止重复，不存在时也能正常插入
  const id = uuid()
  await executeRun(
    `INSERT OR IGNORE INTO reflection_records (id, date, group_id, group_name, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, date, groupId, groupName, Date.now()]
  )
  // 取回实际记录（无论是本次插入的还是已存在的）
  const record = await queryOne<ReflectionRecord>(
    'SELECT * FROM reflection_records WHERE date = ? AND group_id = ?', [date, groupId]
  )
  if (!record) throw new Error('无法创建或获取 reflection_records')
  return record
}

export async function getRecord(date: string, groupId: string): Promise<ReflectionRecord | undefined> {
  return queryOne<ReflectionRecord>(
    'SELECT * FROM reflection_records WHERE date = ? AND group_id = ?', [date, groupId]
  )
}

export async function getRecordsByDate(date: string): Promise<ReflectionRecord[]> {
  return queryAll<ReflectionRecord>(
    'SELECT * FROM reflection_records WHERE date = ?', [date]
  )
}

export async function getReflectionStudents(recordId: string, groupId?: string): Promise<ReflectionStudent[]> {
  if (groupId) {
    return queryAll<ReflectionStudent>(
      'SELECT * FROM reflection_students WHERE reflection_record_id = ? AND group_id = ? ORDER BY student_name',
      [recordId, groupId]
    )
  }
  return queryAll<ReflectionStudent>(
    'SELECT * FROM reflection_students WHERE reflection_record_id = ? ORDER BY student_name', [recordId]
  )
}

export async function addReflectionStudent(
  recordId: string, studentId: string, studentName: string, groupId?: string
): Promise<void> {
  await executeRun(
    `INSERT OR IGNORE INTO reflection_students (id, reflection_record_id, student_id, student_name, group_id)
     VALUES (?, ?, ?, ?, ?)`,
    [uuid(), recordId, studentId, studentName, groupId || null]
  )
}

export async function addReflectionGroup(
  recordId: string, groupId: string, groupName: string
): Promise<{ added: number; names: string[] }> {
  const students = await queryAll<{ id: string; name: string }>(
    'SELECT id, name FROM students WHERE group_id = ? ORDER BY sort_order', [groupId]
  )
  const names: string[] = []
  for (const s of students) {
    await addReflectionStudent(recordId, s.id, s.name, groupId)
    names.push(s.name)
  }
  return { added: students.length, names }
}

export async function removeReflectionStudent(id: string): Promise<void> {
  await executeRun('DELETE FROM reflection_students WHERE id = ?', [id])
}

export async function clearReflectionStudents(recordId: string, groupId?: string): Promise<void> {
  if (groupId) {
    await executeRun('DELETE FROM reflection_students WHERE reflection_record_id = ? AND group_id = ?', [recordId, groupId])
  } else {
    await executeRun('DELETE FROM reflection_students WHERE reflection_record_id = ?', [recordId])
  }
}

export async function startReflection(date: string, groupId: string): Promise<ReflectionRecord> {
  const record = await getRecord(date, groupId)
  if (!record) throw new Error('记录不存在')
  await executeRun(
    `UPDATE reflection_records
     SET countdown_started_at = ?, sign_in_window_start = NULL, sign_in_window_end = NULL
     WHERE id = ?`,
    [Date.now(), record.id]
  )
  return (await getRecord(date, groupId))!
}

export async function openSignInWindow(date: string, groupId: string): Promise<ReflectionRecord> {
  const record = await getRecord(date, groupId)
  if (!record) throw new Error('记录不存在')
  await executeRun(
    `UPDATE reflection_records
     SET sign_in_window_start = ?, sign_in_window_end = NULL
     WHERE id = ?`,
    [Date.now(), record.id]
  )
  return (await getRecord(date, groupId))!
}

export async function closeSignInWindow(date: string, groupId: string): Promise<ReflectionRecord> {
  const record = await getRecord(date, groupId)
  if (!record) throw new Error('记录不存在')
  await executeRun(
    'UPDATE reflection_records SET sign_in_window_end = ? WHERE id = ?',
    [Date.now(), record.id]
  )
  return (await getRecord(date, groupId))!
}

export async function studentSignIn(rsId: string): Promise<void> {
  await executeRun(
    'UPDATE reflection_students SET sign_in_time = ? WHERE id = ?',
    [Date.now(), rsId]
  )
}

export async function applyPenalty(
  recordId: string, date: string, points: number = 2, groupId?: string
): Promise<{ name: string; penalty: number }[]> {
  const students = await getReflectionStudents(recordId, groupId)
  const penalties: { name: string; penalty: number }[] = []

  for (const rs of students) {
    if (!rs.sign_in_time && !rs.penalty_applied) {
      const claim = await executeRun(
        'UPDATE reflection_students SET penalty_applied = 1 WHERE id = ? AND penalty_applied = 0',
        [rs.id]
      )
      if (claim.changes === 0) continue

      const now = Date.now()
      try {
        await executeTransaction([
          {
            sql: 'UPDATE students SET manual_offset = manual_offset - ?, updated_at = ? WHERE id = ?',
            params: [points, now, rs.student_id],
          },
          {
            sql: `INSERT INTO deduction_records (id, student_id, student_name, points, reason, date, timestamp)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            params: [uuid(), rs.student_id, rs.student_name, points, '小组团建未签到', date, now],
          },
        ])
        penalties.push({ name: rs.student_name, penalty: points })
      } catch (err) {
        console.error('[reflection applyPenalty]', err)
        await executeRun(
          'UPDATE reflection_students SET penalty_applied = 0 WHERE id = ?',
          [rs.id]
        )
      }
    }
  }

  return penalties
}

export async function clearReflectionTimers(recordId: string): Promise<void> {
  await executeRun(
    `UPDATE reflection_records
     SET countdown_started_at = NULL, sign_in_window_start = NULL, sign_in_window_end = NULL
     WHERE id = ?`,
    [recordId]
  )
}

/** 重置指定组的小组团建（撤销扣分、清空签到） */
export async function resetReflectionRecord(date: string, groupId: string): Promise<void> {
  const record = await getRecord(date, groupId)
  if (!record) return

  const deductions = await queryAll<{ student_id: string; points: number }>(
    `SELECT student_id, points FROM deduction_records WHERE date = ? AND reason = '小组团建未签到'`,
    [date]
  )
  for (const d of deductions) {
    await executeRun(
      'UPDATE students SET manual_offset = manual_offset + ?, updated_at = ? WHERE id = ?',
      [d.points, Date.now(), d.student_id]
    )
  }
  await executeRun(
    `DELETE FROM deduction_records WHERE date = ? AND reason = '小组团建未签到'`,
    [date]
  )
  await clearReflectionTimers(record.id)
  await executeRun(
    'UPDATE reflection_students SET sign_in_time = NULL, penalty_applied = 0 WHERE reflection_record_id = ?',
    [record.id]
  )
}

/** 删除指定组的小组团建记录（仅在 idle 状态可用，无扣分记录） */
export async function deleteReflectionRecord(date: string, groupId: string): Promise<void> {
  const record = await getRecord(date, groupId)
  if (!record) return
  await executeRun('DELETE FROM reflection_students WHERE reflection_record_id = ?', [record.id])
  await executeRun('DELETE FROM reflection_records WHERE id = ?', [record.id])
}

/** 重置当天所有组的小组团建 */
export async function resetAllReflectionRecords(date: string): Promise<void> {
  const records = await getRecordsByDate(date)
  for (const r of records) {
    await clearReflectionTimers(r.id)
    await executeRun(
      'UPDATE reflection_students SET sign_in_time = NULL, penalty_applied = 0 WHERE reflection_record_id = ?',
      [r.id]
    )
  }
  const deductions = await queryAll<{ student_id: string; points: number }>(
    `SELECT student_id, points FROM deduction_records WHERE date = ? AND reason = '小组团建未签到'`,
    [date]
  )
  for (const d of deductions) {
    await executeRun(
      'UPDATE students SET manual_offset = manual_offset + ?, updated_at = ? WHERE id = ?',
      [d.points, Date.now(), d.student_id]
    )
  }
  await executeRun(
    `DELETE FROM deduction_records WHERE date = ? AND reason = '小组团建未签到'`,
    [date]
  )
}
