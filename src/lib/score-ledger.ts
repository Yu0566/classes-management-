import { queryAll } from './db'
import type { DeductionRecord, ManualAdjustRecord } from '@/types'

export interface GroupScoreHistoryRow {
  id: string
  group_id: string
  delta: number
  reason: string
  operator: string | null
  created_at: number
}

export type LedgerType = 'deduction' | 'manual' | 'group'

export interface LedgerEntry {
  id: string
  type: LedgerType
  timestamp: number
  studentName: string | null
  groupName: string | null
  points: number
  reason: string
  date: string | null
}

const LIMIT = 500

export async function getUnifiedLedger(): Promise<LedgerEntry[]> {
  const [deductions, manuals, groupHistory] = await Promise.all([
    queryAll<DeductionRecord & { group_name?: string }>(
      `SELECT d.*, g.name as group_name
       FROM deduction_records d
       LEFT JOIN students s ON s.id = d.student_id
       LEFT JOIN groups g ON g.id = s.group_id
       ORDER BY d.timestamp DESC LIMIT ?`, [LIMIT]
    ),
    queryAll<ManualAdjustRecord & { group_name?: string }>(
      `SELECT m.*, g.name as group_name
       FROM manual_adjust_records m
       LEFT JOIN students s ON s.id = m.student_id
       LEFT JOIN groups g ON g.id = s.group_id
       ORDER BY m.timestamp DESC LIMIT ?`, [LIMIT]
    ),
    queryAll<GroupScoreHistoryRow & { group_name?: string }>(
      `SELECT h.*, g.name as group_name
       FROM group_score_history h
       LEFT JOIN groups g ON g.id = h.group_id
       ORDER BY h.created_at DESC LIMIT ?`, [LIMIT]
    ),
  ])

  const merged: LedgerEntry[] = [
    ...deductions.map(d => ({
      id: d.id,
      type: 'deduction' as const,
      timestamp: d.timestamp,
      studentName: d.student_name,
      groupName: d.group_name || null,
      points: -d.points,
      reason: d.reason,
      date: d.date,
    })),
    ...manuals.map(m => ({
      id: m.id,
      type: 'manual' as const,
      timestamp: m.timestamp,
      studentName: m.student_name,
      groupName: m.group_name || null,
      points: m.delta,
      reason: m.reason,
      date: null,
    })),
    ...groupHistory.map(h => ({
      id: h.id,
      type: 'group' as const,
      timestamp: h.created_at,
      studentName: null,
      groupName: h.group_name || null,
      points: h.delta,
      reason: h.reason || '',
      date: null,
    })),
  ]

  merged.sort((a, b) => b.timestamp - a.timestamp)
  return merged.slice(0, LIMIT)
}
