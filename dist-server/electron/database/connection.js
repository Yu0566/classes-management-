"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEMA_VERSION = void 0;
exports.checkOldData = checkOldData;
exports.initDatabase = initDatabase;
exports.saveDatabase = saveDatabase;
exports.getDatabase = getDatabase;
exports.requireDatabase = requireDatabase;
exports.closeDatabase = closeDatabase;
exports.listBackups = listBackups;
exports.createBackup = createBackup;
exports.restoreBackup = restoreBackup;
const sql_js_1 = __importDefault(require("sql.js"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const migrations_1 = require("./migrations");
Object.defineProperty(exports, "SCHEMA_VERSION", { enumerable: true, get: function () { return migrations_1.SCHEMA_VERSION; } });
const seed_1 = require("./seed");
function conDebugLog(msg) {
    try {
        const logPath = path_1.default.join(process.env.APPDATA || process.env.HOME || '.', 'class-management-dev', 'migration-debug.log');
        const dir = path_1.default.dirname(logPath);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.appendFileSync(logPath, `[${new Date().toISOString()}] CONN: ${msg}\n`);
    }
    catch (_) { /* ignore */ }
}
let db = null;
let dbPath = '';
// Electron 主进程用 better-sqlite3（WAL+FULL，治本断电损坏）；纯 Node 独立服务器用 sql.js
let useBetterSqlite = false;
const MAX_BACKUPS = 20;
/** 列出 backups/ 目录下的备份，按时间倒序（最新在前），返回含完整路径 */
function getBackupList(backupDir) {
    if (!fs_1.default.existsSync(backupDir))
        return [];
    return fs_1.default.readdirSync(backupDir)
        .filter(f => f.startsWith('class-management-') && f.endsWith('.db'))
        .map(f => {
        const p = path_1.default.join(backupDir, f);
        const stat = fs_1.default.statSync(p);
        return { name: f, path: p, mtime: stat.mtimeMs };
    })
        .sort((a, b) => b.mtime - a.mtime);
}
/**
 * 在正式初始化之前临时打开数据库，检测是否有旧版本数据。
 * 判断标准：students 表有数据，但 _meta 表不存在（pre-schema-versioning 的旧库）。
 */
async function checkOldData(_dbPath) {
    if (!fs_1.default.existsSync(_dbPath)) {
        return { hasOldData: false, studentCount: 0 };
    }
    const SQL = await (0, sql_js_1.default)();
    const buffer = fs_1.default.readFileSync(_dbPath);
    const tempDb = new SQL.Database(buffer);
    try {
        let studentCount = 0;
        let hasMeta = false;
        // 检查 students 表是否有数据
        try {
            const rows = tempDb.exec('SELECT COUNT(*) AS cnt FROM students');
            studentCount = rows?.[0]?.values?.[0]?.[0] || 0;
        }
        catch {
            // students 表不存在 = 空库或损坏库
        }
        // 检查 _meta 表是否存在（有 _meta 说明已被新版本处理过）
        try {
            tempDb.exec('SELECT key, value FROM _meta LIMIT 1');
            hasMeta = true;
        }
        catch {
            // _meta 表不存在 = 旧版本数据库
        }
        // 旧数据判定：有学生记录 且 没有 _meta 表
        const hasOldData = studentCount > 0 && !hasMeta;
        return { hasOldData, studentCount };
    }
    finally {
        tempDb.close();
    }
}
// 一次完整的初始化流水线：外键 → 迁移 → reflection 清理 → 种子。两种引擎共用（均提供 run/exec）。
function runPipeline(d) {
    d.run('PRAGMA foreign_keys = ON');
    (0, migrations_1.runMigrations)(d);
    // 强力去重：确保 reflection 表没有重复且唯一约束存在
    // 注意：必须先删 students（外键引用 records），再删 records
    conDebugLog('cleanup starting...');
    try {
        d.exec("DELETE FROM reflection_students WHERE reflection_record_id IN (SELECT id FROM reflection_records WHERE id NOT IN (SELECT MIN(id) FROM reflection_records GROUP BY date, group_id))");
        d.exec("DELETE FROM reflection_records WHERE id NOT IN (SELECT MIN(id) FROM reflection_records GROUP BY date, group_id)");
        d.exec("DELETE FROM reflection_students WHERE reflection_record_id NOT IN (SELECT id FROM reflection_records)");
        d.exec("DELETE FROM reflection_students WHERE id NOT IN (SELECT MIN(id) FROM reflection_students GROUP BY reflection_record_id, student_id)");
        d.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_reflection_records_date_group ON reflection_records(date, group_id)");
        d.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_reflection_students_unique ON reflection_students(reflection_record_id, student_id)");
    }
    catch (e) {
        conDebugLog(`cleanup ERROR: ${e?.message || e}`);
        console.error('reflection cleanup failed:', e);
    }
    // 导入种子数据（仅首次）
    (0, seed_1.runSeed)(d);
}
/** 删除主库及其 WAL/SHM 边车文件（better-sqlite3 恢复前用，避免与新文件不一致） */
function discardMainFiles() {
    for (const suffix of ['', '-wal', '-shm']) {
        try {
            fs_1.default.unlinkSync(dbPath + suffix);
        }
        catch { /* ignore */ }
    }
}
/** 将损坏的主库文件备份一次 */
function backupCorruptMain() {
    if (!fs_1.default.existsSync(dbPath))
        return;
    const bakPath = dbPath + '.corrupted-' + Date.now() + '.bak';
    try {
        fs_1.default.copyFileSync(dbPath, bakPath);
        console.error('损坏的数据库已备份到:', bakPath);
    }
    catch { /* ignore */ }
}
async function initDatabase(_dbPath, onNeedRecovery) {
    dbPath = _dbPath;
    const dir = path_1.default.dirname(dbPath);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    useBetterSqlite = !!process.versions.electron;
    if (useBetterSqlite) {
        await initWithBetterSqlite(onNeedRecovery);
    }
    else {
        await initWithSqlJs(onNeedRecovery);
    }
}
// ── Electron：原生 better-sqlite3（WAL + synchronous=FULL）──────────────
async function initWithBetterSqlite(onNeedRecovery) {
    // 懒加载：仅在 Electron 分支 require，纯 Node 服务器永不触碰原生模块
    const { openBetterSqlite } = require('./engine-bsqlite');
    const dir = path_1.default.dirname(dbPath);
    const backupDir = path_1.default.join(dir, 'backups');
    const mainExisted = fs_1.default.existsSync(dbPath);
    // 打开 dbPath（不存在则创建）并完整初始化；失败则关闭返回 null
    function attemptMain() {
        let handle = null;
        try {
            handle = openBetterSqlite(dbPath);
            if (!handle._integrityOk())
                throw new Error('integrity_check 未通过');
            runPipeline(handle);
            return handle;
        }
        catch (e) {
            console.log(`[DB] ${dbPath} 加载或迁移失败: ${e?.message || e}`);
            if (handle) {
                try {
                    handle.close();
                }
                catch { /* ignore */ }
            }
            return null;
        }
    }
    db = attemptMain();
    let recovered = false;
    // 主文件存在却打不开 → 损坏，进入用户决策（恢复可能涉及数据丢失）
    if (!db && mainExisted) {
        backupCorruptMain();
        discardMainFiles();
        recovered = true;
        const backups = getBackupList(backupDir);
        if (onNeedRecovery) {
            let lastFailed;
            while (!db) {
                const decision = await onNeedRecovery({ backups, lastFailed });
                if (decision.action === 'fresh')
                    break;
                if (decision.action === 'restore' && fs_1.default.existsSync(decision.backupPath)) {
                    discardMainFiles();
                    fs_1.default.copyFileSync(decision.backupPath, dbPath);
                    db = attemptMain();
                    if (db)
                        break;
                    lastFailed = path_1.default.basename(decision.backupPath);
                }
                else {
                    lastFailed = decision.action === 'restore' ? path_1.default.basename(decision.backupPath) : undefined;
                }
            }
        }
        else {
            // 无回调（理论上 Electron 总会传，留作兜底）：自动用最新可用备份
            for (const b of backups) {
                discardMainFiles();
                fs_1.default.copyFileSync(b.path, dbPath);
                db = attemptMain();
                if (db)
                    break;
            }
        }
    }
    // 仍无可用数据 → 全新空库（主库已清理，openBetterSqlite 会新建）
    if (!db) {
        discardMainFiles();
        db = attemptMain();
        recovered = recovered || mainExisted;
        console.log('已创建空白数据库');
    }
    // 例行启动备份：仅正常打开（未经历恢复）时备份，避免污染备份目录
    if (db && !recovered) {
        backupDatabase(dbPath);
        cleanupOldBackups(dbPath);
    }
    console.log('数据库已加载(better-sqlite3):', dbPath);
}
// ── 纯 Node 独立服务器：sql.js（保留原有原子写 + .tmp/.prev 恢复链）──────
async function initWithSqlJs(onNeedRecovery) {
    const dir = path_1.default.dirname(dbPath);
    const SQL = await (0, sql_js_1.default)();
    // 尝试加载一个来源并完整初始化：深度完整性校验 + 整条流水线。
    function attempt(label, buffer) {
        let d = null;
        try {
            d = new SQL.Database(buffer);
            const res = d.exec('PRAGMA integrity_check');
            const ok = res?.[0]?.values?.[0]?.[0] === 'ok';
            if (!ok)
                throw new Error('integrity_check 未通过');
            runPipeline(d);
            return d;
        }
        catch (e) {
            console.log(`[DB] ${label} 加载或迁移失败: ${e?.message || e}`);
            if (d) {
                try {
                    d.close();
                }
                catch { /* ignore */ }
            }
            return null;
        }
    }
    const backupDir = path_1.default.join(dir, 'backups');
    let loadedFrom = '';
    let builtEmpty = false;
    db = null;
    // 第一档：无数据丢失来源（主文件 → .tmp → .prev），能恢复就静默恢复
    for (const src of [dbPath, dbPath + '.tmp', dbPath + '.prev']) {
        if (db)
            break;
        if (fs_1.default.existsSync(src)) {
            db = attempt(src, fs_1.default.readFileSync(src));
            if (db)
                loadedFrom = src;
        }
    }
    // 第二档：上述均失败，可能涉及数据丢失（回退旧备份 / 全新开始）
    if (!db) {
        const backups = getBackupList(backupDir);
        if (onNeedRecovery) {
            let lastFailed;
            while (!db) {
                const decision = await onNeedRecovery({ backups, lastFailed });
                if (decision.action === 'fresh')
                    break;
                if (decision.action === 'restore' && fs_1.default.existsSync(decision.backupPath)) {
                    db = attempt(decision.backupPath, fs_1.default.readFileSync(decision.backupPath));
                    if (db) {
                        loadedFrom = decision.backupPath;
                        break;
                    }
                    lastFailed = path_1.default.basename(decision.backupPath);
                }
                else {
                    lastFailed = decision.action === 'restore' ? path_1.default.basename(decision.backupPath) : undefined;
                }
            }
        }
        else {
            for (const b of backups) {
                db = attempt(b.path, fs_1.default.readFileSync(b.path));
                if (db) {
                    loadedFrom = b.path;
                    break;
                }
            }
        }
    }
    // 第三档：仍无可用数据 → 备份损坏主文件后建空库
    if (!db) {
        backupCorruptMain();
        db = new SQL.Database();
        runPipeline(db);
        builtEmpty = true;
        loadedFrom = '';
        console.log('已创建空白数据库');
    }
    // 从非主文件恢复 → 写回主文件
    if (loadedFrom && loadedFrom !== dbPath) {
        console.log('数据库从', loadedFrom, '恢复，写回主文件');
        fs_1.default.writeFileSync(dbPath, Buffer.from(db.export()));
    }
    // 例行启动备份（空库不备份，避免污染备份目录）
    if (!builtEmpty && fs_1.default.existsSync(dbPath)) {
        backupDatabase(dbPath);
        cleanupOldBackups(dbPath);
    }
    console.log('数据库已加载:', dbPath);
    // 立即持久化
    saveDatabase();
}
function saveDatabase() {
    if (!db || !dbPath)
        return;
    // better-sqlite3：WAL + synchronous=FULL 已逐事务落盘，无需手动保存
    if (useBetterSqlite)
        return;
    const data = db.export();
    const buffer = Buffer.from(data);
    // 原子写入：先写 .tmp，再用 rename 替换。中途断电只会丢 .tmp，原文件完好
    const tmpPath = dbPath + '.tmp';
    fs_1.default.writeFileSync(tmpPath, buffer);
    // rename 前保留 .prev 作为最后一版完好数据（双重保险）
    try {
        fs_1.default.unlinkSync(dbPath + '.prev');
    }
    catch (_) { /* 旧 prev 不存在 */ }
    if (fs_1.default.existsSync(dbPath)) {
        try {
            fs_1.default.renameSync(dbPath, dbPath + '.prev');
        }
        catch (_) { /* dbPath 被占用 */ }
    }
    fs_1.default.renameSync(tmpPath, dbPath);
    // 写入成功，清理 .prev
    try {
        fs_1.default.unlinkSync(dbPath + '.prev');
    }
    catch (_) { /* ignore */ }
}
function getDatabase() {
    return db;
}
function requireDatabase() {
    if (!db) {
        throw new Error('数据库未初始化');
    }
    return db;
}
function closeDatabase() {
    if (db) {
        saveDatabase();
        db.close();
        db = null;
    }
}
/** 将数据库文件复制到 backups/ 子目录，保留时间戳备份 */
function backupDatabase(_dbPath) {
    try {
        // better-sqlite3：先 checkpoint 把 WAL 合并进主文件，确保拷贝单一 .db 即完整
        if (useBetterSqlite && db) {
            try {
                db._checkpoint();
            }
            catch { /* ignore */ }
        }
        const dir = path_1.default.dirname(_dbPath);
        const backupDir = path_1.default.join(dir, 'backups');
        if (!fs_1.default.existsSync(backupDir)) {
            fs_1.default.mkdirSync(backupDir, { recursive: true });
        }
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const bakName = `class-management-${ts}.db`;
        const bakPath = path_1.default.join(backupDir, bakName);
        fs_1.default.copyFileSync(_dbPath, bakPath);
        console.log('数据库已备份:', bakPath);
    }
    catch (e) {
        console.error('备份失败:', e);
    }
}
/** 清理旧备份，只保留最近 MAX_BACKUPS 份 */
function cleanupOldBackups(_dbPath) {
    try {
        const backupDir = path_1.default.join(path_1.default.dirname(_dbPath), 'backups');
        if (!fs_1.default.existsSync(backupDir))
            return;
        const files = fs_1.default.readdirSync(backupDir)
            .filter(f => f.startsWith('class-management-') && f.endsWith('.db'))
            .map(f => ({ name: f, path: path_1.default.join(backupDir, f) }))
            .sort((a, b) => a.name.localeCompare(b.name));
        while (files.length > MAX_BACKUPS) {
            const oldest = files.shift();
            fs_1.default.unlinkSync(oldest.path);
            console.log('清理旧备份:', oldest.name);
        }
    }
    catch (e) {
        console.error('清理备份失败:', e);
    }
}
/** 列出所有备份文件（供设置页面展示） */
function listBackups() {
    if (!dbPath)
        return [];
    const backupDir = path_1.default.join(path_1.default.dirname(dbPath), 'backups');
    if (!fs_1.default.existsSync(backupDir))
        return [];
    return fs_1.default.readdirSync(backupDir)
        .filter(f => f.startsWith('class-management-') && f.endsWith('.db'))
        .map(f => {
        const stat = fs_1.default.statSync(path_1.default.join(backupDir, f));
        return { name: f, size: stat.size, mtime: stat.mtimeMs };
    })
        .sort((a, b) => b.mtime - a.mtime);
}
/** 手动创建一份备份 */
function createBackup() {
    if (!dbPath || !fs_1.default.existsSync(dbPath))
        return null;
    saveDatabase();
    backupDatabase(dbPath);
    cleanupOldBackups(dbPath);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `class-management-${ts}.db`;
}
/** 从指定备份文件恢复数据库 */
function restoreBackup(backupName) {
    if (!dbPath)
        return false;
    const backupDir = path_1.default.join(path_1.default.dirname(dbPath), 'backups');
    const bakPath = path_1.default.join(backupDir, backupName);
    if (!fs_1.default.existsSync(bakPath))
        return false;
    try {
        // 关闭当前数据库
        if (db) {
            db.close();
            db = null;
        }
        // better-sqlite3：删除残留的 WAL/SHM 边车，避免与新主文件不一致
        if (useBetterSqlite) {
            for (const suffix of ['-wal', '-shm']) {
                try {
                    fs_1.default.unlinkSync(dbPath + suffix);
                }
                catch { /* ignore */ }
            }
        }
        // 用备份替换当前数据库文件
        fs_1.default.copyFileSync(bakPath, dbPath);
        return true;
    }
    catch (e) {
        console.error('恢复备份失败:', e);
        return false;
    }
}
//# sourceMappingURL=connection.js.map