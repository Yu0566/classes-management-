import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import fs from 'fs'
import path from 'path'
import { runMigrations, SCHEMA_VERSION } from './migrations'
import { runSeed } from './seed'

let db: SqlJsDatabase | null = null
let dbPath: string = ''

export { SCHEMA_VERSION }

/**
 * 在正式初始化之前临时打开数据库，检测是否有旧版本数据。
 * 判断标准：students 表有数据，但 _meta 表不存在（pre-schema-versioning 的旧库）。
 */
export async function checkOldData(_dbPath: string): Promise<{ hasOldData: boolean; studentCount: number }> {
  if (!fs.existsSync(_dbPath)) {
    return { hasOldData: false, studentCount: 0 }
  }

  const SQL = await initSqlJs()
  const buffer = fs.readFileSync(_dbPath)
  const tempDb = new SQL.Database(buffer)

  try {
    let studentCount = 0
    let hasMeta = false

    // 检查 students 表是否有数据
    try {
      const rows = tempDb.exec('SELECT COUNT(*) AS cnt FROM students')
      studentCount = (rows?.[0]?.values?.[0]?.[0] as number) || 0
    } catch {
      // students 表不存在 = 空库或损坏库
    }

    // 检查 _meta 表是否存在（有 _meta 说明已被新版本处理过）
    try {
      tempDb.exec('SELECT key, value FROM _meta LIMIT 1')
      hasMeta = true
    } catch {
      // _meta 表不存在 = 旧版本数据库
    }

    // 旧数据判定：有学生记录 且 没有 _meta 表
    const hasOldData = studentCount > 0 && !hasMeta

    return { hasOldData, studentCount }
  } finally {
    tempDb.close()
  }
}

export async function initDatabase(_dbPath: string): Promise<void> {
  dbPath = _dbPath

  // 确保目录存在
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // 初始化 sql.js
  const SQL = await initSqlJs()

  // 尝试从文件加载数据库，如果不存在则创建新的
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
    console.log('数据库已加载:', dbPath)
  } else {
    db = new SQL.Database()
    console.log('数据库已创建:', dbPath)
  }

  // 启用外键约束
  db.run('PRAGMA foreign_keys = ON')

  // 运行迁移
  runMigrations(db)

  // 导入种子数据（仅首次）
  const seeded = runSeed(db)

  // 立即持久化
  saveDatabase()
}

export function saveDatabase(): void {
  if (!db || !dbPath) return
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(dbPath, buffer)
}

export function getDatabase(): SqlJsDatabase | null {
  return db
}

export function requireDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error('数据库未初始化')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase()
    db.close()
    db = null
  }
}
