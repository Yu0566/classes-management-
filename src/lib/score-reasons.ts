import { queryOne, executeRun } from './db'

export interface ScoreReasonsConfig {
  add: string[]
  deduct: string[]
}

export const DEFAULT_ADD_REASONS = ['扣错了补分', '老师主动加分', '班长加分']
export const DEFAULT_DEDUCT_REASONS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '道法']

export async function getScoreReasons(): Promise<ScoreReasonsConfig> {
  const row = await queryOne<{ value: string }>(`SELECT value FROM _meta WHERE key = 'score_reasons'`)
  if (row) {
    try {
      const parsed = JSON.parse(row.value)
      return {
        add: Array.isArray(parsed.add) ? parsed.add : [...DEFAULT_ADD_REASONS],
        deduct: Array.isArray(parsed.deduct) ? parsed.deduct : [...DEFAULT_DEDUCT_REASONS],
      }
    } catch { /* fallback */ }
  }
  return { add: [...DEFAULT_ADD_REASONS], deduct: [...DEFAULT_DEDUCT_REASONS] }
}

export async function saveScoreReasons(config: ScoreReasonsConfig): Promise<void> {
  await executeRun(
    `INSERT OR REPLACE INTO _meta (key, value) VALUES ('score_reasons', ?)`,
    [JSON.stringify(config)]
  )
}
