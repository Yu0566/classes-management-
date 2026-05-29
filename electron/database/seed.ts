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

function exists(db: SqlJsDatabase, table: string, column: string, value: string): boolean {
  const stmt = db.prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${column} = ?`)
  stmt.bind([value])
  const hasRow = stmt.step()
  const cnt = hasRow ? (stmt.getAsObject().cnt as number) : 0
  stmt.free()
  return cnt > 0
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

  const now = Date.now()
  let importedGroups = 0
  let importedStudents = 0

  // 增量导入小组：按名称检查，缺失则插入
  for (const g of seed.groups) {
    if (exists(db, 'groups', 'name', g.name)) continue

    const id = randomUUID()
    db.run(
      `INSERT INTO groups (id, name, color, leader_name, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, g.name, g.color, g.leader_name, g.sort_order || 0, now, now]
    )
    importedGroups++
  }

  // 增量导入学生：按姓名检查，缺失则插入
  for (const s of seed.students) {
    if (exists(db, 'students', 'name', s.name)) continue

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

  if (importedGroups > 0 || importedStudents > 0) {
    console.log(`种子数据补充完成：${importedGroups} 个小组，${importedStudents} 名学生`)
  } else {
    console.log('种子数据已是最新，无需补充')
  }
  return true
}
