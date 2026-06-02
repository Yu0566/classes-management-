interface DBApi {
  query(sql: string, params?: unknown[]): Promise<{ success: boolean; data?: unknown[]; error?: string }>
  get(sql: string, params?: unknown[]): Promise<{ success: boolean; data?: unknown; error?: string }>
  run(sql: string, params?: unknown[]): Promise<{ success: boolean; changes?: number; error?: string }>
  transaction(operations: { sql: string; params?: unknown[] }[]): Promise<{ success: boolean; error?: string }>
}

let _backend: DBApi | null = null

export function setDBBackend(backend: DBApi): void {
  _backend = backend
}

function api(): DBApi {
  if (window.electronAPI?.db) return window.electronAPI.db as unknown as DBApi
  if (_backend) return _backend
  throw new Error('数据库未初始化：无 Electron IPC 也无 Capacitor 后端')
}

// 查询多行
export async function queryAll<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await api().query(sql, params)
  if (!result.success) throw new Error(result.error || '查询失败')
  return (result.data || []) as T[]
}

// 查询单行
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const result = await api().get(sql, params)
  if (!result.success) throw new Error(result.error || '查询失败')
  return result.data as T | undefined
}

// 执行写操作
export async function executeRun(
  sql: string,
  params: unknown[] = []
): Promise<{ changes: number }> {
  const result = await api().run(sql, params)
  if (!result.success) throw new Error(result.error || '执行失败')
  return { changes: result.changes || 0 }
}

// 执行事务
export async function executeTransaction(
  operations: { sql: string; params?: unknown[] }[]
): Promise<void> {
  const result = await api().transaction(operations)
  if (!result.success) throw new Error(result.error || '事务执行失败')
}
