import { v4 as uuid } from 'uuid'
import { queryAll, executeRun } from './db'

export type MessageTag = '建议' | '感谢' | '心愿' | '其他'

export interface MessageRecord {
  id: string
  student_name: string
  content: string
  tag: MessageTag
  expires_at: number | null
  created_at: number
  image: string | null
}

export async function getMessages(): Promise<MessageRecord[]> {
  return queryAll<MessageRecord>(
    `SELECT * FROM message_board
     WHERE expires_at IS NULL OR expires_at > ?
     ORDER BY created_at DESC`,
    [Date.now()]
  )
}

export async function addMessage(
  studentName: string,
  content: string,
  tag: MessageTag = '其他',
  expiresAt: number | null = null,
  image: string | null = null,
): Promise<string> {
  const id = uuid()
  await executeRun(
    `INSERT INTO message_board (id, student_name, content, tag, expires_at, created_at, image)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, studentName.trim(), content.trim(), tag, expiresAt, Date.now(), image]
  )
  return id
}

export async function deleteMessage(id: string): Promise<void> {
  await executeRun('DELETE FROM message_board WHERE id = ?', [id])
}

export async function getNewMessageCount(since: number): Promise<number> {
  const rows = await queryAll<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM message_board
     WHERE (expires_at IS NULL OR expires_at > ?) AND created_at > ?`,
    [Date.now(), since]
  )
  return rows[0]?.cnt ?? 0
}
