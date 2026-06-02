import { v4 as uuid } from 'uuid'
import { queryAll, executeRun } from './db'

export type Urgency = '普通' | '重要' | '紧急'

export interface NotificationRecord {
  id: string
  title: string
  message: string
  mode: 'fullscreen' | 'top'
  duration: number
  images: string[]
  urgency: Urgency
  created_at: number
}

function ensureTable(): string {
  return `CREATE TABLE IF NOT EXISTS notification_history (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    mode TEXT DEFAULT 'fullscreen',
    duration INTEGER DEFAULT 30,
    image TEXT,
    urgency TEXT DEFAULT '普通',
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
  )`
}

export async function saveNotification(
  title: string,
  message: string,
  mode: 'fullscreen' | 'top',
  duration: number,
  images: string[] = [],
  urgency: Urgency = '普通'
): Promise<void> {
  await executeRun(ensureTable())
  const imageJson = images.length > 0 ? JSON.stringify(images) : null
  await executeRun(
    `INSERT INTO notification_history (id, title, message, mode, duration, image, urgency)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), title, message, mode, duration, imageJson, urgency]
  )
  // 仅保留最近100条
  await executeRun(
    `DELETE FROM notification_history WHERE id NOT IN (
      SELECT id FROM notification_history ORDER BY created_at DESC LIMIT 100
    )`
  )
}

function parseImages(image: string | null): string[] {
  if (!image) return []
  if (image.startsWith('[')) {
    try { return JSON.parse(image) } catch { return [] }
  }
  return [image]
}

export async function getRecentNotifications(
  limit = 100
): Promise<NotificationRecord[]> {
  await executeRun(ensureTable())
  const rows = await queryAll<Omit<NotificationRecord, 'images'> & { image: string | null }>(
    'SELECT * FROM notification_history ORDER BY created_at DESC LIMIT ?',
    [limit]
  )
  return rows.map(r => ({ ...r, images: parseImages(r.image) }))
}

export async function deleteNotification(id: string): Promise<void> {
  await executeRun('DELETE FROM notification_history WHERE id = ?', [id])
}
