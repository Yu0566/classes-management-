import type { StudentWithGroup, DailyStatus } from '@/types'

// 积分规则
const SCORE_RULES = {
  daily_practice: { signed: 0, unsigned: -1, not_applicable: 0 },
  attendance: { normal: 0, late: -1, absent: -2, leave: 0 },
  homework: { complete: 0, incomplete: -1, not_submitted: -1 },
  lunch_rest: { normal: 0, violation: -1, absent: -1 },
}

// 计算单个学生的积分明细
export function calculateStudentScore(
  student: StudentWithGroup,
  statuses: DailyStatus[]
): {
  total: number
  dailyPractice: number
  attendance: number
  homework: number
  lunchRest: number
  manualOffset: number
} {
  let dailyPractice = 0
  let attendance = 0
  let homework = 0
  let lunchRest = 0

  for (const s of statuses) {
    dailyPractice += SCORE_RULES.daily_practice[s.daily_practice as keyof typeof SCORE_RULES.daily_practice] || 0
    attendance += SCORE_RULES.attendance[s.attendance as keyof typeof SCORE_RULES.attendance] || 0
    homework += SCORE_RULES.homework[s.homework as keyof typeof SCORE_RULES.homework] || 0
    lunchRest += SCORE_RULES.lunch_rest[s.lunch_rest as keyof typeof SCORE_RULES.lunch_rest] || 0
  }

  const manualOffset = student.manual_offset || 0
  const total = dailyPractice + attendance + homework + lunchRest + manualOffset

  return { total, dailyPractice, attendance, homework, lunchRest, manualOffset }
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
  lunchRest: number
  manualOffset: number
  statusCount: number
}

export function calculateAllScores(
  students: StudentWithGroup[],
  statusMap: Map<string, DailyStatus[]>
): StudentScore[] {
  return students.map(student => {
    const statuses = statusMap.get(student.id) || []
    const detail = calculateStudentScore(student, statuses)
    return {
      studentId: student.id,
      studentName: student.name,
      groupName: student.group_name || '未分组',
      ...detail,
      statusCount: statuses.length,
    }
  })
}
