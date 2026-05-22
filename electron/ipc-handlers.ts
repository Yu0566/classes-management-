import { ipcMain } from 'electron'
import { requireDatabase, saveDatabase } from './database/connection'

// sql.js 辅助函数：执行查询并返回所有行
function queryAll(sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const db = requireDatabase()
  const stmt = db.prepare(sql)
  if (params.length > 0) {
    stmt.bind(params)
  }
  const results: Record<string, unknown>[] = []
  while (stmt.step()) {
    results.push({ ...stmt.getAsObject() })
  }
  stmt.free()
  return results
}

// sql.js 辅助函数：执行查询并返回单行
function queryOne(sql: string, params: unknown[] = []): Record<string, unknown> | undefined {
  const db = requireDatabase()
  const stmt = db.prepare(sql)
  if (params.length > 0) {
    stmt.bind(params)
  }
  let result: Record<string, unknown> | undefined
  if (stmt.step()) {
    result = { ...stmt.getAsObject() }
  }
  stmt.free()
  return result
}

// sql.js 辅助函数：执行写操作
function executeRun(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number } {
  const db = requireDatabase()
  // sql.js run 会执行语句并修改数据库
  db.run(sql, params)
  const rowsModified = db.getRowsModified()
  saveDatabase()
  return {
    changes: rowsModified,
    lastInsertRowid: -1, // sql.js 不直接提供 lastInsertRowid
  }
}

// sql.js 辅助函数：执行事务
function executeTransaction(operations: { sql: string; params?: unknown[] }[]): void {
  const db = requireDatabase()
  try {
    db.run('BEGIN TRANSACTION')
    for (const op of operations) {
      db.run(op.sql, op.params || [])
    }
    db.run('COMMIT')
    saveDatabase()
  } catch (err) {
    db.run('ROLLBACK')
    saveDatabase()
    throw err
  }
}

export function registerIpcHandlers(): void {
  // 查询多行
  ipcMain.handle('db:query', (_event, sql: string, params?: unknown[]) => {
    try {
      return { success: true, data: queryAll(sql, params) }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // 执行写操作
  ipcMain.handle('db:run', (_event, sql: string, params?: unknown[]) => {
    try {
      const result = executeRun(sql, params)
      return { success: true, ...result }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // 查询单行
  ipcMain.handle('db:get', (_event, sql: string, params?: unknown[]) => {
    try {
      return { success: true, data: queryOne(sql, params) }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })

  // 事务
  ipcMain.handle('db:transaction', (_event, operations: { sql: string; params?: unknown[] }[]) => {
    try {
      executeTransaction(operations)
      return { success: true }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, error: msg }
    }
  })
}
