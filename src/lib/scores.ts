import type { StudentWithGroup, DailyStatus } from '@/types'
import { executeRun } from './db'

// 各分类中哪些状态值算违规（用于积分计算和扣分）
const VIOLATION_STATUSES: Record<string, string[]> = {
  daily_practice: ['unsigned'],
  attendance: ['unsigned', 'late'],
  homework: ['incomplete', 'not_submitted'],
}

// 考勤缺勤状态——这些状态下学生不在校，不叠加每日一练扣分
const ATTENDANCE_ABSENT = new Set(['unsigned', 'leave'])

// 计算单个学生的积分明细
export function calculateStudentScore(
  student: StudentWithGroup,
  statuses: DailyStatus[],
  enabledCategories?: Set<string>,
  categoryPoints?: Map<string, number>
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
  const getPoints = (cat: string) => categoryPoints?.get(cat) ?? 1

  for (const s of statuses) {
    // 每日一练：仅有 practice_label 的学生参与；缺勤（unsigned/leave）时不扣
    if (enabled.has('daily_practice') && student.practice_label
        && !ATTENDANCE_ABSENT.has(s.attendance)
        && VIOLATION_STATUSES.daily_practice.includes(s.daily_practice)) {
      dailyPractice -= getPoints('daily_practice')
    }
    if (enabled.has('attendance') && VIOLATION_STATUSES.attendance.includes(s.attendance)) {
      attendance -= getPoints('attendance')
    }
    if (enabled.has('homework') && VIOLATION_STATUSES.homework.includes(s.homework)) {
      homework -= getPoints('homework')
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
  enabledCategories?: Set<string>,
  categoryPoints?: Map<string, number>
): StudentScore[] {
  return students.map(student => {
    const statuses = statusMap.get(student.id) || []
    const detail = calculateStudentScore(student, statuses, enabledCategories, categoryPoints)
    return {
      studentId: student.id,
      studentName: student.name,
      groupName: student.group_name || '未分组',
      ...detail,
      statusCount: new Set(statuses.map(s => s.date)).size,
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
