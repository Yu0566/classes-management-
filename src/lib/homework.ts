import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun, executeTransaction } from './db'

const ALL_SUBJECTS = ['语文', '数学', '英语', '历史', '道法', '生物', '地理', '物理', '化学']
const DEFAULT_SELECTED = ['语文', '数学', '英语']

export type HomeworkStatus = 'complete' | 'incomplete' | 'partial'

export interface HomeworkRecord {
  id: string
  student_id: string
  date: string
  subject: string
  status: HomeworkStatus
  updated_at: number
}

export interface HomeworkRecordWithStudent extends HomeworkRecord {
  student_name: string
  group_name: string
  group_id: string
}

// 获取某天的科目设置
export async function getDailySubjects(date: string): Promise<string[]> {
  const row = await queryOne<{ subjects: string }>(
    'SELECT subjects FROM homework_daily WHERE date = ?', [date]
  )
  if (!row) {
    // 自动创建当天的默认科目
    const now = Date.now()
    await executeRun(
      'INSERT INTO homework_daily (id, date, subjects, created_at) VALUES (?, ?, ?, ?)',
      [uuid(), date, JSON.stringify(DEFAULT_SELECTED), now]
    )
    return [...DEFAULT_SELECTED]
  }
  return JSON.parse(row.subjects)
}

// 设置某天的科目
export async function setDailySubjects(date: string, subjects: string[]): Promise<void> {
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM homework_daily WHERE date = ?', [date]
  )
  if (row) {
    await executeRun(
      'UPDATE homework_daily SET subjects = ? WHERE date = ?',
      [JSON.stringify(subjects), date]
    )
  } else {
    await executeRun(
      'INSERT INTO homework_daily (id, date, subjects, created_at) VALUES (?, ?, ?, ?)',
      [uuid(), date, JSON.stringify(subjects), Date.now()]
    )
  }
}

// 获取某天所有学生的作业记录（带学生信息）
export async function getRecordsByDate(date: string): Promise<HomeworkRecordWithStudent[]> {
  return queryAll<HomeworkRecordWithStudent>(
    `SELECT hr.*, s.name as student_name, COALESCE(g.name, '') as group_name, s.group_id
     FROM homework_records hr
     JOIN students s ON s.id = hr.student_id
     LEFT JOIN groups g ON g.id = s.group_id
     WHERE hr.date = ?
     ORDER BY g.sort_order, s.sort_order, s.name`,
    [date]
  )
}

// 获取某天某个学生的所有科目记录
export async function getStudentRecords(
  studentId: string, date: string
): Promise<HomeworkRecord[]> {
  return queryAll<HomeworkRecord>(
    'SELECT * FROM homework_records WHERE student_id = ? AND date = ?',
    [studentId, date]
  )
}

// 设置学生某科目的作业状态
export async function setHomeworkStatus(
  studentId: string,
  date: string,
  subject: string,
  status: HomeworkStatus
): Promise<void> {
  const existing = await queryOne<HomeworkRecord>(
    'SELECT * FROM homework_records WHERE student_id = ? AND date = ? AND subject = ?',
    [studentId, date, subject]
  )

  if (status === 'complete') {
    // 交齐则删除记录（默认就是交齐）
    if (existing) {
      await executeRun('DELETE FROM homework_records WHERE id = ?', [existing.id])
    }
  } else {
    const now = Date.now()
    if (existing) {
      await executeRun(
        'UPDATE homework_records SET status = ?, updated_at = ? WHERE id = ?',
        [status, now, existing.id]
      )
    } else {
      await executeRun(
        `INSERT INTO homework_records (id, student_id, date, subject, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuid(), studentId, date, subject, status, now]
      )
    }
  }
}

// 获取所有有记录的历史日期
export async function getRecordDates(): Promise<string[]> {
  const rows = await queryAll<{ date: string }>(
    'SELECT DISTINCT date FROM homework_records ORDER BY date DESC LIMIT 60'
  )
  return rows.map(r => r.date)
}

// 获取未交历史（可按学生筛选）
export async function getUnsubmittedHistory(opts?: {
  studentId?: string
  startDate?: string
  endDate?: string
}): Promise<HomeworkRecordWithStudent[]> {
  const conditions: string[] = []
  const params: unknown[] = []

  if (opts?.studentId) {
    conditions.push('hr.student_id = ?')
    params.push(opts.studentId)
  }
  if (opts?.startDate) {
    conditions.push('hr.date >= ?')
    params.push(opts.startDate)
  }
  if (opts?.endDate) {
    conditions.push('hr.date <= ?')
    params.push(opts.endDate)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  return queryAll<HomeworkRecordWithStudent>(
    `SELECT hr.*, s.name as student_name, COALESCE(g.name, '') as group_name, s.group_id
     FROM homework_records hr
     JOIN students s ON s.id = hr.student_id
     LEFT JOIN groups g ON g.id = s.group_id
     ${where}
     ORDER BY hr.date DESC, g.sort_order, s.name`,
    params
  )
}
