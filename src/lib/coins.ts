import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun, executeTransaction } from './db'
import type { CoinGroup, CoinHistory } from '@/types'

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
