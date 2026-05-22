import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun, executeTransaction } from './db'
import type { DailyStatus } from '@/types'

// 获取指定日期的所有学生状态
export async function getDailyStatuses(date: string): Promise<DailyStatus[]> {
  return queryAll<DailyStatus>(
    'SELECT * FROM daily_statuses WHERE date = ?',
    [date]
  )
}

// 获取单个学生的每日状态
export async function getStudentDailyStatus(
  studentId: string,
  date: string
): Promise<DailyStatus | undefined> {
  return queryOne<DailyStatus>(
    'SELECT * FROM daily_statuses WHERE student_id = ? AND date = ?',
    [studentId, date]
  )
}

// 获取学生在日期范围内的所有状态
export async function getStudentStatusRange(
  studentId: string,
  startDate: string,
  endDate: string
): Promise<DailyStatus[]> {
  return queryAll<DailyStatus>(
    'SELECT * FROM daily_statuses WHERE student_id = ? AND date >= ? AND date <= ? ORDER BY date',
    [studentId, startDate, endDate]
  )
}

// 更新或插入学生的每日状态
export async function upsertDailyStatus(
  studentId: string,
  date: string,
  field: StatusField,
  value: string
): Promise<void> {
  const existing = await getStudentDailyStatus(studentId, date)

  if (existing) {
    await executeRun(
      `UPDATE daily_statuses SET ${field} = ?, updated_at = ? WHERE id = ?`,
      [value, Date.now(), existing.id]
    )
  } else {
    const id = uuid()
    const now = Date.now()
    await executeRun(
      `INSERT INTO daily_statuses (id, student_id, date, ${field}, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, studentId, date, value, now, now]
    )
  }
}

// 批量设置为默认状态（初始化某天的全部学生状态）
export async function initDailyStatuses(
  students: { id: string }[],
  date: string
): Promise<void> {
  const existingIds = new Set(
    (await getDailyStatuses(date)).map(s => s.student_id)
  )

  const ops: { sql: string; params?: unknown[] }[] = []
  const now = Date.now()

  for (const student of students) {
    if (!existingIds.has(student.id)) {
      ops.push({
        sql: `INSERT INTO daily_statuses (id, student_id, date, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)`,
        params: [uuid(), student.id, date, now, now],
      })
    }
  }

  if (ops.length > 0) {
    await executeTransaction(ops)
  }
}

// 循环切换状态值的辅助
export function cycleStatus(current: string, options: string[]): string {
  const idx = options.indexOf(current)
  return options[(idx + 1) % options.length]
}

export type StatusField = 'daily_practice' | 'attendance' | 'homework' | 'lunch_rest'

// 各项状态的循环选项
export const STATUS_CYCLES: Record<StatusField, string[]> = {
  daily_practice: ['unsigned', 'signed', 'not_applicable'],
  attendance: ['signed', 'unsigned', 'late', 'leave'],
  homework: ['not_submitted', 'incomplete', 'complete'],
  lunch_rest: ['normal', 'violation', 'absent'],
}

// 状态显示标签
export const STATUS_LABELS: Record<StatusField, Record<string, string>> = {
  daily_practice: {
    signed: '已签', unsigned: '未签', not_applicable: '不参与',
  },
  attendance: {
    signed: '已签到', unsigned: '未签到', late: '迟到', leave: '请假',
  },
  homework: {
    complete: '已交齐', incomplete: '未交齐', not_submitted: '未交',
  },
  lunch_rest: {
    normal: '正常', violation: '违纪', absent: '缺席',
  },
}

// 状态颜色
export const STATUS_COLORS: Record<StatusField, Record<string, string>> = {
  daily_practice: {
    signed: 'bg-green-100 text-green-700', unsigned: 'bg-red-100 text-red-700', not_applicable: 'bg-gray-100 text-gray-500',
  },
  attendance: {
    signed: 'bg-green-100 text-green-700', unsigned: 'bg-gray-100 text-gray-500',
    late: 'bg-yellow-100 text-yellow-700', leave: 'bg-blue-100 text-blue-700',
  },
  homework: {
    complete: 'bg-green-100 text-green-700', incomplete: 'bg-yellow-100 text-yellow-700',
    not_submitted: 'bg-red-100 text-red-700',
  },
  lunch_rest: {
    normal: 'bg-green-100 text-green-700', violation: 'bg-red-100 text-red-700',
    absent: 'bg-gray-100 text-gray-500',
  },
}
