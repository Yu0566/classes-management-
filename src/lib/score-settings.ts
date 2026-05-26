import { queryAll, queryOne, executeRun } from './db'
import type { ScoreCategorySetting } from '@/types'

export async function getAllScoreSettings(): Promise<Map<string, boolean>> {
  const rows = await queryAll<ScoreCategorySetting>('SELECT * FROM score_category_settings')
  const map = new Map<string, boolean>()
  for (const r of rows) {
    map.set(r.category, r.enabled === 1)
  }
  // 确保三个默认行存在
  for (const cat of ['daily_practice', 'attendance', 'homework']) {
    if (!map.has(cat)) {
      await executeRun(
        'INSERT OR IGNORE INTO score_category_settings (category, enabled) VALUES (?, 0)',
        [cat]
      )
      map.set(cat, false)
    }
  }
  return map
}

export async function setScoreSetting(category: string, enabled: boolean): Promise<void> {
  await executeRun(
    'INSERT OR REPLACE INTO score_category_settings (category, enabled) VALUES (?, ?)',
    [category, enabled ? 1 : 0]
  )
}
