async function apiCall(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`/api/db/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const httpDB = {
  query: (sql: string, params?: unknown[]): Promise<{ success: boolean; data?: unknown[]; error?: string }> =>
    apiCall('query', { sql, params }),
  get: (sql: string, params?: unknown[]): Promise<{ success: boolean; data?: unknown; error?: string }> =>
    apiCall('get', { sql, params }),
  run: (sql: string, params?: unknown[]): Promise<{ success: boolean; changes?: number; error?: string }> =>
    apiCall('run', { sql, params }),
  transaction: (operations: { sql: string; params?: unknown[] }[]): Promise<{ success: boolean; error?: string }> =>
    apiCall('transaction', { operations }),
}
