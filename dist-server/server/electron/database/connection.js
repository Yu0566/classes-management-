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
let db = null;
let dbPath = '';
const MAX_BACKUPS = 20;
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
async function initDatabase(_dbPath) {
    dbPath = _dbPath;
    // 确保目录存在
    const dir = path_1.default.dirname(dbPath);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    // 初始化 sql.js
    const SQL = await (0, sql_js_1.default)();
    // 尝试从文件加载数据库，如果不存在则创建新的
    if (fs_1.default.existsSync(dbPath)) {
        const buffer = fs_1.default.readFileSync(dbPath);
        try {
            db = new SQL.Database(buffer);
            console.log('数据库已加载:', dbPath);
        }
        catch (err) {
            // 只有构造函数失败才说明文件真的损坏了
            if (err.message && (err.message.includes('not a database') || err.message.includes('file is not a database'))) {
                console.error('数据库文件损坏，自动备份并重建:', dbPath);
                const bakPath = dbPath + '.corrupted-' + Date.now() + '.bak';
                fs_1.default.copyFileSync(dbPath, bakPath);
                db = new SQL.Database();
                console.log('数据库已重建，损坏文件备份到:', bakPath);
            }
            else {
                throw err;
            }
        }
    }
    else {
        db = new SQL.Database();
        console.log('数据库已创建:', dbPath);
    }
    // 数据库文件存在时，运行迁移前先做一份备份
    if (fs_1.default.existsSync(dbPath)) {
        backupDatabase(dbPath);
        cleanupOldBackups(dbPath);
    }
    // 启用外键约束
    db.run('PRAGMA foreign_keys = ON');
    // 运行迁移
    (0, migrations_1.runMigrations)(db);
    // 导入种子数据（仅首次）
    (0, seed_1.runSeed)(db);
    // 立即持久化
    saveDatabase();
}
function saveDatabase() {
    if (!db || !dbPath)
        return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs_1.default.writeFileSync(dbPath, buffer);
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
        // 用备份替换当前数据库文件
        fs_1.default.copyFileSync(bakPath, dbPath);
        return true;
    }
    catch (e) {
        console.error('恢复备份失败:', e);
        return false;
    }
}
