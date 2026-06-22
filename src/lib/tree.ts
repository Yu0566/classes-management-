import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun, executeTransaction } from './db'
import type { GroupTree, TreeAction, TreeActionType, TreeDecorations } from '@/types'

export const DEFAULT_GROWTH_THRESHOLDS = [0, 10, 25, 50, 85, 130]
export const GROWTH_THRESHOLDS = DEFAULT_GROWTH_THRESHOLDS
export const MAX_LEVEL = 5
export const FRUIT_START_LEVEL = 4
export const DEFAULT_GOLD_FRUIT_THRESHOLD = 20
export const GOLD_FRUIT_THRESHOLD = DEFAULT_GOLD_FRUIT_THRESHOLD

export interface TreeSettings {
  thresholds: number[]
  goldThreshold: number
}

export async function getTreeSettings(): Promise<TreeSettings> {
  const row = await queryOne<{ value: string }>(`SELECT value FROM _meta WHERE key = 'tree_settings'`)
  if (row) {
    try {
      const parsed = JSON.parse(row.value)
      return {
        thresholds: parsed.thresholds || DEFAULT_GROWTH_THRESHOLDS,
        goldThreshold: parsed.goldThreshold ?? DEFAULT_GOLD_FRUIT_THRESHOLD,
      }
    } catch { /* fallback */ }
  }
  return { thresholds: DEFAULT_GROWTH_THRESHOLDS, goldThreshold: DEFAULT_GOLD_FRUIT_THRESHOLD }
}

export async function setTreeSettings(settings: TreeSettings): Promise<void> {
  await executeRun(
    `INSERT OR REPLACE INTO _meta (key, value) VALUES ('tree_settings', ?)`,
    [JSON.stringify(settings)]
  )
}
export const FRUIT_TIER_NAMES = ['铜果', '银果', '金果']
export const FRUIT_TIER_COLORS = ['#CD7F32', '#C0C0C0', '#FFD700']

export const ACTION_CONFIG: Record<TreeActionType, { cost: number; growth: number; label: string; emoji: string }> = {
  water: { cost: 1, growth: 1, label: '浇水', emoji: '💧' },
  sunlight: { cost: 2, growth: 2, label: '阳光', emoji: '☀️' },
  fertilize: { cost: 3, growth: 3, label: '施肥', emoji: '🌱' },
  pesticide: { cost: 2, growth: 2, label: '杀虫', emoji: '🐛' },
}

export const LEVEL_NAMES = ['种子', '嫩芽', '小苗', '小树', '大树', '果树']

export async function getGroupTree(groupId: string): Promise<GroupTree | undefined> {
  return queryOne<GroupTree>('SELECT * FROM group_trees WHERE group_id = ?', [groupId])
}

export async function ensureGroupTree(groupId: string): Promise<GroupTree> {
  const existing = await getGroupTree(groupId)
  if (existing) return existing
  const id = uuid()
  const now = Date.now()
  await executeRun(
    `INSERT INTO group_trees (id, group_id, level, growth, fruits, fruits_redeemed, created_at, updated_at)
     VALUES (?, ?, 0, 0, 0, 0, ?, ?)`,
    [id, groupId, now, now]
  )
  return (await getGroupTree(groupId))!
}

export async function performAction(
  groupId: string,
  actionType: TreeActionType
): Promise<{
  success: boolean
  tree: GroupTree
  leveledUp: boolean
  fruitTier: number | null
  error?: string
}> {
  const config = ACTION_CONFIG[actionType]
  const group = await queryOne<{ total_score: number }>('SELECT total_score FROM groups WHERE id = ?', [groupId])
  if (!group) return { success: false, tree: (await ensureGroupTree(groupId)), leveledUp: false, fruitTier: null, error: '小组不存在' }
  if (group.total_score < config.cost) {
    return { success: false, tree: (await ensureGroupTree(groupId)), leveledUp: false, fruitTier: null, error: '积分不足' }
  }

  const tree = await ensureGroupTree(groupId)
  const now = Date.now()
  const settings = await getTreeSettings()
  const GROWTH_THRESHOLDS = settings.thresholds
  const GOLD_FRUIT_THRESHOLD = settings.goldThreshold

  // 满级后：积攒金果
  if (tree.level >= MAX_LEVEL) {
    const newGoldProgress = (tree.gold_progress || 0) + config.growth
    const goldProduced = newGoldProgress >= GOLD_FRUIT_THRESHOLD
    const remainingProgress = goldProduced ? newGoldProgress - GOLD_FRUIT_THRESHOLD : newGoldProgress

    await executeTransaction([
      {
        sql: 'UPDATE groups SET total_score = total_score - ?, tree_spent = tree_spent + ?, updated_at = ? WHERE id = ?',
        params: [config.cost, config.cost, now, groupId],
      },
      {
        sql: `INSERT INTO group_score_history (id, group_id, delta, reason, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        params: [uuid(), groupId, -config.cost, `植树${config.label}`, now],
      },
      {
        sql: `UPDATE group_trees SET gold_progress = ?, fruits_t3 = fruits_t3 + ?, fruits = fruits + ?, updated_at = ? WHERE id = ?`,
        params: [remainingProgress, goldProduced ? 1 : 0, goldProduced ? 1 : 0, now, tree.id],
      },
      {
        sql: `INSERT INTO tree_actions (id, tree_id, action_type, cost, growth_value, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        params: [uuid(), tree.id, actionType, config.cost, config.growth, now],
      },
    ])

    const updated = (await getGroupTree(groupId))!
    return { success: true, tree: updated, leveledUp: false, fruitTier: goldProduced ? 3 : null }
  }

  // 正常升级逻辑
  const newGrowth = tree.growth + config.growth
  let newLevel = tree.level

  while (newLevel < MAX_LEVEL && newGrowth >= GROWTH_THRESHOLDS[newLevel + 1]) {
    newLevel++
  }

  const leveledUp = newLevel > tree.level
  let fruitTier: number | null = null
  let t1Add = 0
  let t2Add = 0

  if (leveledUp) {
    for (let lv = tree.level + 1; lv <= newLevel; lv++) {
      if (lv === 4) { t1Add++; fruitTier = 1 }
      if (lv === 5) { t2Add++; fruitTier = 2 }
    }
  }

  const totalFruitsAdd = t1Add + t2Add

  await executeTransaction([
    {
      sql: 'UPDATE groups SET total_score = total_score - ?, tree_spent = tree_spent + ?, updated_at = ? WHERE id = ?',
      params: [config.cost, config.cost, now, groupId],
    },
    {
      sql: `INSERT INTO group_score_history (id, group_id, delta, reason, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      params: [uuid(), groupId, -config.cost, `植树${config.label}`, now],
    },
    {
      sql: `UPDATE group_trees SET growth = ?, level = ?, fruits = fruits + ?, fruits_t1 = fruits_t1 + ?, fruits_t2 = fruits_t2 + ?, updated_at = ? WHERE id = ?`,
      params: [newGrowth, newLevel, totalFruitsAdd, t1Add, t2Add, now, tree.id],
    },
    {
      sql: `INSERT INTO tree_actions (id, tree_id, action_type, cost, growth_value, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [uuid(), tree.id, actionType, config.cost, config.growth, now],
    },
  ])

  const updated = (await getGroupTree(groupId))!
  return { success: true, tree: updated, leveledUp, fruitTier }
}

export async function redeemFruit(treeId: string, tier: 1 | 2 | 3 = 1): Promise<GroupTree | undefined> {
  const tree = await queryOne<GroupTree>('SELECT * FROM group_trees WHERE id = ?', [treeId])
  if (!tree) return tree

  const fruitField = `fruits_t${tier}` as const
  const redeemField = `redeemed_t${tier}` as const
  const available = (tree as any)[fruitField] - (tree as any)[redeemField]
  if (available <= 0) return tree

  await executeRun(
    `UPDATE group_trees SET ${redeemField} = ${redeemField} + 1, fruits_redeemed = fruits_redeemed + 1, updated_at = ? WHERE id = ?`,
    [Date.now(), treeId]
  )
  return queryOne<GroupTree>('SELECT * FROM group_trees WHERE id = ?', [treeId])
}

export async function getActionHistory(treeId: string, limit = 20): Promise<TreeAction[]> {
  return queryAll<TreeAction>(
    'SELECT * FROM tree_actions WHERE tree_id = ? ORDER BY created_at DESC LIMIT ?',
    [treeId, limit]
  )
}

export async function getAllTrees(): Promise<(GroupTree & { group_name: string; group_color: string; total_score: number })[]> {
  return queryAll<GroupTree & { group_name: string; group_color: string; total_score: number }>(
    `SELECT t.*, g.name as group_name, g.color as group_color, g.total_score
     FROM group_trees t
     JOIN groups g ON g.id = t.group_id
     ORDER BY g.sort_order, g.created_at`
  )
}

export async function initAllGroupTrees(): Promise<void> {
  const groups = await queryAll<{ id: string }>('SELECT id FROM groups ORDER BY sort_order, created_at')
  for (const g of groups) {
    await ensureGroupTree(g.id)
  }
}

export interface FruitEvent {
  groupId: string
  groupName: string
  tier: number
}

export async function syncAllTreeGrowth(): Promise<FruitEvent[]> {
  const groups = await queryAll<{ id: string; name: string; total_score: number; study_score: number }>(
    'SELECT id, name, total_score, study_score FROM groups ORDER BY sort_order, created_at'
  )
  const settings = await getTreeSettings()
  const thresholds = settings.thresholds
  const fruitEvents: FruitEvent[] = []

  for (const g of groups) {
    const tree = await ensureGroupTree(g.id)
    const growth = Math.max(0, g.total_score + g.study_score)
    let newLevel = 0
    while (newLevel < MAX_LEVEL && growth >= thresholds[newLevel + 1]) {
      newLevel++
    }

    if (tree.growth !== growth || tree.level !== newLevel) {
      let t1Add = 0, t2Add = 0
      if (newLevel > tree.level) {
        for (let lv = tree.level + 1; lv <= newLevel; lv++) {
          if (lv === 4) { t1Add++; fruitEvents.push({ groupId: g.id, groupName: g.name, tier: 1 }) }
          if (lv === 5) { t2Add++; fruitEvents.push({ groupId: g.id, groupName: g.name, tier: 2 }) }
        }
      }
      const now = Date.now()
      await executeRun(
        `UPDATE group_trees SET growth = ?, level = ?, fruits = fruits + ?, fruits_t1 = fruits_t1 + ?, fruits_t2 = fruits_t2 + ?, updated_at = ? WHERE id = ?`,
        [growth, newLevel, t1Add + t2Add, t1Add, t2Add, now, tree.id]
      )
    }
  }
  return fruitEvents
}

// ============ 铭牌系统 ============

export interface NameplateStyle {
  id: string
  label: string
  tier: number
  unlockLevel: number
  gradient: string
  borderColor: string
  textColor: string
  glow?: string
  animation?: string
}

export const NAMEPLATE_STYLES: NameplateStyle[] = [
  // Tier 1 — Lv2 解锁，基础风格
  { id: 'basic-blue', label: '天蓝', tier: 1, unlockLevel: 2, gradient: 'linear-gradient(135deg, #1e3a5f, #2980b9)', borderColor: '#5dade2', textColor: '#ecf0f1' },
  { id: 'basic-green', label: '翠绿', tier: 1, unlockLevel: 2, gradient: 'linear-gradient(135deg, #1e5f3a, #27ae60)', borderColor: '#58d68d', textColor: '#ecf0f1' },
  { id: 'basic-red', label: '赤红', tier: 1, unlockLevel: 2, gradient: 'linear-gradient(135deg, #5f1e1e, #c0392b)', borderColor: '#e74c3c', textColor: '#ecf0f1' },
  { id: 'basic-purple', label: '暗紫', tier: 1, unlockLevel: 2, gradient: 'linear-gradient(135deg, #2c1654, #8e44ad)', borderColor: '#af7ac5', textColor: '#ecf0f1' },
  // Tier 2 — Lv3 解锁，霓虹渐变
  { id: 'neon-cyber', label: '赛博霓虹', tier: 2, unlockLevel: 3, gradient: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)', borderColor: '#00f5ff', textColor: '#00f5ff', glow: '0 0 8px #00f5ff, 0 0 16px #00f5ff40' },
  { id: 'lava-flow', label: '熔岩', tier: 2, unlockLevel: 3, gradient: 'linear-gradient(135deg, #1a0000, #b22222, #ff4500)', borderColor: '#ff6347', textColor: '#ffd700', glow: '0 0 8px #ff4500, 0 0 16px #ff450040' },
  { id: 'aurora', label: '极光', tier: 2, unlockLevel: 3, gradient: 'linear-gradient(135deg, #0a1628, #1a4a5e, #2ecc71, #1abc9c)', borderColor: '#2ecc71', textColor: '#ecf0f1', glow: '0 0 8px #2ecc71, 0 0 16px #2ecc7140' },
  { id: 'dark-gold', label: '暗金', tier: 2, unlockLevel: 3, gradient: 'linear-gradient(135deg, #1a1200, #4a3700, #b8860b)', borderColor: '#ffd700', textColor: '#ffd700', glow: '0 0 8px #ffd700, 0 0 12px #ffd70040' },
  // Tier 3 — Lv4 解锁，动态边框
  { id: 'flame-border', label: '烈焰', tier: 3, unlockLevel: 4, gradient: 'linear-gradient(135deg, #1a0000, #330000, #1a0000)', borderColor: '#ff4500', textColor: '#ffd700', glow: '0 0 12px #ff4500, 0 0 24px #ff450060', animation: 'flame' },
  { id: 'frost-border', label: '寒冰', tier: 3, unlockLevel: 4, gradient: 'linear-gradient(135deg, #0a1a2e, #1a3a5e, #0a1a2e)', borderColor: '#87ceeb', textColor: '#e0f7ff', glow: '0 0 12px #87ceeb, 0 0 24px #87ceeb60', animation: 'frost' },
  { id: 'lightning', label: '雷霆', tier: 3, unlockLevel: 4, gradient: 'linear-gradient(135deg, #0a0a1a, #1a1a3a, #0a0a1a)', borderColor: '#9b59b6', textColor: '#e8daef', glow: '0 0 12px #9b59b6, 0 0 24px #9b59b660', animation: 'lightning' },
  { id: 'starfield', label: '星空', tier: 3, unlockLevel: 4, gradient: 'linear-gradient(135deg, #000428, #004e92, #000428)', borderColor: '#ffeaa7', textColor: '#ffeaa7', glow: '0 0 10px #ffeaa7, 0 0 20px #ffeaa740', animation: 'starfield' },
  // Tier 4 — Lv5 解锁，传说级
  { id: 'legendary-gold', label: '★传奇★', tier: 4, unlockLevel: 5, gradient: 'linear-gradient(135deg, #1a1200, #b8860b, #ffd700, #b8860b, #1a1200)', borderColor: '#ffd700', textColor: '#fff8dc', glow: '0 0 16px #ffd700, 0 0 32px #ffd70060, 0 0 48px #ffd70030', animation: 'legendary' },
  { id: 'thunder-king', label: '⚡雷王⚡', tier: 4, unlockLevel: 5, gradient: 'linear-gradient(135deg, #0d001a, #4a0080, #8b00ff, #4a0080, #0d001a)', borderColor: '#bf00ff', textColor: '#e8b4f8', glow: '0 0 16px #bf00ff, 0 0 32px #bf00ff60, 0 0 48px #bf00ff30', animation: 'legendary' },
  { id: 'blaze-god', label: '🔥炽焰🔥', tier: 4, unlockLevel: 5, gradient: 'linear-gradient(135deg, #1a0000, #8b0000, #ff4500, #ff8c00, #ff4500, #8b0000, #1a0000)', borderColor: '#ff4500', textColor: '#fffacd', glow: '0 0 16px #ff4500, 0 0 32px #ff450060, 0 0 48px #ff8c0030', animation: 'legendary' },
  { id: 'ice-emperor', label: '❄帝王❄', tier: 4, unlockLevel: 5, gradient: 'linear-gradient(135deg, #001a33, #003366, #00bfff, #87ceeb, #00bfff, #003366, #001a33)', borderColor: '#00bfff', textColor: '#e0ffff', glow: '0 0 16px #00bfff, 0 0 32px #00bfff60, 0 0 48px #87ceeb30', animation: 'legendary' },
]

export function getStylesForLevel(level: number): NameplateStyle[] {
  return NAMEPLATE_STYLES.filter(s => s.unlockLevel <= level)
}

export function parseDecorations(tree: GroupTree): TreeDecorations {
  try {
    return JSON.parse(tree.decorations || '{}')
  } catch {
    return {}
  }
}

export async function setDecorations(treeId: string, decorations: TreeDecorations): Promise<void> {
  await executeRun(
    'UPDATE group_trees SET decorations = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(decorations), Date.now(), treeId]
  )
}
