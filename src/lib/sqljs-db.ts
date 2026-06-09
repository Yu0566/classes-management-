import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import type { SqlValue } from 'sql.js'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { runMigrations } from './migrations'
import { getSeedData } from './seed-data'
import { v4 as uuid } from 'uuid'

const DB_FILENAME = 'class-management.db'

let db: SqlJsDatabase | null = null
let SQL: any = null

function getDB(): SqlJsDatabase {
  if (!db) throw new Error('数据库未初始化')
  return db
}

function asParams(params: unknown[]): SqlValue[] {
  return params as SqlValue[]
}

function toBase64(uint8: Uint8Array): string {
  let binary = ''
  uint8.forEach(byte => binary += String.fromCharCode(byte))
  return btoa(binary)
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export async function initCapacitorDB(): Promise<void> {
  SQL = await initSqlJs({
    locateFile: (file: string) => `/${file}`,
  })

  let buffer: Uint8Array | null = null
  try {
    const result = await Filesystem.readFile({
      path: DB_FILENAME,
      directory: Directory.Data,
    })
    buffer = fromBase64(result.data as string)
  } catch {
    // 首次启动，无数据库文件
  }

  if (buffer && buffer.length > 0) {
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  const database = getDB()
  database.run('PRAGMA foreign_keys = ON')
  runMigrations(database)

  // 种子数据：只在数据库完全为空时导入（首次启动），绝不覆盖已有数据
  const groupResult = database.exec('SELECT COUNT(*) as cnt FROM groups')
  const dbGroupCount = (groupResult.length > 0 ? groupResult[0].values[0][0] : 0) as number
  const seed = getSeedData()

  if (dbGroupCount === 0) {
    const now = Date.now()
    for (const g of seed.groups) {
      database.run(
        'INSERT INTO groups (id, name, color, leader_name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        asParams([uuid(), g.name, g.color, g.leader_name, g.sort_order ?? 0, now, now])
      )
    }

    for (const s of seed.students) {
      const groupRows = database.exec('SELECT id FROM groups WHERE name = ?', [s.group_name])
      const groupId = groupRows[0]?.values[0][0] as string | undefined
      if (groupId) {
        database.run(
          `INSERT INTO students (id, name, group_id, practice_label, lunch_label, lunch_longterm, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          asParams([uuid(), s.name, groupId, s.practice_label || '', s.lunch_label || '', s.lunch_longterm ?? 0, now, now])
        )
      }
    }
  }

  await saveDatabase()
}

async function saveDatabase(): Promise<void> {
  const database = getDB()
  const data = database.export()
  await Filesystem.writeFile({
    path: DB_FILENAME,
    data: toBase64(data),
    directory: Directory.Data,
  })
}

export const capacitorDB = {
  async query(sql: string, params: unknown[] = []) {
    const database = getDB()
    try {
      const stmt = database.prepare(sql)
      stmt.bind(asParams(params))
      const rows: Record<string, unknown>[] = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject())
      }
      stmt.free()
      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  async get(sql: string, params: unknown[] = []) {
    const database = getDB()
    try {
      const stmt = database.prepare(sql)
      stmt.bind(asParams(params))
      let row: Record<string, unknown> | undefined
      if (stmt.step()) {
        row = stmt.getAsObject()
      }
      stmt.free()
      return { success: true, data: row }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  async run(sql: string, params: unknown[] = []) {
    const database = getDB()
    try {
      database.run(sql, asParams(params))
      await saveDatabase()
      const changes = database.getRowsModified()
      return { success: true, changes }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },

  async transaction(operations: { sql: string; params?: unknown[] }[]) {
    const database = getDB()
    try {
      database.run('BEGIN TRANSACTION')
      for (const op of operations) {
        database.run(op.sql, asParams(op.params || []))
      }
      database.run('COMMIT')
      await saveDatabase()
      return { success: true }
    } catch (err: any) {
      try { database.run('ROLLBACK') } catch { /* ignore */ }
      return { success: false, error: err.message }
    }
  },
}
