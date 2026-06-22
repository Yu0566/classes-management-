import { v4 as uuid } from 'uuid'
import { queryAll, executeRun, executeTransaction } from './db'
import { upsertDailyStatus } from './daily-status'
import type { PracticeSignIn, PracticeScoreAward, StudentWithGroup } from '@/types'

export type PracticeLabel = 'qiangji' | 'tisheng'

export const LABEL_NAMES: Record<PracticeLabel, string> = {
  qiangji: '强基',
  tisheng: '提升',
}

// 获取指定标签的学生
export async function getRosterStudents(label: PracticeLabel): Promise<StudentWithGroup[]> {
  return queryAll<StudentWithGroup>(
    `SELECT s.*, COALESCE(g.name, '') as group_name
     FROM students s
     LEFT JOIN groups g ON g.id = s.group_id
     WHERE s.practice_label = ?
     ORDER BY g.sort_order, s.sort_order, s.name`,
    [label]
  )
}

// 获取签到记录
export async function getSignIns(
  date: string,
  label: PracticeLabel
): Promise<(PracticeSignIn & { student_name: string; group_name: string; group_color: string })[]> {
  return queryAll(
    `SELECT pi.*, s.name as student_name, COALESCE(g.name, '') as group_name,
            COALESCE(g.color, 'bg-gray-400') as group_color
     FROM practice_signins pi
     JOIN students s ON s.id = pi.student_id
     LEFT JOIN groups g ON g.id = s.group_id
     WHERE pi.date = ? AND pi.label = ?
     ORDER BY pi.sign_in_order`,
    [date, label]
  )
}

// 获取加分记录
export async function getScoreAwards(
  date: string,
  label: PracticeLabel
): Promise<(PracticeScoreAward & { group_name: string; student_name: string })[]> {
  return queryAll(
    `SELECT psa.*, COALESCE(g.name, '') as group_name, s.name as student_name
     FROM practice_score_awards psa
     LEFT JOIN groups g ON g.id = psa.group_id
     LEFT JOIN students s ON s.id = psa.student_id
     WHERE psa.date = ? AND psa.label = ?
     ORDER BY psa.created_at`,
    [date, label]
  )
}

// 查询某学生当天的签到
export async function getStudentSignIn(
  studentId: string,
  date: string,
  label: PracticeLabel
): Promise<PracticeSignIn | undefined> {
  const rows = await queryAll<PracticeSignIn>(
    'SELECT * FROM practice_signins WHERE student_id = ? AND date = ? AND label = ?',
    [studentId, date, label]
  )
  return rows[0]
}

// 计算下一个签到序号
async function getNextOrder(date: string, label: PracticeLabel): Promise<number> {
  const rows = await queryAll<{ max_order: number }>(
    'SELECT MAX(sign_in_order) as max_order FROM practice_signins WHERE date = ? AND label = ?',
    [date, label]
  )
  return (rows[0]?.max_order ?? 0) + 1
}

// 初始化当天所有有 practice_label 的学生的 daily_statuses（设为 unsigned）
// 确保未签到学生也有记录，积分系统能正确扣分
export async function initPracticeDailyStatuses(date: string): Promise<void> {
  const students = await queryAll<{ id: string }>(
    "SELECT id FROM students WHERE practice_label IS NOT NULL AND practice_label != ''"
  )
  const existing = await queryAll<{ student_id: string }>(
    "SELECT student_id FROM daily_statuses WHERE date = ? AND daily_practice != ''",
    [date]
  )
  const existingSet = new Set(existing.map(e => e.student_id))
  for (const s of students) {
    if (!existingSet.has(s.id)) {
      await upsertDailyStatus(s.id, date, 'daily_practice', 'unsigned')
    }
  }
}

// 签到
export async function signInStudent(
  studentId: string,
  date: string,
  label: PracticeLabel
): Promise<void> {
  const existing = await getStudentSignIn(studentId, date, label)
  if (existing) return

  const nextOrder = await getNextOrder(date, label)
  await executeRun(
    `INSERT INTO practice_signins (id, student_id, date, label, sign_in_order, signed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuid(), studentId, date, label, nextOrder, Date.now()]
  )

  // 同步 daily_statuses
  try {
    await upsertDailyStatus(studentId, date, 'daily_practice', 'signed')
  } catch (err) {
    console.error('[signInStudent] upsertDailyStatus error:', err)
  }

  // 重算加分
  await recalculateBonuses(date, label)
}

// 取消签到
export async function unSignStudent(
  studentId: string,
  date: string,
  label: PracticeLabel
): Promise<void> {
  await executeRun(
    'DELETE FROM practice_signins WHERE student_id = ? AND date = ? AND label = ?',
    [studentId, date, label]
  )

  // 检查该学生当天是否还有其他标签的签到
  const remaining = await queryAll<PracticeSignIn>(
    'SELECT * FROM practice_signins WHERE student_id = ? AND date = ?',
    [studentId, date]
  )
  if (remaining.length === 0) {
    await upsertDailyStatus(studentId, date, 'daily_practice', 'unsigned')
  }

  // 重算加分
  await recalculateBonuses(date, label)
}

// 核心加分算法
export async function recalculateBonuses(
  date: string,
  label: PracticeLabel
): Promise<void> {
  // 当前已有加分
  const currentAwards = await queryAll<PracticeScoreAward>(
    'SELECT * FROM practice_score_awards WHERE date = ? AND label = ?',
    [date, label]
  )

  // 当次所有签到（含学生组信息）
  const signIns = await queryAll<PracticeSignIn & { group_id: string; group_name: string }>(
    `SELECT pi.*, s.group_id, COALESCE(g.name, '') as group_name
     FROM practice_signins pi
     JOIN students s ON s.id = pi.student_id
     LEFT JOIN groups g ON g.id = s.group_id
     WHERE pi.date = ? AND pi.label = ?
     ORDER BY pi.sign_in_order ASC`,
    [date, label]
  )

  // 按签到顺序取前5个不同组
  const awardedGroupIds = new Set<string>()
  const correctAwards: { student_id: string; group_id: string }[] = []
  for (const si of signIns) {
    if (!si.group_id) continue
    if (!awardedGroupIds.has(si.group_id) && awardedGroupIds.size < 5) {
      awardedGroupIds.add(si.group_id)
      correctAwards.push({ student_id: si.student_id, group_id: si.group_id })
    }
  }

  const currentGroupSet = new Set(currentAwards.map(a => a.group_id))
  const correctGroupSet = new Set(correctAwards.map(a => a.group_id))

  const toAdd = correctAwards.filter(a => !currentGroupSet.has(a.group_id))
  const toRemove = currentAwards.filter(a => !correctGroupSet.has(a.group_id))

  if (toAdd.length === 0 && toRemove.length === 0) return

  const now = Date.now()
  const ops: { sql: string; params?: unknown[] }[] = []

  const allGroupIds = new Set([
    ...toRemove.map(a => a.group_id),
    ...toAdd.map(a => a.group_id),
  ])
  const groupTotals = new Map<string, number>()
  for (const gid of allGroupIds) {
    const rows = await queryAll<{ total_score: number }>(
      'SELECT total_score FROM groups WHERE id = ?', [gid]
    )
    groupTotals.set(gid, rows[0]?.total_score ?? 0)
  }

  for (const award of toRemove) {
    ops.push({ sql: 'DELETE FROM practice_score_awards WHERE id = ?', params: [award.id] })
    const cur = groupTotals.get(award.group_id) ?? 0
    const newTotal = Math.max(-10000, Math.min(10000, cur - 1))
    ops.push({ sql: 'UPDATE groups SET total_score = ?, updated_at = ? WHERE id = ?', params: [newTotal, now, award.group_id] })
    ops.push({
      sql: `INSERT INTO group_score_history (id, group_id, delta, reason, created_at) VALUES (?, ?, ?, ?, ?)`,
      params: [uuid(), award.group_id, -1, `撤销每日一练前5签到奖励（${LABEL_NAMES[label]}）`, now],
    })
    groupTotals.set(award.group_id, newTotal)
  }
  for (const award of toAdd) {
    ops.push({
      sql: `INSERT INTO practice_score_awards (id, student_id, group_id, date, label, score_delta, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [uuid(), award.student_id, award.group_id, date, label, 1, now],
    })
    const cur = groupTotals.get(award.group_id) ?? 0
    const newTotal = Math.max(-10000, Math.min(10000, cur + 1))
    ops.push({ sql: 'UPDATE groups SET total_score = ?, updated_at = ? WHERE id = ?', params: [newTotal, now, award.group_id] })
    ops.push({
      sql: `INSERT INTO group_score_history (id, group_id, delta, reason, created_at) VALUES (?, ?, ?, ?, ?)`,
      params: [uuid(), award.group_id, 1, `每日一练前5签到（${LABEL_NAMES[label]}）+1`, now],
    })
    groupTotals.set(award.group_id, newTotal)
  }

  await executeTransaction(ops)
}

// 清空某日某标签全部签到
export async function clearSignIns(date: string, label: PracticeLabel): Promise<void> {
  await executeRun('DELETE FROM practice_signins WHERE date = ? AND label = ?', [date, label])
  await executeRun('DELETE FROM practice_score_awards WHERE date = ? AND label = ?', [date, label])
}
