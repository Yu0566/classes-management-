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
const sql_js_1 = __importDefault(require("sql.js"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const migrations_1 = require("./migrations");
Object.defineProperty(exports, "SCHEMA_VERSION", { enumerable: true, get: function () { return migrations_1.SCHEMA_VERSION; } });
const seed_1 = require("./seed");
let db = null;
let dbPath = '';
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
        db = new SQL.Database(buffer);
        console.log('数据库已加载:', dbPath);
    }
    else {
        db = new SQL.Database();
        console.log('数据库已创建:', dbPath);
    }
    // 启用外键约束
    db.run('PRAGMA foreign_keys = ON');
    // 运行迁移
    (0, migrations_1.runMigrations)(db);
    // 导入种子数据（仅首次）
    const seeded = (0, seed_1.runSeed)(db);
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
//# sourceMappingURL=connection.js.map