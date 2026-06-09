import { v4 as uuid } from 'uuid'
import { queryAll, executeRun } from './db'

export type Urgency = '普通' | '重要' | '紧急'
export type ConfirmMode = 'none' | 'any' | 'specific'

export interface NotificationRecord {
  id: string
  title: string
  message: string
  mode: 'fullscreen' | 'top'
  duration: number
  images: string[]
  urgency: Urgency
  confirm_mode: ConfirmMode
  confirm_students: string[]
  created_at: number
}

export interface NotificationRead {
  id: string
  notification_id: string
  student_name: string
  read_at: number
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
    confirm_mode TEXT DEFAULT 'none',
    confirm_students TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
  )`
}

function ensureReadsTable(): string {
  return `CREATE TABLE IF NOT EXISTS notification_reads (
    id TEXT PRIMARY KEY,
    notification_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    read_at INTEGER NOT NULL,
    FOREIGN KEY (notification_id) REFERENCES notification_history(id) ON DELETE CASCADE
  )`
}

export async function saveNotification(
  message: string,
  mode: 'fullscreen' | 'top',
  duration: number,
  images: string[] = [],
  urgency: Urgency = '普通',
  confirmMode: ConfirmMode = 'none',
  confirmStudents: string[] = [],
): Promise<string> {
  await executeRun(ensureTable())
  const imageJson = images.length > 0 ? JSON.stringify(images) : null
  const id = uuid()
  await executeRun(
    `INSERT INTO notification_history (id, title, message, mode, duration, image, urgency, confirm_mode, confirm_students)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, '', message, mode, duration, imageJson, urgency, confirmMode, JSON.stringify(confirmStudents)]
  )
  // 仅保留最近 100 条
  await executeRun(
    `DELETE FROM notification_history WHERE id NOT IN (
      SELECT id FROM notification_history ORDER BY created_at DESC LIMIT 100
    )`
  )
  return id
}

function parseImages(image: string | null): string[] {
  if (!image) return []
  if (image.startsWith('[')) {
    try { return JSON.parse(image) } catch { return [] }
  }
  return [image]
}

function parseStudents(raw: string | null): string[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

export async function getRecentNotifications(
  limit = 100
): Promise<NotificationRecord[]> {
  await executeRun(ensureTable())
  const rows = await queryAll<Omit<NotificationRecord, 'images' | 'confirm_students'> & { image: string | null; confirm_students: string | null }>(
    'SELECT * FROM notification_history ORDER BY created_at DESC LIMIT ?',
    [limit]
  )
  return rows.map(r => ({ ...r, images: parseImages(r.image), confirm_students: parseStudents(r.confirm_students) }))
}

export async function deleteNotification(id: string): Promise<void> {
  await executeRun('DELETE FROM notification_history WHERE id = ?', [id])
}

// ─── 确认相关 ───

export async function confirmNotification(notificationId: string, studentName: string): Promise<{ success: boolean; message: string }> {
  await executeRun(ensureReadsTable())

  // 检查通知是否存在及其确认模式
  const rows = await queryAll<{ confirm_mode: string; confirm_students: string }>(
    'SELECT confirm_mode, confirm_students FROM notification_history WHERE id = ?',
    [notificationId]
  )
  if (rows.length === 0) {
    return { success: false, message: '通知不存在' }
  }
  const { confirm_mode, confirm_students } = rows[0]

  if (confirm_mode === 'none') {
    return { success: false, message: '此通知无需确认' }
  }

  // specific 模式：检查学生是否在指定名单中
  if (confirm_mode === 'specific') {
    const allowed = parseStudents(confirm_students)
    if (allowed.length > 0 && !allowed.includes(studentName)) {
      return { success: false, message: '你不在确认名单中' }
    }
  }

  // 检查是否已确认
  const existing = await queryAll<{ id: string }>(
    'SELECT id FROM notification_reads WHERE notification_id = ? AND student_name = ?',
    [notificationId, studentName]
  )
  if (existing.length > 0) {
    return { success: false, message: '你已经确认过了' }
  }

  await executeRun(
    'INSERT INTO notification_reads (id, notification_id, student_name, read_at) VALUES (?, ?, ?, ?)',
    [uuid(), notificationId, studentName, Date.now()]
  )

  return { success: true, message: '确认成功' }
}

export async function getNotificationReads(notificationId: string): Promise<NotificationRead[]> {
  await executeRun(ensureReadsTable())
  return queryAll<NotificationRead>(
    'SELECT * FROM notification_reads WHERE notification_id = ? ORDER BY read_at ASC',
    [notificationId]
  )
}

/**
 * 获取学生待确认的通知列表
 * 返回：通知 + 该学生是否已确认
 */
export async function getPendingNotifications(studentName: string): Promise<(NotificationRecord & { confirmed: boolean })[]> {
  await executeRun(ensureTable())
  await executeRun(ensureReadsTable())

  const rows = await queryAll<Omit<NotificationRecord, 'images' | 'confirm_students'> & { image: string | null; confirm_students: string | null }>(
    `SELECT nh.*, CASE WHEN nr.id IS NOT NULL THEN 1 ELSE 0 END as confirmed_int
     FROM notification_history nh
     LEFT JOIN notification_reads nr ON nr.notification_id = nh.id AND nr.student_name = ?
     WHERE nh.confirm_mode != 'none'
     ORDER BY nh.created_at DESC LIMIT 20`,
    [studentName]
  )

  return rows.map(r => ({
    ...r,
    images: parseImages(r.image),
    confirm_students: parseStudents(r.confirm_students),
    confirmed: !!(r as any).confirmed_int,
  }))
}
