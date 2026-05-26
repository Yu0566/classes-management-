// 小组
export interface Group {
  id: string
  name: string
  study_score: number
  total_score: number
  snapshot_diff: number
  color: string
  icon: string
  leader_name: string
  sort_order: number
  created_at: number
  updated_at: number
}

// 学生
export interface Student {
  id: string
  name: string
  group_id: string
  manual_offset: number
  practice_label: string
  lunch_label: string
  lunch_longterm: number
  sort_order: number
  created_at: number
  updated_at: number
}

// 带小组信息的学生
export interface StudentWithGroup extends Student {
  group_name: string
}

// 每日状态
export interface DailyStatus {
  id: string
  student_id: string
  date: string
  daily_practice: 'signed' | 'unsigned' | 'not_applicable'
  attendance: 'signed' | 'unsigned' | 'late' | 'leave'
  homework: 'complete' | 'incomplete' | 'not_submitted'
  lunch_rest: 'unsigned' | 'signed' | 'leave'
  created_at: number
  updated_at: number
}

// 小组积分操作历史
export interface GroupScoreHistory {
  id: string
  group_id: string
  delta: number
  reason: string
  operator: string
  created_at: number
}

// 积分快照
export interface ScoreSnapshot {
  id: string
  group_id: string
  score_before: number
  score_after: number
  diff: number
  created_at: number
}

// 扣分记录
export interface DeductionRecord {
  id: string
  student_id: string
  student_name: string
  points: number
  reason: string
  date: string
  timestamp: number
}

// 手动调整记录
export interface ManualAdjustRecord {
  id: string
  student_id: string
  student_name: string
  delta: number
  reason: string
  timestamp: number
}

// 值日学生记录
export interface DutyStudent {
  id: string
  duty_record_id: string
  student_id: string
  student_name: string
  sign_in_time: number | null
  sign_out_time: number | null
  penalty_applied: number
}

// 值日记录
export interface DutyRecord {
  id: string
  date: string
  sign_in_window_start: number | null
  sign_in_window_end: number | null
  sign_out_window_start: number | null
  sign_out_window_end: number | null
  countdown_started_at: number | null
  created_at: number
  students?: DutyStudent[]
}

// 作业
export interface Homework {
  id: string
  title: string
  description: string
  assign_date: string
  due_date: string
  created_at: number
  updated_at: number
}

// 作业提交状态
export interface HomeworkSubmission {
  id: string
  homework_id: string
  student_id: string
  status: 'complete' | 'incomplete' | 'not_submitted'
  updated_at: number
}

// 考勤记录
export interface AttendanceRecord {
  id: string
  student_id: string
  date: string
  status: 'normal' | 'late' | 'absent' | 'leave'
  remark: string
  updated_at: number
}

// 考勤时段（一天可多个）
export interface AttendanceWindow {
  id: string
  date: string
  label: string
  window_start: string
  window_end: string
  status: 'idle' | 'active' | 'closed'
  created_at: number
  updated_at: number
}

// 考勤时段内学生签到记录
export interface AttendanceWindowRecord {
  id: string
  window_id: string
  student_id: string
  status: 'signed' | 'unsigned' | 'late' | 'leave'
  updated_at: number
}

// 午餐午休记录
export interface LunchRestRecord {
  id: string
  student_id: string
  date: string
  status: 'normal' | 'violation' | 'absent'
  remark: string
  updated_at: number
}

// 每日一练记录
export interface DailyPracticeRecord {
  id: string
  student_id: string
  date: string
  status: 'signed' | 'unsigned' | 'not_applicable'
  signed_at: number | null
  updated_at: number
}

// 每日一练签到记录（新系统）
export interface PracticeSignIn {
  id: string
  student_id: string
  date: string
  label: string
  sign_in_order: number
  signed_at: number
}

// 每日一练加分记录
export interface PracticeScoreAward {
  id: string
  student_id: string
  group_id: string
  date: string
  label: string
  score_delta: number
  created_at: number
}

// 积分扣分项开关
export interface ScoreCategorySetting {
  category: string
  enabled: number
}

export const PRACTICE_LABEL_MAP: Record<string, string> = {
  qiangji: '强基',
  tisheng: '提升',
}

// 宝龙币小组
export interface CoinGroup {
  id: string
  name: string
  group_id: string | null
  coins: number
  created_at: number
  updated_at: number
}

// 宝龙币历史
export interface CoinHistory {
  id: string
  coin_group_id: string
  delta: number
  reason: string
  timestamp: number
}
