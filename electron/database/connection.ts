import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import fs from 'fs'
import path from 'path'
import { runMigrations } from './migrations'

let db: SqlJsDatabase | null = null
let dbPath: string = ''

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
