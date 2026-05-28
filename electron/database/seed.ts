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

  const existing = db.exec("SELECT COUNT(*) as cnt FROM students")
  if (existing.length > 0 && existing[0].values[0][0] as number > 0) {
    console.log('数据库已有学生数据，跳过种子导入')
    return false
  }

  const now = Date.now()
  let imported = 0

  for (const g of seed.groups) {
    const id = randomUUID()
    db.run(
      `INSERT INTO groups (id, name, color, leader_name, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, g.name, g.color, g.leader_name, g.sort_order || 0, now, now]
    )
  }

  for (const s of seed.students) {
    const groupRow = seed.groups.find(g => g.name === s.group_name)
    if (!groupRow) {
      console.warn(`学生 "${s.name}" 的小组 "${s.group_name}" 不存在，跳过`)
      continue
    }
    const stmt = db.prepare("SELECT id FROM groups WHERE name = ?")
    stmt.bind([s.group_name])
    const groupId = stmt.step() ? stmt.getAsObject().id as string : null
    stmt.free()
    if (!groupId) continue

    const studentId = randomUUID()
    db.run(
      `INSERT INTO students (id, name, group_id, practice_label, lunch_label, lunch_longterm, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [studentId, s.name, groupId, s.practice_label || '', s.lunch_label || '', s.lunch_longterm ? 1 : 0, now, now]
    )
    imported++
  }

  console.log(`种子数据导入完成：${seed.groups.length} 个小组，${imported} 名学生`)
  return true
}
