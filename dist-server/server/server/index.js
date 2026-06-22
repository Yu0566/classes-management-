"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const zlib_1 = __importDefault(require("zlib"));
const crypto_1 = require("crypto");
const child_process_1 = require("child_process");
const connection_1 = require("../electron/database/connection");
const query_helpers_1 = require("../electron/database/query-helpers");
const connection_2 = require("../electron/database/connection");
const DEFAULT_PORT = 3456;
const MAX_PORT_RETRIES = 20;
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.webmanifest': 'application/manifest+json',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};
// ── 参数解析 ──
const args = process.argv.slice(2);
const isDev = args.includes('--dev');
const portArg = args.indexOf('--port');
const PORT = portArg >= 0 ? parseInt(args[portArg + 1], 10) || DEFAULT_PORT : DEFAULT_PORT;
// ── 数据库路径 ──
const dataDir = path_1.default.join(process.cwd(), 'data');
if (!fs_1.default.existsSync(dataDir)) {
    fs_1.default.mkdirSync(dataDir, { recursive: true });
}
const DB_PATH = path_1.default.join(dataDir, 'class-management.db');
// 设备名称存储
const DEVICE_NAME_FILE = path_1.default.join(dataDir, 'device-name.txt');
function getDeviceName() {
    try {
        if (fs_1.default.existsSync(DEVICE_NAME_FILE)) {
            return fs_1.default.readFileSync(DEVICE_NAME_FILE, 'utf-8').trim();
        }
    }
    catch { /* ignore */ }
    return '';
}
function setDeviceNameFile(name) {
    try {
        fs_1.default.writeFileSync(DEVICE_NAME_FILE, name.trim(), 'utf-8');
    }
    catch { /* ignore */ }
}
// ── 静态文件服务 ──
const distPath = path_1.default.join(process.cwd(), 'dist');
const COMPRESSIBLE_EXT = new Set(['.js', '.mjs', '.css', '.html', '.json', '.svg', '.wasm', '.woff', '.woff2']);
function serveStatic(req, res, urlPath) {
    const cleanPath = urlPath.split('?')[0].split('#')[0];
    let filePath = path_1.default.join(distPath, cleanPath === '/' ? 'index.html' : cleanPath);
    if (!filePath.startsWith(distPath)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    const ext = path_1.default.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    try {
        const content = fs_1.default.readFileSync(filePath);
        const acceptEncoding = req.headers['accept-encoding'] || '';
        const canGzip = acceptEncoding.includes('gzip') && COMPRESSIBLE_EXT.has(ext);
        if (canGzip) {
            const compressed = zlib_1.default.gzipSync(content);
            res.writeHead(200, {
                'Content-Type': mimeType,
                'Content-Encoding': 'gzip',
                'Cache-Control': 'public, max-age=3600',
                'Vary': 'Accept-Encoding',
            });
            res.end(compressed);
        }
        else {
            res.writeHead(200, {
                'Content-Type': mimeType,
                'Cache-Control': 'public, max-age=3600',
            });
            res.end(content);
        }
    }
    catch {
        // SPA fallback: 返回 index.html
        try {
            const indexContent = fs_1.default.readFileSync(path_1.default.join(distPath, 'index.html'));
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(indexContent);
        }
        catch {
            res.writeHead(404);
            res.end('Not Found');
        }
    }
}
// ── JSON 工具 ──
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            }
            catch {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}
function sendJSON(res, data, status = 200) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(data));
}
// ── CORS preflight ──
function handleCORS(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return true;
    }
    return false;
}
// ── API 处理 ──
async function handleAPI(req, res, endpoint) {
    try {
        const body = await parseBody(req);
        switch (endpoint) {
            case 'query': {
                const rows = (0, query_helpers_1.queryAll)(body.sql, body.params || []);
                sendJSON(res, { success: true, data: rows });
                break;
            }
            case 'get': {
                const row = (0, query_helpers_1.queryOne)(body.sql, body.params || []);
                sendJSON(res, { success: true, data: row });
                break;
            }
            case 'run': {
                // 确保 message_board 表结构兼容（image 列）
                try {
                    const db = (0, connection_2.requireDatabase)();
                    const cols = db.exec('PRAGMA table_info(message_board)');
                    const hasImage = cols?.[0]?.values?.some((row) => row[1] === 'image');
                    if (!hasImage) {
                        db.exec('ALTER TABLE message_board ADD COLUMN image TEXT');
                        (0, connection_1.saveDatabase)();
                        console.log('[server] 已添加 message_board.image 列');
                    }
                }
                catch (e) {
                    console.error('[server] 表结构检查/修复失败:', e);
                }
                const result = (0, query_helpers_1.executeRun)(body.sql, body.params || []);
                sendJSON(res, { success: true, changes: result.changes });
                break;
            }
            case 'transaction': {
                (0, query_helpers_1.executeTransaction)(body.operations || []);
                sendJSON(res, { success: true });
                break;
            }
            default:
                sendJSON(res, { success: false, error: `Unknown endpoint: ${endpoint}` }, 404);
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[API error]', msg);
        sendJSON(res, { success: false, error: msg }, 500);
    }
}
// ── 通知 ──
async function handleNotify(req, res) {
    try {
        const body = await parseBody(req);
        const message = String(body.message || '').trim();
        const mode = body.mode === 'top' ? 'top' : 'fullscreen';
        const urgency = body.urgency === '重要' || body.urgency === '紧急' ? body.urgency : '普通';
        const title = String(body.title || '');
        let duration;
        if (typeof body.duration === 'number') {
            duration = body.duration === 0 ? 0 : Math.max(3, Math.min(300, body.duration));
        }
        let image;
        if (typeof body.image === 'string' && body.image.startsWith('data:image/')) {
            image = body.image;
        }
        const confirmMode = (body.confirmMode === 'any' || body.confirmMode === 'specific') ? body.confirmMode : 'none';
        const confirmStudents = Array.isArray(body.confirmStudents) && confirmMode === 'specific'
            ? body.confirmStudents.filter((s) => typeof s === 'string')
            : [];
        if (!message) {
            sendJSON(res, { success: false, error: '内容不能为空' }, 400);
            return;
        }
        // 确保表结构完整
        (0, query_helpers_1.executeRun)(`CREATE TABLE IF NOT EXISTS notification_history (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL,
        mode TEXT DEFAULT 'fullscreen', duration INTEGER DEFAULT 30, image TEXT,
        urgency TEXT DEFAULT '普通', confirm_mode TEXT DEFAULT 'none',
        confirm_students TEXT DEFAULT '[]', created_at INTEGER
      )`);
        const notificationId = (0, crypto_1.randomUUID)();
        (0, query_helpers_1.executeRun)(`INSERT INTO notification_history (id, title, message, mode, duration, image, urgency, confirm_mode, confirm_students, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [notificationId, title || mode, message, mode, duration ?? 30, image || '', urgency, confirmMode, JSON.stringify(confirmStudents), Date.now()]);
        (0, connection_1.saveDatabase)();
        sendJSON(res, { success: true, delivered: true, notificationId });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Notify error]', msg);
        sendJSON(res, { success: false, error: msg }, 500);
    }
}
function handleNotifications(req, res) {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const since = parseInt(url.searchParams.get('since') || '0', 10);
    try {
        const notifications = (0, query_helpers_1.queryAll)(`SELECT * FROM notification_history WHERE created_at > ? ORDER BY created_at DESC LIMIT 50`, [since]);
        sendJSON(res, { success: true, data: notifications });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJSON(res, { success: false, error: msg }, 500);
    }
}
function handleStudents(_req, res) {
    try {
        const students = (0, query_helpers_1.queryAll)('SELECT id, name FROM students ORDER BY name ASC');
        sendJSON(res, { success: true, data: students });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJSON(res, { success: false, error: msg }, 500);
    }
}
async function handleNotifyConfirm(req, res) {
    try {
        const body = await parseBody(req);
        const notificationId = String(body.notification_id || '');
        const studentName = String(body.student_name || '').trim();
        if (!notificationId || !studentName) {
            sendJSON(res, { success: false, error: '参数不完整' }, 400);
            return;
        }
        (0, query_helpers_1.executeRun)(`CREATE TABLE IF NOT EXISTS notification_reads (
        id TEXT PRIMARY KEY, notification_id TEXT NOT NULL,
        student_name TEXT NOT NULL, read_at INTEGER NOT NULL
      )`);
        const rows = (0, query_helpers_1.queryAll)('SELECT confirm_mode, confirm_students FROM notification_history WHERE id = ?', [notificationId]);
        if (rows.length === 0) {
            sendJSON(res, { success: false, message: '通知不存在' });
            return;
        }
        const { confirm_mode, confirm_students } = rows[0];
        if (confirm_mode === 'none') {
            sendJSON(res, { success: false, message: '此通知无需确认' });
            return;
        }
        if (confirm_mode === 'specific') {
            let allowed = [];
            try {
                allowed = JSON.parse(confirm_students || '[]');
            }
            catch { /* keep empty */ }
            if (allowed.length > 0 && !allowed.includes(studentName)) {
                sendJSON(res, { success: false, message: '你不在确认名单中' });
                return;
            }
        }
        const existing = (0, query_helpers_1.queryAll)('SELECT id FROM notification_reads WHERE notification_id = ? AND student_name = ?', [notificationId, studentName]);
        if (existing.length > 0) {
            sendJSON(res, { success: false, message: '你已经确认过了' });
            return;
        }
        (0, query_helpers_1.executeRun)('INSERT INTO notification_reads (id, notification_id, student_name, read_at) VALUES (?, ?, ?, ?)', [(0, crypto_1.randomUUID)(), notificationId, studentName, Date.now()]);
        (0, connection_1.saveDatabase)();
        sendJSON(res, { success: true, message: '确认成功' });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJSON(res, { success: false, error: msg }, 500);
    }
}
function handleNotifyReads(req, res) {
    try {
        const url = new URL(req.url || '/', `http://localhost:${PORT}`);
        const notificationId = url.searchParams.get('notification_id') || '';
        if (!notificationId) {
            sendJSON(res, { success: false, error: '缺少 notification_id' }, 400);
            return;
        }
        const reads = (0, query_helpers_1.queryAll)('SELECT * FROM notification_reads WHERE notification_id = ? ORDER BY read_at ASC', [notificationId]);
        sendJSON(res, { success: true, data: reads });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJSON(res, { success: false, error: msg }, 500);
    }
}
// ── 设备名称 ──
async function handleSetDeviceName(req, res) {
    try {
        const body = await parseBody(req);
        const name = String(body.deviceName || '').trim();
        if (!name) {
            sendJSON(res, { success: false, error: '设备名称不能为空' }, 400);
            return;
        }
        setDeviceNameFile(name);
        sendJSON(res, { success: true, deviceName: name });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJSON(res, { success: false, error: msg }, 500);
    }
}
// ── 留言板 ──
async function handleMessages(req, res) {
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET') {
        try {
            const messages = (0, query_helpers_1.queryAll)(`SELECT * FROM message_board
         WHERE expires_at IS NULL OR expires_at > ?
         ORDER BY created_at DESC`, [Date.now()]);
            sendJSON(res, { success: true, data: messages });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            sendJSON(res, { success: false, error: msg }, 500);
        }
        return;
    }
    if (method === 'POST') {
        try {
            const body = await parseBody(req);
            const studentName = String(body.student_name || '').trim();
            const content = String(body.content || '').trim();
            if (!studentName || !content) {
                sendJSON(res, { success: false, error: '学生姓名和内容不能为空' }, 400);
                return;
            }
            const tag = (['建议', '感谢', '心愿', '其他'].includes(String(body.tag)) ? String(body.tag) : '其他');
            const expiresAt = typeof body.expires_at === 'number' && body.expires_at > 0 ? body.expires_at : null;
            const image = typeof body.image === 'string' && body.image.length > 0 ? body.image : null;
            (0, query_helpers_1.executeRun)(`CREATE TABLE IF NOT EXISTS message_board (
          id TEXT PRIMARY KEY, student_name TEXT NOT NULL, content TEXT NOT NULL,
          tag TEXT DEFAULT '其他', expires_at INTEGER, created_at INTEGER NOT NULL, image TEXT
        )`);
            try {
                (0, query_helpers_1.executeRun)("ALTER TABLE message_board ADD COLUMN image TEXT", []);
            }
            catch (_) { /* 列已存在 */ }
            const id = (0, crypto_1.randomUUID)();
            (0, query_helpers_1.executeRun)(`INSERT INTO message_board (id, student_name, content, tag, expires_at, created_at, image)
         VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, studentName, content, tag, expiresAt, Date.now(), image]);
            (0, connection_1.saveDatabase)();
            sendJSON(res, { success: true, data: { id } });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            sendJSON(res, { success: false, error: msg }, 500);
        }
        return;
    }
    if (method === 'DELETE') {
        try {
            const url = new URL(req.url || '/', `http://localhost:${PORT}`);
            const id = url.searchParams.get('id') || '';
            if (!id) {
                sendJSON(res, { success: false, error: '缺少 id' }, 400);
                return;
            }
            (0, query_helpers_1.executeRun)('DELETE FROM message_board WHERE id = ?', [id]);
            (0, connection_1.saveDatabase)();
            sendJSON(res, { success: true });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            sendJSON(res, { success: false, error: msg }, 500);
        }
        return;
    }
    sendJSON(res, { success: false, error: 'Method not allowed' }, 405);
}
// ── Windows 防火墙 ──
function addFirewallRule(port) {
    if (process.platform !== 'win32')
        return;
    const ruleName = '课堂管理系统 服务端';
    (0, child_process_1.exec)(`netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${port}`, (err) => {
        if (err) {
            console.log('[firewall] 规则添加失败（可能已存在或权限不足）');
        }
        else {
            console.log('[firewall] 入站规则已确保存在');
        }
    });
}
// ── 主入口 ──
async function main() {
    console.log('[server] 正在初始化数据库...');
    await (0, connection_1.initDatabase)(DB_PATH);
    addFirewallRule(PORT);
    const requestHandler = (req, res) => {
        const url = req.url || '/';
        const method = (req.method || 'GET').toUpperCase();
        if (handleCORS(req, res))
            return;
        // API routes
        if (url.startsWith('/api/db/')) {
            const endpoint = url.replace('/api/db/', '');
            if (method === 'POST') {
                handleAPI(req, res, endpoint);
            }
            else {
                sendJSON(res, { success: false, error: 'Method not allowed' }, 405);
            }
            return;
        }
        if (url === '/api/notify') {
            if (method === 'POST') {
                handleNotify(req, res);
            }
            else {
                sendJSON(res, { success: false, error: 'Method not allowed' }, 405);
            }
            return;
        }
        if (url.startsWith('/api/notifications')) {
            if (method === 'GET') {
                handleNotifications(req, res);
            }
            else {
                sendJSON(res, { success: false, error: 'Method not allowed' }, 405);
            }
            return;
        }
        if (url === '/api/students') {
            if (method === 'GET') {
                handleStudents(req, res);
            }
            else {
                sendJSON(res, { success: false, error: 'Method not allowed' }, 405);
            }
            return;
        }
        if (url === '/api/notify/confirm') {
            if (method === 'POST') {
                handleNotifyConfirm(req, res);
            }
            else {
                sendJSON(res, { success: false, error: 'Method not allowed' }, 405);
            }
            return;
        }
        if (url.startsWith('/api/notify/reads')) {
            if (method === 'GET') {
                handleNotifyReads(req, res);
            }
            else {
                sendJSON(res, { success: false, error: 'Method not allowed' }, 405);
            }
            return;
        }
        if (url === '/api/device-name') {
            if (method === 'POST') {
                handleSetDeviceName(req, res);
            }
            else if (method === 'GET') {
                sendJSON(res, { success: true, deviceName: getDeviceName() });
            }
            else {
                sendJSON(res, { success: false, error: 'Method not allowed' }, 405);
            }
            return;
        }
        if (url === '/api/messages' || url.startsWith('/api/messages?')) {
            handleMessages(req, res);
            return;
        }
        // 健康检查
        if (url === '/api/health') {
            const deviceName = getDeviceName();
            sendJSON(res, { status: 'ok', uptime: process.uptime(), hostname: require('os').hostname(), deviceName: deviceName || undefined });
            return;
        }
        // 静态文件
        if (method === 'GET') {
            serveStatic(req, res, url);
        }
        else {
            res.writeHead(405);
            res.end('Method not allowed');
        }
    };
    // 端口自动重试
    let currentPort = PORT;
    return new Promise((resolve, reject) => {
        function tryListen() {
            if (currentPort >= PORT + MAX_PORT_RETRIES) {
                reject(new Error(`端口 ${PORT}-${PORT + MAX_PORT_RETRIES - 1} 均被占用，无法启动服务器`));
                return;
            }
            const srv = http_1.default.createServer(requestHandler);
            srv.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(`[server] 端口 ${currentPort} 被占用，尝试 ${currentPort + 1}...`);
                    currentPort++;
                    tryListen();
                }
                else {
                    reject(err);
                }
            });
            srv.listen(currentPort, '0.0.0.0', () => {
                console.log(`[server] 服务已启动 http://0.0.0.0:${currentPort}`);
                console.log(`[server] 数据库: ${DB_PATH}`);
                if (isDev)
                    console.log('[server] 开发模式（仅 API，前端请用 Vite dev server）');
                resolve();
            });
        }
        tryListen();
    });
}
main().catch((err) => {
    console.error('[server] 启动失败:', err);
    process.exit(1);
});
