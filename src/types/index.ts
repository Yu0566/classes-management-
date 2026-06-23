// 小组
export interface Group {
  id: string
  name: string
  study_score: number
  total_score: number
  cumulative_study_score: number
  tree_spent: number
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
  leader_name?: string
}

// 每日状态
export interface DailyStatus {
  id: string
  student_id: string
  date: string
  daily_practice: 'signed' | 'unsigned' | 'not_applicable' | ''
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
  source?: string
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

// 留堂/罚抄记录
export interface DetentionRecord {
  id: string
  date: string
  countdown_started_at: number | null
  sign_in_window_start: number | null
  sign_in_window_end: number | null
  created_at: number
}

export interface DetentionStudent {
  id: string
  detention_record_id: string
  student_id: string
  student_name: string
  sign_in_time: number | null
  penalty_applied: number
}

// 小组团建
export interface ReflectionRecord {
  id: string
  date: string
  group_id: string
  group_name: string
  countdown_started_at: number | null
  sign_in_window_start: number | null
  sign_in_window_end: number | null
  created_at: number
}

export interface ReflectionStudent {
  id: string
  reflection_record_id: string
  student_id: string
  student_name: string
  sign_in_time: number | null
  penalty_applied: number
  group_id: string | null
}

// 罚抄管理
export interface CopyPunishmentWeek {
  id: string
  start_date: string
  end_date: string | null
  status: string
  created_at: number
}

export interface CopyPunishmentStudent {
  id: string
  week_id: string
  student_id: string
  student_name: string
  deduction_count: number
  completed: number
  completed_at: number | null
}

export interface CopyPunishmentLog {
  id: string
  action: 'generate' | 'add' | 'remove'
  detail: string | null
  student_name: string | null
  count: number | null
  source: string | null
  created_at: number
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
  points: number
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

// 数学作业等级记录
export interface MathHomeworkGrade {
  id: string
  student_id: string
  date: string
  reason: string
  created_at: number
}

// 数学作业等级（含学生信息）
export interface MathHomeworkGradeWithStudent extends MathHomeworkGrade {
  student_name: string
  group_name: string
  group_id: string
  group_color: string
  group_leader_name: string
}

// 班级轮值安排
export type DutyRole = 'monitor' | 'captain' | 'vice_captain' | 'duty_monitor' | 'rotation'

export interface DutyRosterEntry {
  id: string
  student_id: string
  student_name: string
  role: DutyRole
  weekday: number | null
  position: number | null
  weekday_group: string | null
  photo: string | null
  sort_order: number
  created_at: number
  updated_at: number
}

export const WEEKDAY_NAMES: Record<number, string> = {
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
}

export const DUTY_ROLE_LABELS: Record<DutyRole, string> = {
  monitor: '班长',
  captain: '队长',
  vice_captain: '副队长',
  duty_monitor: '值日班长',
  rotation: '轮值',
}

// 小组植树
export type TreeActionType = 'water' | 'sunlight' | 'fertilize' | 'pesticide'

export interface TreeDecorations {
  nameplate?: string
  style?: string
}

export interface GroupTree {
  id: string
  group_id: string
  level: number
  growth: number
  fruits: number
  fruits_redeemed: number
  fruits_t1: number
  fruits_t2: number
  fruits_t3: number
  redeemed_t1: number
  redeemed_t2: number
  redeemed_t3: number
  gold_progress: number
  decorations: string
  created_at: number
  updated_at: number
}

export interface TreeAction {
  id: string
  tree_id: string
  action_type: TreeActionType
  cost: number
  growth_value: number
  created_at: number
}
