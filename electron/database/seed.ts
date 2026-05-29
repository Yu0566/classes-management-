import { Database as SqlJsDatabase } from 'sql.js'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

interface SeedGroup {
  name: string
  color: string
  leader_name: string
  sort_order?: number
}

interface SeedStudent {
  name: string
  group_name: string
  practice_label?: string
  lunch_label?: string
  lunch_longterm?: number
}

interface SeedData {
  groups: SeedGroup[]
  students: SeedStudent[]
}

function getSeedPath(): string | null {
  const devPath = path.join(__dirname, '../../seed.json')
  if (fs.existsSync(devPath)) return devPath

  if (app.isPackaged) {
    const prodPath = path.join(process.resourcesPath, 'seed.json')
    if (fs.existsSync(prodPath)) return prodPath
  }

  return null
}

export function runSeed(db: SqlJsDatabase): boolean {
  const seedPath = getSeedPath()
  if (!seedPath) {
    console.log('seed.json 未找到，跳过种子数据导入')
    return false
  }

  let seed: SeedData
  try {
    seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'))
  } catch (err) {
    console.error('seed.json 解析失败:', err)
    return false
  }

  // 检查数据库小组数是否与 seed 一致
  const groupResult = db.exec('SELECT COUNT(*) as cnt FROM groups')
  const dbGroupCount = (groupResult.length > 0 ? groupResult[0].values[0][0] : 0) as number
  if (dbGroupCount >= seed.groups.length) {
    console.log('数据库已有完整数据，跳过种子导入')
    return false
  }

  console.log(`数据库不完整（${dbGroupCount}/${seed.groups.length}组），清空旧数据并重新导入...`)

  // 先删子表（引用 students/groups 的表），再删主表
  const childTables = [
    'practice_score_awards',
    'practice_signins',
    'math_homework_grades',
    'homework_records',
    'homework_submissions',
    'daily_practice_records',
    'lunch_rest_records',
    'attendance_records',
    'attendance_window_records',
    'duty_students',
    'daily_statuses',
    'deduction_records',
    'manual_adjust_records',
    'group_score_history',
    'score_snapshots',
  ]

  for (const table of childTables) {
    db.run(`DELETE FROM ${table}`)
  }
  db.run('DELETE FROM students')
  db.run('DELETE FROM groups')

  const now = Date.now()

  // 全量导入小组
  for (const g of seed.groups) {
    const id = randomUUID()
    db.run(
      `INSERT INTO groups (id, name, color, leader_name, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, g.name, g.color, g.leader_name, g.sort_order || 0, now, now]
    )
  }

  // 全量导入学生
  let importedStudents = 0
  for (const s of seed.students) {
    const gStmt = db.prepare('SELECT id FROM groups WHERE name = ?')
    gStmt.bind([s.group_name])
    const groupId = gStmt.step() ? (gStmt.getAsObject().id as string) : null
    gStmt.free()
    if (!groupId) {
      console.warn(`学生 "${s.name}" 的小组 "${s.group_name}" 不存在，跳过`)
      continue
    }

    const studentId = randomUUID()
    db.run(
      `INSERT INTO students (id, name, group_id, practice_label, lunch_label, lunch_longterm, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [studentId, s.name, groupId, s.practice_label || '', s.lunch_label || '', s.lunch_longterm ? 1 : 0, now, now]
    )
    importedStudents++
  }

  console.log(`种子数据导入完成：${seed.groups.length} 个小组，${importedStudents} 名学生`)
  return true
}
