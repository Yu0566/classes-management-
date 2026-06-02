import { requireDatabase, saveDatabase } from './connection'

export function queryAll(sql: string, params: unknown[] = []): Record<string, unknown>[] {
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

export function queryOne(sql: string, params: unknown[] = []): Record<string, unknown> | undefined {
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

export function executeRun(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number } {
  const db = requireDatabase()
  db.run(sql, params)
  const rowsModified = db.getRowsModified()
  saveDatabase()
  return {
    changes: rowsModified,
    lastInsertRowid: -1,
  }
}

export function executeTransaction(operations: { sql: string; params?: unknown[] }[]): void {
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
