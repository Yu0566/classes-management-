// sql.js 兼容外观（facade），底层使用原生 better-sqlite3。
//
// 重要：本模块仅在 Electron 主进程中被 connection.ts 以 require() 懒加载。
// 纯 Node 的独立服务器走 sql.js 分支，永不加载此文件，因此不会触碰为
// Electron ABI 编译的原生二进制。
//
// 使用 require + any 包裹 better-sqlite3，避免两个 tsconfig 都需解析其类型声明。

type SqlValue = string | number | Uint8Array | null | bigint | boolean | undefined

export interface SqlJsLikeStatement {
  bind(params: SqlValue[]): void
  step(): boolean
  getAsObject(): Record<string, unknown>
  free(): void
}

export interface SqlJsLikeDatabase {
  exec(sql: string): { columns: string[]; values: unknown[][] }[]
  run(sql: string, params?: SqlValue[]): void
  prepare(sql: string): SqlJsLikeStatement
  getRowsModified(): number
  export(): Uint8Array
  close(): void
  /** 内部：WAL 检查点（备份前调用，确保 .db 单文件完整） */
  _checkpoint(): void
  /** 内部：深度完整性校验 */
  _integrityOk(): boolean
}

// better-sqlite3 仅接受 number/string/bigint/Buffer/null。
// sql.js 历史上更宽松，这里在引擎边界统一归一化，避免 boolean/undefined 绑定报错。
function normalize(params: SqlValue[] | undefined): unknown[] {
  return (params || []).map((p) => {
    if (typeof p === 'boolean') return p ? 1 : 0
    if (p === undefined) return null
    return p
  })
}

export function openBetterSqlite(dbPath: string): SqlJsLikeDatabase {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database: any = require('better-sqlite3')
  const db: any = new Database(dbPath)

  // WAL 日志 + 每次提交落盘：事务级原子 + 持久，杜绝断电致损坏
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = FULL')
  db.pragma('foreign_keys = ON')

  let lastChanges = 0

  function exec(sql: string): { columns: string[]; values: unknown[][] }[] {
    try {
      const stmt = db.prepare(sql)
      if (stmt.reader) {
        const columns = stmt.columns().map((c: any) => c.name as string)
        const values = stmt.raw().all() as unknown[][]
        return [{ columns, values }]
      }
      const info = stmt.run()
      lastChanges = info.changes
      return []
    } catch {
      // 多语句 DDL / 事务控制语句 → 直接执行（无结果消费）
      db.exec(sql)
      return []
    }
  }

  function run(sql: string, params: SqlValue[] = []): void {
    try {
      const info = db.prepare(sql).run(...normalize(params))
      lastChanges = info.changes
    } catch {
      // BEGIN/COMMIT/ROLLBACK 等无参语句
      db.exec(sql)
      lastChanges = 0
    }
  }

  function prepare(sql: string): SqlJsLikeStatement {
    const stmt = db.prepare(sql)
    let params: SqlValue[] = []
    let it: Iterator<Record<string, unknown>> | null = null
    let cur: Record<string, unknown> | undefined

    return {
      bind(p: SqlValue[]) {
        params = p || []
      },
      step(): boolean {
        if (!it) it = stmt.iterate(...normalize(params)) as Iterator<Record<string, unknown>>
        const n = it.next()
        cur = n.value as Record<string, unknown> | undefined
        return !n.done
      },
      getAsObject() {
        return cur || {}
      },
      free() {
        // 必须释放迭代器，否则连接保持 busy，后续语句会报错
        if (it && typeof (it as any).return === 'function') {
          try { (it as any).return() } catch { /* ignore */ }
        }
        it = null
      },
    }
  }

  return {
    exec,
    run,
    prepare,
    getRowsModified() {
      return lastChanges
    },
    export(): Uint8Array {
      return db.serialize()
    },
    close() {
      db.close()
    },
    _checkpoint() {
      try { db.pragma('wal_checkpoint(TRUNCATE)') } catch { /* ignore */ }
    },
    _integrityOk(): boolean {
      try { return db.pragma('integrity_check', { simple: true }) === 'ok' } catch { return false }
    },
  }
}
