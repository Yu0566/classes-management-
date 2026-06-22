import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import fs from 'fs'
import path from 'path'
import { runMigrations, SCHEMA_VERSION } from './migrations'
import { runSeed } from './seed'

function conDebugLog(msg: string): void {
  try {
    const logPath = path.join(process.env.APPDATA || process.env.HOME || '.', 'class-management-dev', 'migration-debug.log')
    const dir = path.dirname(logPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] CONN: ${msg}\n`)
  } catch (_) { /* ignore */ }
}

let db: SqlJsDatabase | null = null
let dbPath: string = ''

const MAX_BACKUPS = 20

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
    try {
      db = new SQL.Database(buffer)
      console.log('数据库已加载:', dbPath)
    } catch (err: any) {
      // 只有构造函数失败才说明文件真的损坏了
      if (err.message && (err.message.includes('not a database') || err.message.includes('file is not a database'))) {
        console.error('数据库文件损坏，自动备份并重建:', dbPath)
        const bakPath = dbPath + '.corrupted-' + Date.now() + '.bak'
        fs.copyFileSync(dbPath, bakPath)
        db = new SQL.Database()
        console.log('数据库已重建，损坏文件备份到:', bakPath)
      } else {
        throw err
      }
    }
  } else {
    db = new SQL.Database()
    console.log('数据库已创建:', dbPath)
  }

  // 数据库文件存在时，运行迁移前先做一份备份
  if (fs.existsSync(dbPath)) {
    backupDatabase(dbPath)
    cleanupOldBackups(dbPath)
  }

  // 启用外键约束
  db.run('PRAGMA foreign_keys = ON')

  // 运行迁移
  runMigrations(db)

  // 强力去重：确保 reflection 表没有重复且唯一约束存在
  // 注意：必须先删 students（外键引用 records），再删 records
  conDebugLog('cleanup starting...')
  try {
    // 先删掉属于重复 record 的 students（否则外键约束会阻止删除 record）
    db.exec("DELETE FROM reflection_students WHERE reflection_record_id IN (SELECT id FROM reflection_records WHERE id NOT IN (SELECT MIN(id) FROM reflection_records GROUP BY date, group_id))")
    // 再删重复 record
    db.exec("DELETE FROM reflection_records WHERE id NOT IN (SELECT MIN(id) FROM reflection_records GROUP BY date, group_id)")
    // 清理孤儿学生
    db.exec("DELETE FROM reflection_students WHERE reflection_record_id NOT IN (SELECT id FROM reflection_records)")
    // 清理 reflection_students 重复
    db.exec("DELETE FROM reflection_students WHERE id NOT IN (SELECT MIN(id) FROM reflection_students GROUP BY reflection_record_id, student_id)")
    // 创建唯一索引
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_reflection_records_date_group ON reflection_records(date, group_id)")
    conDebugLog('idx_reflection_records_date_group created OK')
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_reflection_students_unique ON reflection_students(reflection_record_id, student_id)")
    conDebugLog('idx_reflection_students_unique created OK')
  } catch (e: any) { conDebugLog(`cleanup ERROR: ${e?.message || e}`); console.error('reflection cleanup failed:', e) }

  // 导入种子数据（仅首次）
  runSeed(db)

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

/** 将数据库文件复制到 backups/ 子目录，保留时间戳备份 */
function backupDatabase(_dbPath: string): void {
  try {
    const dir = path.dirname(_dbPath)
    const backupDir = path.join(dir, 'backups')
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const bakName = `class-management-${ts}.db`
    const bakPath = path.join(backupDir, bakName)
    fs.copyFileSync(_dbPath, bakPath)
    console.log('数据库已备份:', bakPath)
  } catch (e) {
    console.error('备份失败:', e)
  }
}

/** 清理旧备份，只保留最近 MAX_BACKUPS 份 */
function cleanupOldBackups(_dbPath: string): void {
  try {
    const backupDir = path.join(path.dirname(_dbPath), 'backups')
    if (!fs.existsSync(backupDir)) return
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('class-management-') && f.endsWith('.db'))
      .map(f => ({ name: f, path: path.join(backupDir, f) }))
      .sort((a, b) => a.name.localeCompare(b.name))
    while (files.length > MAX_BACKUPS) {
      const oldest = files.shift()!
      fs.unlinkSync(oldest.path)
      console.log('清理旧备份:', oldest.name)
    }
  } catch (e) {
    console.error('清理备份失败:', e)
  }
}

/** 列出所有备份文件（供设置页面展示） */
export function listBackups(): { name: string; size: number; mtime: number }[] {
  if (!dbPath) return []
  const backupDir = path.join(path.dirname(dbPath), 'backups')
  if (!fs.existsSync(backupDir)) return []
  return fs.readdirSync(backupDir)
    .filter(f => f.startsWith('class-management-') && f.endsWith('.db'))
    .map(f => {
      const stat = fs.statSync(path.join(backupDir, f))
      return { name: f, size: stat.size, mtime: stat.mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

/** 手动创建一份备份 */
export function createBackup(): string | null {
  if (!dbPath || !fs.existsSync(dbPath)) return null
  saveDatabase()
  backupDatabase(dbPath)
  cleanupOldBackups(dbPath)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  return `class-management-${ts}.db`
}

/** 从指定备份文件恢复数据库 */
export function restoreBackup(backupName: string): boolean {
  if (!dbPath) return false
  const backupDir = path.join(path.dirname(dbPath), 'backups')
  const bakPath = path.join(backupDir, backupName)
  if (!fs.existsSync(bakPath)) return false
  try {
    // 关闭当前数据库
    if (db) {
      db.close()
      db = null
    }
    // 用备份替换当前数据库文件
    fs.copyFileSync(bakPath, dbPath)
    return true
  } catch (e) {
    console.error('恢复备份失败:', e)
    return false
  }
}
