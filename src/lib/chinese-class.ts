import { v4 as uuid } from 'uuid'
import { queryAll, executeRun } from './db'
import { adjustGroupScore } from './groups'

export interface ChineseClassGroupScore {
  group_id: string
  group_name: string
  group_color: string
  leader_name: string
  score: number
}

export async function getChineseClassScores(): Promise<ChineseClassGroupScore[]> {
  return queryAll<ChineseClassGroupScore>(
    `SELECT g.id as group_id, g.name as group_name, g.color as group_color,
            COALESCE(g.leader_name, '') as leader_name,
            COALESCE(SUM(h.delta), 0) as score
     FROM groups g
     LEFT JOIN chinese_class_history h ON h.group_id = g.id
     GROUP BY g.id
     ORDER BY g.sort_order, g.created_at`
  )
}

export async function addChineseClassScore(groupId: string, delta: number): Promise<void> {
  await executeRun(
    'INSERT INTO chinese_class_history (id, group_id, delta, created_at) VALUES (?, ?, ?, ?)',
    [uuid(), groupId, delta, Date.now()]
  )
}

export async function resetChineseClassScores(): Promise<void> {
  await executeRun('DELETE FROM chinese_class_history')
}

export async function settleClassScores(): Promise<number> {
  const scores = await getChineseClassScores()
  let settled = 0
  for (const g of scores) {
    if (g.score !== 0) {
      await adjustGroupScore(g.group_id, g.score, '课堂加分结算')
      settled++
    }
  }
  await resetChineseClassScores()
  return settled
}
