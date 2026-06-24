import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import fs from 'fs'
import path from 'path'
import { runMigrations, SCHEMA_VERSION } from './migrations'
import { runSeed } from './seed'
import type { SqlJsLikeDatabase } from './engine-bsqlite'

function conDebugLog(msg: string): void {
  try {
    const logPath = path.join(process.env.APPDATA || process.env.HOME || '.', 'class-management-dev', 'migration-debug.log')
    const dir = path.dirname(logPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] CONN: ${msg}\n`)
  } catch (_) { /* ignore */ }
}

let db: SqlJsDatabase | SqlJsLikeDatabase | null = null
let dbPath: string = ''
// Electron 主进程用 better-sqlite3（WAL+FULL，治本断电损坏）；纯 Node 独立服务器用 sql.js
let useBetterSqlite = false

const MAX_BACKUPS = 20

export { SCHEMA_VERSION }

export interface BackupChoice { name: string; path: string; mtime: number }
export type RecoveryDecision = { action: 'restore'; backupPath: string } | { action: 'fresh' }
export type RecoveryHandler = (info: { backups: BackupChoice[]; lastFailed?: string }) => Promise<RecoveryDecision>

/** 列出 backups/ 目录下的备份，按时间倒序（最新在前），返回含完整路径 */
function getBackupList(backupDir: string): BackupChoice[] {
  if (!fs.existsSync(backupDir)) return []
  return fs.readdirSync(backupDir)
    .filter(f => f.startsWith('class-management-') && f.endsWith('.db'))
    .map(f => {
      const p = path.join(backupDir, f)
      const stat = fs.statSync(p)
      return { name: f, path: p, mtime: stat.mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

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

// 一次完整的初始化流水线：外键 → 迁移 → reflection 清理 → 种子。两种引擎共用（均提供 run/exec）。
function runPipeline(d: any): void {
  d.run('PRAGMA foreign_keys = ON')
  runMigrations(d)
  // 强力去重：确保 reflection 表没有重复且唯一约束存在
  // 注意：必须先删 students（外键引用 records），再删 records
  conDebugLog('cleanup starting...')
  try {
    d.exec("DELETE FROM reflection_students WHERE reflection_record_id IN (SELECT id FROM reflection_records WHERE id NOT IN (SELECT MIN(id) FROM reflection_records GROUP BY date, group_id))")
    d.exec("DELETE FROM reflection_records WHERE id NOT IN (SELECT MIN(id) FROM reflection_records GROUP BY date, group_id)")
    d.exec("DELETE FROM reflection_students WHERE reflection_record_id NOT IN (SELECT id FROM reflection_records)")
    d.exec("DELETE FROM reflection_students WHERE id NOT IN (SELECT MIN(id) FROM reflection_students GROUP BY reflection_record_id, student_id)")
    d.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_reflection_records_date_group ON reflection_records(date, group_id)")
    d.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_reflection_students_unique ON reflection_students(reflection_record_id, student_id)")
  } catch (e: any) { conDebugLog(`cleanup ERROR: ${e?.message || e}`); console.error('reflection cleanup failed:', e) }
  // 导入种子数据（仅首次）
  runSeed(d)
}

/** 删除主库及其 WAL/SHM 边车文件（better-sqlite3 恢复前用，避免与新文件不一致） */
function discardMainFiles(): void {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix) } catch { /* ignore */ }
  }
}

/** 将损坏的主库文件备份一次 */
function backupCorruptMain(): void {
  if (!fs.existsSync(dbPath)) return
  const bakPath = dbPath + '.corrupted-' + Date.now() + '.bak'
  try { fs.copyFileSync(dbPath, bakPath); console.error('损坏的数据库已备份到:', bakPath) } catch { /* ignore */ }
}

export async function initDatabase(_dbPath: string, onNeedRecovery?: RecoveryHandler): Promise<void> {
  dbPath = _dbPath

  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  useBetterSqlite = !!process.versions.electron
  if (useBetterSqlite) {
    await initWithBetterSqlite(onNeedRecovery)
  } else {
    await initWithSqlJs(onNeedRecovery)
  }
}

// ── Electron：原生 better-sqlite3（WAL + synchronous=FULL）──────────────
async function initWithBetterSqlite(onNeedRecovery?: RecoveryHandler): Promise<void> {
  // 懒加载：仅在 Electron 分支 require，纯 Node 服务器永不触碰原生模块
  const { openBetterSqlite } = require('./engine-bsqlite') as typeof import('./engine-bsqlite')
  const dir = path.dirname(dbPath)
  const backupDir = path.join(dir, 'backups')
  const mainExisted = fs.existsSync(dbPath)

  // 打开 dbPath（不存在则创建）并完整初始化；失败则关闭返回 null
  function attemptMain(): SqlJsLikeDatabase | null {
    let handle: SqlJsLikeDatabase | null = null
    try {
      handle = openBetterSqlite(dbPath)
      if (!handle._integrityOk()) throw new Error('integrity_check 未通过')
      runPipeline(handle)
      return handle
    } catch (e: any) {
      console.log(`[DB] ${dbPath} 加载或迁移失败: ${e?.message || e}`)
      if (handle) { try { handle.close() } catch { /* ignore */ } }
      return null
    }
  }

  db = attemptMain()
  let recovered = false

  // 主文件存在却打不开 → 损坏，进入用户决策（恢复可能涉及数据丢失）
  if (!db && mainExisted) {
    backupCorruptMain()
    discardMainFiles()
    recovered = true
    const backups = getBackupList(backupDir)

    if (onNeedRecovery) {
      let lastFailed: string | undefined
      while (!db) {
        const decision = await onNeedRecovery({ backups, lastFailed })
        if (decision.action === 'fresh') break
        if (decision.action === 'restore' && fs.existsSync(decision.backupPath)) {
          discardMainFiles()
          fs.copyFileSync(decision.backupPath, dbPath)
          db = attemptMain()
          if (db) break
          lastFailed = path.basename(decision.backupPath)
        } else {
          lastFailed = decision.action === 'restore' ? path.basename(decision.backupPath) : undefined
        }
      }
    } else {
      // 无回调（理论上 Electron 总会传，留作兜底）：自动用最新可用备份
      for (const b of backups) {
        discardMainFiles()
        fs.copyFileSync(b.path, dbPath)
        db = attemptMain()
        if (db) break
      }
    }
  }

  // 仍无可用数据 → 全新空库（主库已清理，openBetterSqlite 会新建）
  if (!db) {
    discardMainFiles()
    db = attemptMain()
    recovered = recovered || mainExisted
    console.log('已创建空白数据库')
  }

  // 例行启动备份：仅正常打开（未经历恢复）时备份，避免污染备份目录
  if (db && !recovered) {
    backupDatabase(dbPath)
    cleanupOldBackups(dbPath)
  }

  console.log('数据库已加载(better-sqlite3):', dbPath)
}

// ── 纯 Node 独立服务器：sql.js（保留原有原子写 + .tmp/.prev 恢复链）──────
async function initWithSqlJs(onNeedRecovery?: RecoveryHandler): Promise<void> {
  const dir = path.dirname(dbPath)
  const SQL = await initSqlJs()

  // 尝试加载一个来源并完整初始化：深度完整性校验 + 整条流水线。
  function attempt(label: string, buffer: Uint8Array): SqlJsDatabase | null {
    let d: SqlJsDatabase | null = null
    try {
      d = new SQL.Database(buffer)
      const res = d.exec('PRAGMA integrity_check')
      const ok = res?.[0]?.values?.[0]?.[0] === 'ok'
      if (!ok) throw new Error('integrity_check 未通过')
      runPipeline(d)
      return d
    } catch (e: any) {
      console.log(`[DB] ${label} 加载或迁移失败: ${e?.message || e}`)
      if (d) { try { d.close() } catch { /* ignore */ } }
      return null
    }
  }

  const backupDir = path.join(dir, 'backups')
  let loadedFrom = ''
  let builtEmpty = false
  db = null

  // 第一档：无数据丢失来源（主文件 → .tmp → .prev），能恢复就静默恢复
  for (const src of [dbPath, dbPath + '.tmp', dbPath + '.prev']) {
    if (db) break
    if (fs.existsSync(src)) {
      db = attempt(src, fs.readFileSync(src))
      if (db) loadedFrom = src
    }
  }

  // 第二档：上述均失败，可能涉及数据丢失（回退旧备份 / 全新开始）
  if (!db) {
    const backups = getBackupList(backupDir)
    if (onNeedRecovery) {
      let lastFailed: string | undefined
      while (!db) {
        const decision = await onNeedRecovery({ backups, lastFailed })
        if (decision.action === 'fresh') break
        if (decision.action === 'restore' && fs.existsSync(decision.backupPath)) {
          db = attempt(decision.backupPath, fs.readFileSync(decision.backupPath))
          if (db) { loadedFrom = decision.backupPath; break }
          lastFailed = path.basename(decision.backupPath)
        } else {
          lastFailed = decision.action === 'restore' ? path.basename(decision.backupPath) : undefined
        }
      }
    } else {
      for (const b of backups) {
        db = attempt(b.path, fs.readFileSync(b.path))
        if (db) { loadedFrom = b.path; break }
      }
    }
  }

  // 第三档：仍无可用数据 → 备份损坏主文件后建空库
  if (!db) {
    backupCorruptMain()
    db = new SQL.Database()
    runPipeline(db)
    builtEmpty = true
    loadedFrom = ''
    console.log('已创建空白数据库')
  }

  // 从非主文件恢复 → 写回主文件
  if (loadedFrom && loadedFrom !== dbPath) {
    console.log('数据库从', loadedFrom, '恢复，写回主文件')
    fs.writeFileSync(dbPath, Buffer.from((db as SqlJsDatabase).export()))
  }

  // 例行启动备份（空库不备份，避免污染备份目录）
  if (!builtEmpty && fs.existsSync(dbPath)) {
    backupDatabase(dbPath)
    cleanupOldBackups(dbPath)
  }

  console.log('数据库已加载:', dbPath)

  // 立即持久化
  saveDatabase()
}

export function saveDatabase(): void {
  if (!db || !dbPath) return
  // better-sqlite3：WAL + synchronous=FULL 已逐事务落盘，无需手动保存
  if (useBetterSqlite) return
  const data = (db as SqlJsDatabase).export()
  const buffer = Buffer.from(data)

  // 原子写入：先写 .tmp，再用 rename 替换。中途断电只会丢 .tmp，原文件完好
  const tmpPath = dbPath + '.tmp'
  fs.writeFileSync(tmpPath, buffer)

  // rename 前保留 .prev 作为最后一版完好数据（双重保险）
  try { fs.unlinkSync(dbPath + '.prev') } catch (_) { /* 旧 prev 不存在 */ }
  if (fs.existsSync(dbPath)) {
    try { fs.renameSync(dbPath, dbPath + '.prev') } catch (_) { /* dbPath 被占用 */ }
  }

  fs.renameSync(tmpPath, dbPath)

  // 写入成功，清理 .prev
  try { fs.unlinkSync(dbPath + '.prev') } catch (_) { /* ignore */ }
}

export function getDatabase(): any {
  return db
}

export function requireDatabase(): any {
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
    // better-sqlite3：先 checkpoint 把 WAL 合并进主文件，确保拷贝单一 .db 即完整
    if (useBetterSqlite && db) {
      try { (db as SqlJsLikeDatabase)._checkpoint() } catch { /* ignore */ }
    }
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
    // better-sqlite3：删除残留的 WAL/SHM 边车，避免与新主文件不一致
    if (useBetterSqlite) {
      for (const suffix of ['-wal', '-shm']) {
        try { fs.unlinkSync(dbPath + suffix) } catch { /* ignore */ }
      }
    }
    // 用备份替换当前数据库文件
    fs.copyFileSync(bakPath, dbPath)
    return true
  } catch (e) {
    console.error('恢复备份失败:', e)
    return false
  }
}
