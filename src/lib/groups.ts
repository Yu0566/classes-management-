import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun, executeTransaction } from './db'
import type { Group, GroupScoreHistory, ScoreSnapshot, Student } from '@/types'

// 获取所有小组
export async function getAllGroups(): Promise<Group[]> {
  return queryAll<Group>('SELECT * FROM groups ORDER BY sort_order, created_at')
}

// 获取单个小组
export async function getGroup(id: string): Promise<Group | undefined> {
  return queryOne<Group>('SELECT * FROM groups WHERE id = ?', [id])
}

// 创建小组
export async function createGroup(data: {
  name: string
  color?: string
  icon?: string
}): Promise<Group> {
  const id = uuid()
  const now = Date.now()
  await executeRun(
    `INSERT INTO groups (id, name, color, icon, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, data.name, data.color || 'bg-blue-500', data.icon || 'fa-users', now, now]
  )
  return (await getGroup(id))!
}

// 更新小组
export async function updateGroup(id: string, data: {
  name?: string
  color?: string
  icon?: string
  sort_order?: number
}): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []
  if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name) }
  if (data.color !== undefined) { sets.push('color = ?'); params.push(data.color) }
  if (data.icon !== undefined) { sets.push('icon = ?'); params.push(data.icon) }
  if (data.sort_order !== undefined) { sets.push('sort_order = ?'); params.push(data.sort_order) }
  if (sets.length === 0) return
  sets.push('updated_at = ?')
  params.push(Date.now(), id)
  await executeRun(`UPDATE groups SET ${sets.join(', ')} WHERE id = ?`, params)
}

// 删除小组
export async function deleteGroup(id: string): Promise<void> {
  // 先取消关联学生
  await executeRun('UPDATE students SET group_id = ? WHERE group_id = ?', ['', id])
  await executeRun('DELETE FROM group_score_history WHERE group_id = ?', [id])
  await executeRun('DELETE FROM score_snapshots WHERE group_id = ?', [id])
  await executeRun('DELETE FROM groups WHERE id = ?', [id])
}

// 小组积分操作
export async function adjustGroupScore(
  groupId: string,
  delta: number,
  reason: string
): Promise<void> {
  const group = await getGroup(groupId)
  if (!group) throw new Error('小组不存在')

  // 积分范围限制 -10000 ~ 10000
  const newStudyScore = Math.max(-10000, Math.min(10000, group.study_score + delta))
  const realDelta = newStudyScore - group.study_score
  const newTotalScore = Math.max(-10000, Math.min(10000, group.total_score + realDelta))

  const now = Date.now()
  const historyId = uuid()

  await executeTransaction([
    {
      sql: 'UPDATE groups SET study_score = ?, total_score = ?, updated_at = ? WHERE id = ?',
      params: [newStudyScore, newTotalScore, now, groupId],
    },
    {
      sql: `INSERT INTO group_score_history (id, group_id, delta, reason, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      params: [historyId, groupId, realDelta, reason, now],
    },
  ])
}

// 获取操作历史
export async function getScoreHistory(limit = 30): Promise<(GroupScoreHistory & { group_name: string })[]> {
  return queryAll(
    `SELECT h.*, g.name as group_name
     FROM group_score_history h
     JOIN groups g ON g.id = h.group_id
     ORDER BY h.created_at DESC
     LIMIT ?`,
    [limit]
  )
}

// 获取快照列表
export async function getSnapshots(groupId: string): Promise<ScoreSnapshot[]> {
  return queryAll<ScoreSnapshot>(
    'SELECT * FROM score_snapshots WHERE group_id = ? ORDER BY created_at DESC',
    [groupId]
  )
}

// 一键算分：计算快照差异并加到学习积分
export async function calculateSnapshotDiff(groupId: string): Promise<void> {
  const group = await getGroup(groupId)
  if (!group) throw new Error('小组不存在')

  const now = Date.now()

  // 保存快照
  const snapshotId = uuid()
  await executeTransaction([
    {
      sql: `INSERT INTO score_snapshots (id, group_id, score_before, score_after, diff, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [snapshotId, groupId, group.study_score, group.total_score, group.snapshot_diff, now],
    },
    {
      sql: 'UPDATE groups SET study_score = total_score, snapshot_diff = 0, updated_at = ? WHERE id = ?',
      params: [now, groupId],
    },
    {
      sql: `INSERT INTO group_score_history (id, group_id, delta, reason, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      params: [uuid(), groupId, group.snapshot_diff, '一键算分（快照差异）', now],
    },
  ])
}

// 更新快照差异
export async function updateSnapshotDiff(groupId: string): Promise<void> {
  const group = await getGroup(groupId)
  if (!group) return
  const diff = group.total_score - group.study_score
  await executeRun(
    'UPDATE groups SET snapshot_diff = ?, updated_at = ? WHERE id = ?',
    [diff, Date.now(), groupId]
  )
}

// 获取小组中的学生
export async function getGroupStudents(groupId: string): Promise<Student[]> {
  return queryAll<Student>(
    'SELECT * FROM students WHERE group_id = ? ORDER BY sort_order, created_at',
    [groupId]
  )
}

// 学生换组
export async function moveStudent(studentId: string, newGroupId: string): Promise<void> {
  await executeRun(
    'UPDATE students SET group_id = ?, updated_at = ? WHERE id = ?',
    [newGroupId, Date.now(), studentId]
  )
}
