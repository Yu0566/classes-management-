import { v4 as uuid } from 'uuid'
import { queryAll, queryOne, executeRun, executeTransaction } from './db'
import { upsertDailyStatus } from './daily-status'
import type { Homework, HomeworkSubmission } from '@/types'

// 获取所有作业
export async function getAllHomework(): Promise<Homework[]> {
  return queryAll<Homework>('SELECT * FROM homework ORDER BY assign_date DESC, created_at DESC')
}

// 获取单个作业
export async function getHomework(id: string): Promise<Homework | undefined> {
  return queryOne<Homework>('SELECT * FROM homework WHERE id = ?', [id])
}

// 创建作业
export async function createHomework(data: {
  title: string
  description?: string
  assignDate: string
  dueDate: string
}): Promise<Homework> {
  const id = uuid()
  const now = Date.now()
  await executeRun(
    `INSERT INTO homework (id, title, description, assign_date, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, data.title, data.description || '', data.assignDate, data.dueDate, now, now]
  )
  return (await getHomework(id))!
}

// 更新作业
export async function updateHomework(id: string, data: {
  title?: string
  description?: string
  dueDate?: string
}): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []
  if (data.title !== undefined) { sets.push('title = ?'); params.push(data.title) }
  if (data.description !== undefined) { sets.push('description = ?'); params.push(data.description) }
  if (data.dueDate !== undefined) { sets.push('due_date = ?'); params.push(data.dueDate) }
  if (sets.length === 0) return
  sets.push('updated_at = ?')
  params.push(Date.now(), id)
  await executeRun(`UPDATE homework SET ${sets.join(', ')} WHERE id = ?`, params)
}

// 删除作业
export async function deleteHomework(id: string): Promise<void> {
  await executeRun('DELETE FROM homework_submissions WHERE homework_id = ?', [id])
  await executeRun('DELETE FROM homework WHERE id = ?', [id])
}

// 获取某个作业的所有提交状态
export async function getSubmissions(homeworkId: string): Promise<HomeworkSubmission[]> {
  return queryAll<HomeworkSubmission>(
    'SELECT * FROM homework_submissions WHERE homework_id = ?',
    [homeworkId]
  )
}

// 获取单个学生的提交状态
export async function getStudentSubmission(
  homeworkId: string,
  studentId: string
): Promise<HomeworkSubmission | undefined> {
  return queryOne<HomeworkSubmission>(
    'SELECT * FROM homework_submissions WHERE homework_id = ? AND student_id = ?',
    [homeworkId, studentId]
  )
}

// 设置学生提交状态（同时同步到每日登记的 homework 字段）
export async function setSubmission(
  homeworkId: string,
  studentId: string,
  status: 'complete' | 'incomplete' | 'not_submitted'
): Promise<void> {
  const existing = await getStudentSubmission(homeworkId, studentId)
  const now = Date.now()

  if (existing) {
    await executeRun(
      'UPDATE homework_submissions SET status = ?, updated_at = ? WHERE id = ?',
      [status, now, existing.id]
    )
  } else {
    await executeRun(
      `INSERT INTO homework_submissions (id, homework_id, student_id, status, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [uuid(), homeworkId, studentId, status, now]
    )
  }
}

// 批量设置提交状态
export async function batchSetSubmission(
  homeworkId: string,
  studentIds: string[],
  status: 'complete' | 'incomplete' | 'not_submitted'
): Promise<void> {
  const ops = studentIds.map(sid => ({
    sql: `INSERT INTO homework_submissions (id, homework_id, student_id, status, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(homework_id, student_id)
          DO UPDATE SET status = ?, updated_at = ?`,
    params: [uuid(), homeworkId, sid, status, Date.now(), status, Date.now()],
  }))
  await executeTransaction(ops)
}

// 同步作业提交状态到每日登记
export async function syncToDailyStatus(
  homeworkId: string,
  studentId: string,
  assignDate: string
): Promise<void> {
  const submission = await getStudentSubmission(homeworkId, studentId)
  if (submission) {
    await upsertDailyStatus(studentId, assignDate, 'homework', submission.status)
  }
}

// 获取作业统计
export async function getHomeworkStats(homeworkId: string): Promise<{
  total: number
  complete: number
  incomplete: number
  notSubmitted: number
}> {
  const submissions = await getSubmissions(homeworkId)
  return {
    total: submissions.length,
    complete: submissions.filter(s => s.status === 'complete').length,
    incomplete: submissions.filter(s => s.status === 'incomplete').length,
    notSubmitted: submissions.filter(s => s.status === 'not_submitted').length,
  }
}

// 获取作业提交详情（带学生姓名和小组）
export async function getSubmissionDetails(homeworkId: string): Promise<{
  id: string
  studentId: string
  studentName: string
  groupName: string
  status: string
}[]> {
  return queryAll(
    `SELECT
       COALESCE(hs.id, '') as id,
       s.id as studentId,
       s.name as studentName,
       COALESCE(g.name, '') as groupName,
       COALESCE(hs.status, 'not_submitted') as status
     FROM students s
     LEFT JOIN groups g ON g.id = s.group_id
     LEFT JOIN homework_submissions hs ON hs.homework_id = ? AND hs.student_id = s.id
     ORDER BY g.sort_order, s.sort_order, s.name`,
    [homeworkId]
  )
}
