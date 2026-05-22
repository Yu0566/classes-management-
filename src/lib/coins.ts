import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun, executeTransaction } from './db'
import type { CoinGroup, CoinHistory } from '@/types'

// 同步班级小组到宝龙币小组：按 group_id 精确匹配，避免重名/改名导致重复
export async function syncCoinGroups(): Promise<CoinGroup[]> {
  const { getAllGroups } = await import('./groups')
  const groups = await getAllGroups()
  const coinGroups = await queryAll<CoinGroup>('SELECT * FROM coin_groups')

  const now = Date.now()
  const linked = new Set<string>()

  // 为没有对应宝龙币记录的小组创建（按 group_id 匹配）
  for (const g of groups) {
    const exists = coinGroups.find(cg => cg.group_id === g.id)
    if (!exists) {
      // 同时检查是否有同名但 group_id 为空的旧记录，直接复用
      const byName = coinGroups.find(cg => !cg.group_id && cg.name === g.name)
      if (byName) {
        await executeRun(
          'UPDATE coin_groups SET group_id = ?, updated_at = ? WHERE id = ?',
          [g.id, now, byName.id]
        )
        linked.add(byName.id)
      } else {
        await executeRun(
          'INSERT INTO coin_groups (id, name, group_id, coins, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
          [uuid(), g.name, g.id, now, now]
        )
      }
    } else if (exists.name !== g.name) {
      // 小组改名了，同步名称
      await executeRun(
        'UPDATE coin_groups SET name = ?, updated_at = ? WHERE id = ?',
        [g.name, now, exists.id]
      )
    }
  }

  // 删除没有对应班级小组的宝龙币记录（跳过刚链接的旧记录）
  for (const cg of coinGroups) {
    if (linked.has(cg.id)) continue
    const exists = groups.find(g => g.id === cg.group_id)
    if (!exists) {
      await executeRun('DELETE FROM coin_history WHERE coin_group_id = ?', [cg.id])
      await executeRun('DELETE FROM coin_groups WHERE id = ?', [cg.id])
    }
  }

  return queryAll<CoinGroup>('SELECT * FROM coin_groups ORDER BY created_at')
}

export async function getAllCoinGroups(): Promise<CoinGroup[]> {
  return queryAll<CoinGroup>('SELECT * FROM coin_groups ORDER BY created_at')
}

export async function getCoinGroup(id: string): Promise<CoinGroup | undefined> {
  return queryOne<CoinGroup>('SELECT * FROM coin_groups WHERE id = ?', [id])
}

export async function createCoinGroup(name: string): Promise<CoinGroup> {
  const id = uuid()
  const now = Date.now()
  await executeRun(
    'INSERT INTO coin_groups (id, name, coins, created_at, updated_at) VALUES (?, ?, 0, ?, ?)',
    [id, name, now, now]
  )
  return (await getCoinGroup(id))!
}

export async function deleteCoinGroup(id: string): Promise<void> {
  await executeRun('DELETE FROM coin_history WHERE coin_group_id = ?', [id])
  await executeRun('DELETE FROM coin_groups WHERE id = ?', [id])
}

export async function adjustCoins(
  groupId: string, delta: number, reason: string
): Promise<void> {
  const group = await getCoinGroup(groupId)
  if (!group) throw new Error('小组不存在')
  const newCoins = Math.max(0, group.coins + delta)
  const now = Date.now()

  await executeTransaction([
    {
      sql: 'UPDATE coin_groups SET coins = ?, updated_at = ? WHERE id = ?',
      params: [newCoins, now, groupId],
    },
    {
      sql: `INSERT INTO coin_history (id, coin_group_id, delta, reason, timestamp)
            VALUES (?, ?, ?, ?, ?)`,
      params: [uuid(), groupId, delta, reason, now],
    },
  ])
}

export async function getCoinHistory(groupId: string): Promise<CoinHistory[]> {
  return queryAll<CoinHistory>(
    'SELECT * FROM coin_history WHERE coin_group_id = ? ORDER BY timestamp DESC LIMIT 100',
    [groupId]
  )
}
