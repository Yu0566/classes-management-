"use strict";
// sql.js 兼容外观（facade），底层使用原生 better-sqlite3。
//
// 重要：本模块仅在 Electron 主进程中被 connection.ts 以 require() 懒加载。
// 纯 Node 的独立服务器走 sql.js 分支，永不加载此文件，因此不会触碰为
// Electron ABI 编译的原生二进制。
//
// 使用 require + any 包裹 better-sqlite3，避免两个 tsconfig 都需解析其类型声明。
Object.defineProperty(exports, "__esModule", { value: true });
exports.openBetterSqlite = openBetterSqlite;
// better-sqlite3 仅接受 number/string/bigint/Buffer/null。
// sql.js 历史上更宽松，这里在引擎边界统一归一化，避免 boolean/undefined 绑定报错。
function normalize(params) {
    return (params || []).map((p) => {
        if (typeof p === 'boolean')
            return p ? 1 : 0;
        if (p === undefined)
            return null;
        return p;
    });
}
function openBetterSqlite(dbPath) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    // WAL 日志 + 每次提交落盘：事务级原子 + 持久，杜绝断电致损坏
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.pragma('foreign_keys = ON');
    let lastChanges = 0;
    function exec(sql) {
        try {
            const stmt = db.prepare(sql);
            if (stmt.reader) {
                const columns = stmt.columns().map((c) => c.name);
                const values = stmt.raw().all();
                return [{ columns, values }];
            }
            const info = stmt.run();
            lastChanges = info.changes;
            return [];
        }
        catch {
            // 多语句 DDL / 事务控制语句 → 直接执行（无结果消费）
            db.exec(sql);
            return [];
        }
    }
    function run(sql, params = []) {
        try {
            const info = db.prepare(sql).run(...normalize(params));
            lastChanges = info.changes;
        }
        catch {
            // BEGIN/COMMIT/ROLLBACK 等无参语句
            db.exec(sql);
            lastChanges = 0;
        }
    }
    function prepare(sql) {
        const stmt = db.prepare(sql);
        let params = [];
        let it = null;
        let cur;
        return {
            bind(p) {
                params = p || [];
            },
            step() {
                if (!it)
                    it = stmt.iterate(...normalize(params));
                const n = it.next();
                cur = n.value;
                return !n.done;
            },
            getAsObject() {
                return cur || {};
            },
            free() {
                // 必须释放迭代器，否则连接保持 busy，后续语句会报错
                if (it && typeof it.return === 'function') {
                    try {
                        it.return();
                    }
                    catch { /* ignore */ }
                }
                it = null;
            },
        };
    }
    return {
        exec,
        run,
        prepare,
        getRowsModified() {
            return lastChanges;
        },
        export() {
            return db.serialize();
        },
        close() {
            db.close();
        },
        _checkpoint() {
            try {
                db.pragma('wal_checkpoint(TRUNCATE)');
            }
            catch { /* ignore */ }
        },
        _integrityOk() {
            try {
                return db.pragma('integrity_check', { simple: true }) === 'ok';
            }
            catch {
                return false;
            }
        },
    };
}
//# sourceMappingURL=engine-bsqlite.js.map