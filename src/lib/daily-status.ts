import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun, executeTransaction } from './db'
import type { DailyStatus } from '@/types'

// 违规扣分规则：哪些状态值触发自动扣分
const VIOLATION_RULES: Record<string, Record<string, { points: number; reason: string }>> = {
  daily_practice: { unsigned: { points: -1, reason: '每日一练未签到' } },
  attendance: { late: { points: -1, reason: '考勤迟到' }, absent: { points: -1, reason: '考勤未签到' } },
  homework: { incomplete: { points: -1, reason: '作业未交齐' }, not_submitted: { points: -1, reason: '作业未交' } },
  lunch_rest: {},
}

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

// 更新或插入学生的每日状态，并自动同步扣分记录
export async function upsertDailyStatus(
  studentId: string,
  date: string,
  field: StatusField,
  value: string
): Promise<void> {
  const existing = await getStudentDailyStatus(studentId, date)
  const oldValue = existing ? (existing[field] || '') : ''

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

  // 同步违规扣分记录
  await syncViolationRecord(studentId, date, field, oldValue, value)
}

async function syncViolationRecord(
  studentId: string, date: string, field: string,
  oldValue: string, newValue: string
): Promise<void> {
  const rules = VIOLATION_RULES[field]
  if (!rules) return

  const oldViolation = rules[oldValue]
  const newViolation = rules[newValue]

  // 没变化就不处理
  if (oldValue === newValue) return

  // 删除旧的违规记录
  if (oldViolation) {
    await executeRun(
      'DELETE FROM deduction_records WHERE student_id = ? AND date = ? AND reason = ?',
      [studentId, date, oldViolation.reason]
    )
  }

  // 插入新的违规记录
  if (newViolation) {
    const student = await queryOne<{ name: string }>(
      'SELECT name FROM students WHERE id = ?', [studentId]
    )
    const studentName = student?.name || studentId
    await executeRun(
      `INSERT INTO deduction_records (id, student_id, student_name, points, reason, date, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), studentId, studentName, Math.abs(newViolation.points), newViolation.reason, date, Date.now()]
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
  lunch_rest: ['unsigned', 'signed', 'leave'],
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
    unsigned: '未设置', signed: '签到', leave: '请假', normal: '正常', violation: '违纪', absent: '缺席',
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
    unsigned: 'bg-gray-100 text-gray-500', signed: 'bg-green-100 text-green-700', leave: 'bg-yellow-100 text-yellow-700',
    normal: 'bg-green-100 text-green-700', violation: 'bg-red-100 text-red-700',
    absent: 'bg-gray-100 text-gray-500',
  },
}
