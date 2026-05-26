import type { StudentWithGroup, DailyStatus } from '@/types'
import { executeRun } from './db'

// 积分规则
const SCORE_RULES = {
  daily_practice: { signed: 0, unsigned: -1, not_applicable: 0 },
  attendance: { signed: 0, unsigned: -1, late: -1, leave: 0 },
  homework: { complete: 0, incomplete: -1, not_submitted: -1 },
}

// 计算单个学生的积分明细
export function calculateStudentScore(
  student: StudentWithGroup,
  statuses: DailyStatus[],
  enabledCategories?: Set<string>
): {
  total: number
  dailyPractice: number
  attendance: number
  homework: number
  manualOffset: number
} {
  let dailyPractice = 0
  let attendance = 0
  let homework = 0

  const enabled = enabledCategories ?? new Set(['daily_practice', 'attendance', 'homework'])

  for (const s of statuses) {
    if (enabled.has('daily_practice')) {
      dailyPractice += SCORE_RULES.daily_practice[s.daily_practice as keyof typeof SCORE_RULES.daily_practice] || 0
    }
    if (enabled.has('attendance')) {
      attendance += SCORE_RULES.attendance[s.attendance as keyof typeof SCORE_RULES.attendance] || 0
    }
    if (enabled.has('homework')) {
      homework += SCORE_RULES.homework[s.homework as keyof typeof SCORE_RULES.homework] || 0
    }
  }

  const manualOffset = student.manual_offset || 0
  const total = dailyPractice + attendance + homework + manualOffset

  return { total, dailyPractice, attendance, homework, manualOffset }
}

// 计算所有学生的积分
export interface StudentScore {
  studentId: string
  studentName: string
  groupName: string
  total: number
  dailyPractice: number
  attendance: number
  homework: number
  manualOffset: number
  statusCount: number
}

export function calculateAllScores(
  students: StudentWithGroup[],
  statusMap: Map<string, DailyStatus[]>,
  enabledCategories?: Set<string>
): StudentScore[] {
  return students.map(student => {
    const statuses = statusMap.get(student.id) || []
    const detail = calculateStudentScore(student, statuses, enabledCategories)
    return {
      studentId: student.id,
      studentName: student.name,
      groupName: student.group_name || '未分组',
      ...detail,
      statusCount: statuses.length,
    }
  })
}

// 积分清零：重置所有学生 manual_offset，清空 daily_statuses、deduction_records、manual_adjust_records
export async function resetAllScores(): Promise<void> {
  await executeRun('UPDATE students SET manual_offset = 0, updated_at = ?', [Date.now()])
  await executeRun('DELETE FROM daily_statuses')
  await executeRun('DELETE FROM deduction_records')
  await executeRun('DELETE FROM manual_adjust_records')
}
