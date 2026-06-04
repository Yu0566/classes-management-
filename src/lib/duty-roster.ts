import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun } from './db'
import type { DutyRosterEntry, DutyRole } from '../types'

export async function getAll(): Promise<DutyRosterEntry[]> {
  return queryAll<DutyRosterEntry>(
    'SELECT * FROM duty_roster ORDER BY sort_order, role, weekday, position'
  )
}

export async function getByRole(role: DutyRole): Promise<DutyRosterEntry[]> {
  return queryAll<DutyRosterEntry>(
    'SELECT * FROM duty_roster WHERE role = ? ORDER BY weekday, position',
    [role]
  )
}

export async function getByWeekday(weekday: number): Promise<DutyRosterEntry[]> {
  return queryAll<DutyRosterEntry>(
    'SELECT * FROM duty_roster WHERE weekday = ? ORDER BY position',
    [weekday]
  )
}

export async function add(entry: Omit<DutyRosterEntry, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
  const id = uuid()
  const now = Date.now()
  await executeRun(
    `INSERT INTO duty_roster (id, student_id, student_name, role, weekday, position, weekday_group, photo, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, entry.student_id, entry.student_name, entry.role, entry.weekday ?? null, entry.position ?? null,
     entry.weekday_group ?? null, entry.photo ?? null, entry.sort_order ?? 0, now, now]
  )
  return id
}

export async function update(id: string, data: Partial<Pick<DutyRosterEntry, 'student_id' | 'student_name' | 'weekday' | 'position' | 'weekday_group' | 'photo' | 'sort_order'>>): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []
  if (data.student_id !== undefined) { sets.push('student_id = ?'); params.push(data.student_id) }
  if (data.student_name !== undefined) { sets.push('student_name = ?'); params.push(data.student_name) }
  if (data.weekday !== undefined) { sets.push('weekday = ?'); params.push(data.weekday) }
  if (data.position !== undefined) { sets.push('position = ?'); params.push(data.position) }
  if (data.weekday_group !== undefined) { sets.push('weekday_group = ?'); params.push(data.weekday_group) }
  if (data.photo !== undefined) { sets.push('photo = ?'); params.push(data.photo) }
  if (data.sort_order !== undefined) { sets.push('sort_order = ?'); params.push(data.sort_order) }
  if (sets.length === 0) return
  sets.push('updated_at = ?')
  params.push(Date.now())
  params.push(id)
  await executeRun(`UPDATE duty_roster SET ${sets.join(', ')} WHERE id = ?`, params)
}

export async function remove(id: string): Promise<void> {
  await executeRun('DELETE FROM duty_roster WHERE id = ?', [id])
}
