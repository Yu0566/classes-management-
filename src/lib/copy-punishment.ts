import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun } from './db'
import { calculateAllScores } from './scores'
import { getAllScoreSettings } from './score-settings'
import * as studentApi from './students'
import type { CopyPunishmentWeek, CopyPunishmentStudent, DailyStatus } from '@/types'

async function ensureTables(): Promise<void> {
  await executeRun(`CREATE TABLE IF NOT EXISTS copy_punishment_weeks (
    id TEXT PRIMARY KEY,
    start_date TEXT NOT NULL,
    end_date TEXT,
    status TEXT DEFAULT 'active',
    created_at INTEGER
  )`)
  await executeRun(`CREATE TABLE IF NOT EXISTS copy_punishment_students (
    id TEXT PRIMARY KEY,
    week_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    deduction_count INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    completed_at INTEGER
  )`)
}

export async function getActiveWeek(): Promise<CopyPunishmentWeek | undefined> {
  await ensureTables()
  return queryOne<CopyPunishmentWeek>(
    "SELECT * FROM copy_punishment_weeks WHERE status = 'active' ORDER BY created_at DESC"
  )
}

export async function getWeekStudents(weekId: string): Promise<CopyPunishmentStudent[]> {
  return queryAll<CopyPunishmentStudent>(
    'SELECT * FROM copy_punishment_students WHERE week_id = ? ORDER BY deduction_count DESC',
    [weekId]
  )
}

export async function getUncompletedCount(): Promise<number> {
  const week = await getActiveWeek()
  if (!week) return 0
  const rows = await queryAll<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM copy_punishment_students WHERE week_id = ? AND completed = 0',
    [week.id]
  )
  return rows[0]?.cnt ?? 0
}

export async function getUncompletedNames(): Promise<string[]> {
  const week = await getActiveWeek()
  if (!week) return []
  const rows = await queryAll<{ student_name: string }>(
    'SELECT student_name FROM copy_punishment_students WHERE week_id = ? AND completed = 0 ORDER BY deduction_count DESC',
    [week.id]
  )
  return rows.map(r => r.student_name)
}

export async function generatePunishmentList(
  topN: number = 5
): Promise<{ weekId: string; students: CopyPunishmentStudent[] }> {
  await ensureTables()

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // 归档旧 active week
  const oldWeek = await getActiveWeek()
  if (oldWeek) {
    await executeRun(
      "UPDATE copy_punishment_weeks SET end_date = ?, status = 'archived' WHERE id = ?",
      [todayStr, oldWeek.id]
    )
  }

  // 基于当前个人积分，取积分最低的前 N 名
  const allStudents = await studentApi.getAllStudents()
  const allStatuses = await queryAll<DailyStatus>('SELECT * FROM daily_statuses')
  const statusMap = new Map<string, DailyStatus[]>()
  for (const s of allStatuses) {
    const arr = statusMap.get(s.student_id) || []
    arr.push(s)
    statusMap.set(s.student_id, arr)
  }

  const settingsMap = await getAllScoreSettings()
  const enabled = new Set<string>()
  const pts = new Map<string, number>()
  for (const [cat, setting] of settingsMap) {
    if (setting.enabled) enabled.add(cat)
    pts.set(cat, setting.points)
  }

  const scores = calculateAllScores(allStudents, statusMap, enabled, pts)
  const sorted = [...scores].sort((a, b) => a.total - b.total)
  const negatives = sorted.filter(s => s.total < 0)
  // 同分并列：取第 topN 名的分数作为阈值，所有同分的都纳入
  let bottom: typeof negatives
  if (negatives.length <= topN) {
    bottom = negatives
  } else {
    const cutoffScore = negatives[topN - 1].total
    bottom = negatives.filter(s => s.total <= cutoffScore)
  }

  // 创建新 week
  const weekId = uuid()
  await executeRun(
    `INSERT INTO copy_punishment_weeks (id, start_date, end_date, status, created_at)
     VALUES (?, ?, ?, 'active', ?)`,
    [weekId, todayStr, null, Date.now()]
  )

  const students: CopyPunishmentStudent[] = []
  for (const r of bottom) {
    const sid = uuid()
    await executeRun(
      `INSERT INTO copy_punishment_students (id, week_id, student_id, student_name, deduction_count)
       VALUES (?, ?, ?, ?, ?)`,
      [sid, weekId, r.studentId, r.studentName, Math.abs(r.total)]
    )
    students.push({
      id: sid,
      week_id: weekId,
      student_id: r.studentId,
      student_name: r.studentName,
      deduction_count: Math.abs(r.total),
      completed: 0,
      completed_at: null,
    })
  }

  return { weekId, students }
}

export async function markCompleted(cpsId: string): Promise<void> {
  await executeRun(
    'UPDATE copy_punishment_students SET completed = 1, completed_at = ? WHERE id = ?',
    [Date.now(), cpsId]
  )
}

export async function markUncompleted(cpsId: string): Promise<void> {
  await executeRun(
    'UPDATE copy_punishment_students SET completed = 0, completed_at = NULL WHERE id = ?',
    [cpsId]
  )
}

export async function addPunishmentStudent(
  weekId: string, studentId: string, studentName: string
): Promise<void> {
  await executeRun(
    `INSERT OR IGNORE INTO copy_punishment_students (id, week_id, student_id, student_name, deduction_count)
     VALUES (?, ?, ?, ?, 0)`,
    [uuid(), weekId, studentId, studentName]
  )
}

export async function removePunishmentStudent(id: string): Promise<void> {
  await executeRun('DELETE FROM copy_punishment_students WHERE id = ?', [id])
}

export async function getScoreResetHistory(limit: number = 10): Promise<{ date: string; label: string }[]> {
  const rows = await queryAll<{ created_at: number }>(
    'SELECT created_at FROM score_snapshots ORDER BY created_at DESC LIMIT ?',
    [limit]
  )
  return rows.map(r => {
    const d = new Date(r.created_at)
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      label: d.toLocaleDateString('zh-CN'),
    }
  })
}
