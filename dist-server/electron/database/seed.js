"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSeed = runSeed;
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function getSeedPath() {
    // 开发/构建后的相对路径
    const devPath = path_1.default.join(__dirname, '../../seed.json');
    if (fs_1.default.existsSync(devPath))
        return devPath;
    // 工作目录（独立服务端部署）
    const cwdPath = path_1.default.join(process.cwd(), 'seed.json');
    if (fs_1.default.existsSync(cwdPath))
        return cwdPath;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { app } = require('electron');
        // Electron 打包后 seed.json 位于 resourcesPath
        if (app.isPackaged) {
            const prodPath = path_1.default.join(process.resourcesPath, 'seed.json');
            if (fs_1.default.existsSync(prodPath))
                return prodPath;
        }
    }
    catch {
        // 非 Electron 环境（独立服务端），忽略
    }
    return null;
}
function runSeed(db) {
    const seedPath = getSeedPath();
    if (!seedPath) {
        console.log('seed.json 未找到，跳过种子数据导入');
        return false;
    }
    let seed;
    try {
        seed = JSON.parse(fs_1.default.readFileSync(seedPath, 'utf-8'));
    }
    catch (err) {
        console.error('seed.json 解析失败:', err);
        return false;
    }
    // 检查数据库是否已有数据
    const groupResult = db.exec('SELECT COUNT(*) as cnt FROM groups');
    const dbGroupCount = (groupResult.length > 0 ? groupResult[0].values[0][0] : 0);
    // 只在数据库完全为空时导入种子数据（首次启动），绝不覆盖已有数据
    if (dbGroupCount > 0) {
        console.log(`数据库已有 ${dbGroupCount} 个小组，跳过种子导入`);
        return false;
    }
    console.log('空数据库，开始导入种子数据...');
    const now = Date.now();
    // 全量导入小组
    for (const g of seed.groups) {
        const id = (0, crypto_1.randomUUID)();
        db.run(`INSERT INTO groups (id, name, color, leader_name, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, g.name, g.color, g.leader_name, g.sort_order || 0, now, now]);
    }
    // 全量导入学生
    let importedStudents = 0;
    for (const s of seed.students) {
        const gStmt = db.prepare('SELECT id FROM groups WHERE name = ?');
        gStmt.bind([s.group_name]);
        const groupId = gStmt.step() ? gStmt.getAsObject().id : null;
        gStmt.free();
        if (!groupId) {
            console.warn(`学生 "${s.name}" 的小组 "${s.group_name}" 不存在，跳过`);
            continue;
        }
        const studentId = (0, crypto_1.randomUUID)();
        db.run(`INSERT INTO students (id, name, group_id, practice_label, lunch_label, lunch_longterm, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [studentId, s.name, groupId, s.practice_label || '', s.lunch_label || '', s.lunch_longterm ? 1 : 0, now, now]);
        importedStudents++;
    }
    console.log(`种子数据导入完成：${seed.groups.length} 个小组，${importedStudents} 名学生`);
    return true;
}
//# sourceMappingURL=seed.js.map