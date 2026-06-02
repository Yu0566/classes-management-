import { queryAll, executeRun } from './db'
import type { ScoreCategorySetting } from '@/types'

export interface CategorySetting {
  enabled: boolean
  points: number
}

export async function getAllScoreSettings(): Promise<Map<string, CategorySetting>> {
  const rows = await queryAll<ScoreCategorySetting>('SELECT * FROM score_category_settings')
  const map = new Map<string, CategorySetting>()
  for (const r of rows) {
    map.set(r.category, { enabled: r.enabled === 1, points: r.points ?? 1 })
  }
  // 确保三个默认行存在
  for (const cat of ['daily_practice', 'attendance', 'homework']) {
    if (!map.has(cat)) {
      await executeRun(
        'INSERT OR IGNORE INTO score_category_settings (category, enabled, points) VALUES (?, 0, 1)',
        [cat]
      )
      map.set(cat, { enabled: false, points: 1 })
    }
  }
  return map
}

async function ensureRow(category: string): Promise<void> {
  await executeRun(
    'INSERT OR IGNORE INTO score_category_settings (category, enabled, points) VALUES (?, 0, 1)',
    [category]
  )
}

export async function setScoreSetting(category: string, enabled: boolean): Promise<void> {
  await ensureRow(category)
  await executeRun('UPDATE score_category_settings SET enabled = ? WHERE category = ?', [enabled ? 1 : 0, category])
}

export async function setScorePoints(category: string, points: number): Promise<void> {
  await ensureRow(category)
  await executeRun('UPDATE score_category_settings SET points = ? WHERE category = ?', [points, category])
}
