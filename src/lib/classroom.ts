import { queryAll, queryOne } from './db'
import type { Group, Student, StudentWithGroup } from '@/types'

// ====== 小组信息 ======

/** 获取小组总数 */
export async function getGroupCount(): Promise<number> {
  const row = await queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM groups')
  return row?.cnt ?? 0
}

/** 获取所有小组 */
export async function getAllGroups(): Promise<Group[]> {
  return queryAll<Group>('SELECT * FROM groups ORDER BY sort_order, created_at')
}

/** 获取小组成员 */
export async function getGroupMembers(groupId: string): Promise<Student[]> {
  return queryAll<Student>(
    'SELECT * FROM students WHERE group_id = ? ORDER BY sort_order, created_at',
    [groupId]
  )
}

// ====== 学生信息 ======

/** 获取班级总人数 */
export async function getStudentCount(): Promise<number> {
  const row = await queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM students')
  return row?.cnt ?? 0
}

/** 获取所有学生（含小组名） */
export async function getAllStudents(): Promise<StudentWithGroup[]> {
  return queryAll<StudentWithGroup>(
    `SELECT s.*, g.name as group_name
     FROM students s
     LEFT JOIN groups g ON g.id = s.group_id
     ORDER BY s.sort_order, s.created_at`
  )
}

/** 获取单个学生 */
export async function getStudent(id: string): Promise<StudentWithGroup | undefined> {
  return queryOne<StudentWithGroup>(
    `SELECT s.*, g.name as group_name
     FROM students s
     LEFT JOIN groups g ON g.id = s.group_id
     WHERE s.id = ?`,
    [id]
  )
}

/** 获取学生姓名列表 */
export async function getStudentNameList(): Promise<{ id: string; name: string }[]> {
  return queryAll<{ id: string; name: string }>(
    'SELECT id, name FROM students ORDER BY sort_order, created_at'
  )
}

// ====== 综合查询 ======

/** 获取班级概览（小组数、总人数） */
export async function getClassOverview(): Promise<{
  groupCount: number
  studentCount: number
  groups: Group[]
  students: StudentWithGroup[]
}> {
  const [groupCount, studentCount, groups, students] = await Promise.all([
    getGroupCount(),
    getStudentCount(),
    getAllGroups(),
    getAllStudents(),
  ])
  return { groupCount, studentCount, groups, students }
}
