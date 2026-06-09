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

// 批量创建小组
export async function batchCreateGroups(count: number): Promise<Group[]> {
  const existing = await getAllGroups()
  const startIndex = existing.length + 1
  const colors = ['bg-blue-500', 'bg-red-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-teal-500']

  const now = Date.now()
  const groups: Group[] = []
  for (let i = 0; i < count; i++) {
    const id = uuid()
    const name = `第${startIndex + i}组`
    const color = colors[(startIndex - 1 + i) % colors.length]
    await executeRun(
      `INSERT INTO groups (id, name, color, icon, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, color, 'fa-users', now, now]
    )
    groups.push((await getGroup(id))!)
  }
  return groups
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
  if ((data as any).leader_name !== undefined) { sets.push('leader_name = ?'); params.push((data as any).leader_name) }
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

// 学习积分操作（不影响总积分，总积分只有一键算分时才变化）
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

  const now = Date.now()
  await executeTransaction([
    {
      sql: 'UPDATE groups SET study_score = ?, updated_at = ? WHERE id = ?',
      params: [newStudyScore, now, groupId],
    },
    {
      sql: `INSERT INTO group_score_history (id, group_id, delta, reason, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      params: [uuid(), groupId, realDelta, reason, now],
    },
  ])
}

// 直接设置积分
export async function setGroupScore(
  groupId: string,
  studyScore?: number,
  totalScore?: number,
  reason?: string
): Promise<void> {
  const group = await getGroup(groupId)
  if (!group) throw new Error('小组不存在')

  const now = Date.now()
  const operations: { sql: string; params: unknown[] }[] = []

  if (studyScore !== undefined && studyScore !== group.study_score) {
    const clamped = Math.max(-10000, Math.min(10000, studyScore))
    operations.push({
      sql: `INSERT INTO group_score_history (id, group_id, delta, reason, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      params: [uuid(), groupId, clamped - group.study_score, reason || '手动编辑学习积分', now],
    })
    operations.push({
      sql: 'UPDATE groups SET study_score = ?, updated_at = ? WHERE id = ?',
      params: [clamped, now, groupId],
    })
  }

  if (totalScore !== undefined && totalScore !== group.total_score) {
    const clamped = Math.max(-10000, Math.min(10000, totalScore))
    operations.push({
      sql: `INSERT INTO group_score_history (id, group_id, delta, reason, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      params: [uuid(), groupId, clamped - group.total_score, reason || '手动编辑总积分', now],
    })
    operations.push({
      sql: 'UPDATE groups SET total_score = ?, updated_at = ? WHERE id = ?',
      params: [clamped, now, groupId],
    })
  }

  if (operations.length > 0) {
    await executeTransaction(operations)
  }
}

// 撤销上一步操作
export async function undoLastScoreChange(): Promise<boolean> {
  const last = await queryOne<GroupScoreHistory>(
    'SELECT * FROM group_score_history ORDER BY created_at DESC LIMIT 1'
  )
  if (!last) return false

  const group = await getGroup(last.group_id)
  if (!group) return false

  // 根据原因判断影响的积分类型：总积分相关只撤销总积分，其余撤销学习积分
  const isTotalScore = last.reason.includes('排名第') || last.reason.includes('总积分')
  const field = isTotalScore ? 'total_score' : 'study_score'

  const now = Date.now()
  await executeTransaction([
    {
      sql: `UPDATE groups SET ${field} = ${field} - ?, updated_at = ? WHERE id = ?`,
      params: [last.delta, now, last.group_id],
    },
    {
      sql: 'DELETE FROM group_score_history WHERE id = ?',
      params: [last.id],
    },
    {
      sql: `INSERT INTO group_score_history (id, group_id, delta, reason, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      params: [uuid(), last.group_id, -last.delta, `撤销：${last.reason}`, now],
    },
  ])

  return true
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

// 一键算分：按学习积分排名，第1名总积分+8，第2名+7，以此类推。算分后学习积分清零。
export async function calculateRankingBonus(): Promise<void> {
  const groups = await getAllGroups()
  if (groups.length === 0) return

  // 按学习积分降序排列
  const ranked = [...groups].sort((a, b) => b.study_score - a.study_score)

  const now = Date.now()
  const operations: { sql: string; params: unknown[] }[] = []

  for (let i = 0; i < ranked.length; i++) {
    const rank = i + 1
    const bonus = Math.max(0, 9 - rank) // 第1名+8, 第2名+7, ..., 第8名+1, 第9名起+0
    const group = ranked[i]

    if (bonus > 0) {
      const newTotalScore = group.total_score + bonus

      // 保存快照
      operations.push({
        sql: `INSERT INTO score_snapshots (id, group_id, score_before, score_after, diff, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        params: [uuid(), group.id, group.total_score, newTotalScore, bonus, now],
      })

      // 更新总积分
      operations.push({
        sql: 'UPDATE groups SET total_score = ?, updated_at = ? WHERE id = ?',
        params: [newTotalScore, now, group.id],
      })

      // 记录排名奖励历史
      operations.push({
        sql: `INSERT INTO group_score_history (id, group_id, delta, reason, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        params: [uuid(), group.id, bonus, `排名第${rank}名，总积分+${bonus}`, now],
      })
    }

    // 学习积分清零
    if (group.study_score !== 0) {
      operations.push({
        sql: 'UPDATE groups SET study_score = 0, updated_at = ? WHERE id = ?',
        params: [now, group.id],
      })
      operations.push({
        sql: `INSERT INTO group_score_history (id, group_id, delta, reason, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        params: [uuid(), group.id, -group.study_score, '一键算分，学习积分清零', now],
      })
    }
  }

  if (operations.length > 0) {
    await executeTransaction(operations)
  }
}

// 宝龙币结算：按目标数量计算总积分变动
export async function applyCoinsSettlement(target: number): Promise<void> {
  const { getAllCoinGroups } = await import('./coins')
  const coinGroups = await getAllCoinGroups()
  const groups = await getAllGroups()

  const now = Date.now()
  const operations: { sql: string; params: unknown[] }[] = []

  for (const cg of coinGroups) {
    // 按 group_id 匹配，兼容旧数据用名称匹配
    const group = groups.find(g => cg.group_id ? g.id === cg.group_id : g.name === cg.name)
    if (!group) continue

    const rawDelta = (cg.coins - target) * 3
    // 加分上限15分，扣分不设限
    const delta = rawDelta > 0 ? Math.min(rawDelta, 15) : rawDelta
    if (delta === 0) continue

    const newTotalScore = group.total_score + delta

    operations.push({
      sql: 'UPDATE groups SET total_score = ?, updated_at = ? WHERE id = ?',
      params: [newTotalScore, now, group.id],
    })
    operations.push({
      sql: `INSERT INTO group_score_history (id, group_id, delta, reason, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      params: [uuid(), group.id, delta, `宝龙币结算（${cg.coins}-${target}）×3`, now],
    })
  }

  if (operations.length > 0) {
    await executeTransaction(operations)
  }
}

// 所有小组全部积分清零（学习积分和总积分）
export async function resetAllScores(): Promise<void> {
  const groups = await getAllGroups()
  const now = Date.now()
  const operations: { sql: string; params: unknown[] }[] = []

  for (const group of groups) {
    if (group.study_score !== 0) {
      operations.push({
        sql: 'UPDATE groups SET study_score = 0, updated_at = ? WHERE id = ?',
        params: [now, group.id],
      })
      operations.push({
        sql: `INSERT INTO group_score_history (id, group_id, delta, reason, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        params: [uuid(), group.id, -group.study_score, '手动全部清零', now],
      })
    }
    if (group.total_score !== 0) {
      operations.push({
        sql: 'UPDATE groups SET total_score = 0, updated_at = ? WHERE id = ?',
        params: [now, group.id],
      })
      operations.push({
        sql: `INSERT INTO group_score_history (id, group_id, delta, reason, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        params: [uuid(), group.id, -group.total_score, '手动全部清零', now],
      })
    }
  }

  if (operations.length > 0) {
    await executeTransaction(operations)
  }
}

// 获取小组中的学生
export async function getGroupStudents(groupId: string): Promise<Student[]> {
  return queryAll<Student>(
    'SELECT * FROM students WHERE group_id = ? ORDER BY sort_order, created_at',
    [groupId]
  )
}

// 学生换组（自动分配新组空座位，清除原组组长身份，归整原组座位）
export async function moveStudent(studentId: string, newGroupId: string): Promise<void> {
  const student = await queryOne<Student>('SELECT * FROM students WHERE id = ?', [studentId])
  if (!student) return

  const oldGroupId = student.group_id
  const now = Date.now()

  // 查找新组第一个空座位
  const seated = await queryAll<{ seat_order: number }>(
    'SELECT seat_order FROM students WHERE group_id = ? AND seat_order >= 0 ORDER BY seat_order',
    [newGroupId],
  )
  const taken = new Set(seated.map(s => s.seat_order))
  let newSeatOrder = -1
  for (let i = 0; i < 7; i++) {
    if (!taken.has(i)) { newSeatOrder = i; break }
  }

  const ops: { sql: string; params?: unknown[] }[] = [
    {
      sql: 'UPDATE students SET group_id = ?, seat_order = ?, updated_at = ? WHERE id = ?',
      params: [newGroupId, newSeatOrder, now, studentId],
    },
  ]

  // 如果学生是原组组长，清除原组组长
  if (oldGroupId) {
    const oldGroup = await queryOne<Group>('SELECT * FROM groups WHERE id = ?', [oldGroupId])
    if (oldGroup?.leader_name === student.name) {
      ops.push({
        sql: "UPDATE groups SET leader_name = '', updated_at = ? WHERE id = ?",
        params: [now, oldGroupId],
      })
    }
    // 原组座位归整
    const remainingSeated = await queryAll<{ id: string; seat_order: number }>(
      'SELECT id, seat_order FROM students WHERE group_id = ? AND seat_order >= 0 ORDER BY seat_order',
      [oldGroupId],
    )
    remainingSeated.forEach((s, i) => {
      ops.push({
        sql: 'UPDATE students SET seat_order = ?, updated_at = ? WHERE id = ?',
        params: [i, now, s.id],
      })
    })
  }

  await executeTransaction(ops)
}

// 交换两个小组的全部学生（含组长）
export async function swapGroupStudents(groupIdA: string, groupIdB: string): Promise<void> {
  const [groupA, groupB] = await Promise.all([getGroup(groupIdA), getGroup(groupIdB)])
  if (!groupA || !groupB) throw new Error('小组不存在')

  const now = Date.now()
  const tempId = '__swap_temp__'
  await executeTransaction([
    { sql: 'UPDATE students SET group_id = ?, updated_at = ? WHERE group_id = ?', params: [tempId, now, groupIdA] },
    { sql: 'UPDATE students SET group_id = ?, updated_at = ? WHERE group_id = ?', params: [groupIdA, now, groupIdB] },
    { sql: 'UPDATE students SET group_id = ?, updated_at = ? WHERE group_id = ?', params: [groupIdB, now, tempId] },
    { sql: 'UPDATE groups SET leader_name = ?, updated_at = ? WHERE id = ?', params: [groupB.leader_name, now, groupIdA] },
    { sql: 'UPDATE groups SET leader_name = ?, updated_at = ? WHERE id = ?', params: [groupA.leader_name, now, groupIdB] },
  ])
}

// 一键轮换：每组学生整体移动到下一组（最后一组移动到第一组），组长也一起轮换
export async function rotateGroupStudents(): Promise<void> {
  const groups = await getAllGroups()
  if (groups.length < 2) return

  const now = Date.now()
  const operations: { sql: string; params: unknown[] }[] = []
  const tempPrefix = '__rotate_temp_'

  // 第一阶段：每个组的学生先移到临时ID
  for (let i = 0; i < groups.length; i++) {
    operations.push({
      sql: 'UPDATE students SET group_id = ?, updated_at = ? WHERE group_id = ?',
      params: [tempPrefix + i, now, groups[i].id],
    })
  }

  // 第二阶段：从临时ID移到目标组
  for (let i = 0; i < groups.length; i++) {
    const nextGroup = groups[(i + 1) % groups.length]
    operations.push({
      sql: 'UPDATE students SET group_id = ?, updated_at = ? WHERE group_id = ?',
      params: [nextGroup.id, now, tempPrefix + i],
    })
  }

  // 第三阶段：组长名称轮换
  for (let i = 0; i < groups.length; i++) {
    const nextGroup = groups[(i + 1) % groups.length]
    operations.push({
      sql: 'UPDATE groups SET leader_name = ?, updated_at = ? WHERE id = ?',
      params: [groups[i].leader_name, now, nextGroup.id],
    })
  }

  await executeTransaction(operations)
}
