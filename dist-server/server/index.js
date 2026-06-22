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
                // 确保 message_board 表结构兼容（image、font_color、font_size 列）
                try {
                    const db = (0, connection_2.requireDatabase)();
                    const cols = db.exec('PRAGMA table_info(message_board)');
                    const hasImage = cols?.[0]?.values?.some((row) => row[1] === 'image');
                    const hasFontColor = cols?.[0]?.values?.some((row) => row[1] === 'font_color');
                    const hasFontSize = cols?.[0]?.values?.some((row) => row[1] === 'font_size');
                    if (!hasImage) {
                        db.exec('ALTER TABLE message_board ADD COLUMN image TEXT');
                        (0, connection_1.saveDatabase)();
                        console.log('[server] 已添加 message_board.image 列');
                    }
                    if (!hasFontColor) {
                        db.exec('ALTER TABLE message_board ADD COLUMN font_color TEXT');
                        (0, connection_1.saveDatabase)();
                        console.log('[server] 已添加 message_board.font_color 列');
                    }
                    if (!hasFontSize) {
                        db.exec('ALTER TABLE message_board ADD COLUMN font_size TEXT');
                        (0, connection_1.saveDatabase)();
                        console.log('[server] 已添加 message_board.font_size 列');
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
async function handleReflection(req, res) {
    const method = (req.method || 'GET').toUpperCase();
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    (0, query_helpers_1.executeRun)(`CREATE TABLE IF NOT EXISTS reflection_records (
    id TEXT PRIMARY KEY, date TEXT NOT NULL,
    group_id TEXT NOT NULL, group_name TEXT NOT NULL DEFAULT '',
    countdown_started_at INTEGER, sign_in_window_start INTEGER, sign_in_window_end INTEGER,
    created_at INTEGER
  )`);
    (0, query_helpers_1.executeRun)(`CREATE TABLE IF NOT EXISTS reflection_students (
    id TEXT PRIMARY KEY, reflection_record_id TEXT NOT NULL,
    student_id TEXT NOT NULL, student_name TEXT NOT NULL,
    sign_in_time INTEGER, penalty_applied INTEGER DEFAULT 0,
    group_id TEXT
  )`);
    if (method === 'GET' && url.pathname === '/api/reflection/students') {
        try {
            const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
            const records = (0, query_helpers_1.queryAll)('SELECT * FROM reflection_records WHERE date = ?', [date]);
            if (records.length === 0) {
                sendJSON(res, { success: true, data: [], records: [] });
                return;
            }
            const allStudents = [];
            for (const r of records) {
                const students = (0, query_helpers_1.queryAll)('SELECT * FROM reflection_students WHERE reflection_record_id = ? ORDER BY student_name', [r.id]);
                allStudents.push(...students);
            }
            sendJSON(res, {
                success: true,
                data: allStudents,
                records: records.map(r => ({
                    group_id: r.group_id,
                    group_name: r.group_name,
                    countdown_started_at: r.countdown_started_at,
                    sign_in_window_start: r.sign_in_window_start,
                    sign_in_window_end: r.sign_in_window_end,
                }))
            });
        }
        catch (err) {
            sendJSON(res, { success: false, error: String(err) }, 500);
        }
        return;
    }
    if (method === 'POST' && url.pathname === '/api/reflection/sign-in') {
        try {
            const body = await parseBody(req);
            const id = String(body.id || '').trim();
            if (!id) {
                sendJSON(res, { success: false, error: '缺少 id' }, 400);
                return;
            }
            (0, query_helpers_1.executeRun)('UPDATE reflection_students SET sign_in_time = ? WHERE id = ? AND sign_in_time IS NULL', [Date.now(), id]);
            (0, connection_1.saveDatabase)();
            sendJSON(res, { success: true });
        }
        catch (err) {
            sendJSON(res, { success: false, error: String(err) }, 500);
        }
        return;
    }
    sendJSON(res, { success: false, error: 'Method not allowed' }, 405);
}
function getPunishmentSignInHTML() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<title>罚抄确认</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:linear-gradient(135deg,#fef9f0,#fdf5e6);min-height:100vh;padding:24px}
.wrap{max-width:480px;margin:0 auto}
.header{text-align:center;margin-bottom:32px}
.icon{width:80px;height:80px;border-radius:16px;background:#fef3c7;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:36px}
h1{font-size:24px;color:#44403c;font-weight:700}
.sub{font-size:14px;color:#a8a29e;margin-top:8px}
.list{display:flex;flex-direction:column;gap:8px}
.card{width:100%;display:flex;align-items:center;gap:12px;padding:14px 20px;border-radius:16px;border:2px solid #f5f5f4;background:#fff;font-size:16px;font-weight:500;color:#57534e;cursor:pointer;transition:all .2s}
.card:hover{border-color:#fbbf24;box-shadow:0 4px 12px rgba(0,0,0,.08)}
.card:active{transform:scale(.97)}
.card.done{background:#f0fdf4;border-color:#bbf7d0;color:#16a34a;cursor:default}
.card.just{background:#dcfce7;border-color:#4ade80;transform:scale(1.03);box-shadow:0 4px 16px rgba(74,222,128,.3)}
.dot{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0}
.dot.pending{background:#f5f5f4;color:#a8a29e}
.dot.ok{background:#22c55e;color:#fff}
.name{flex:1;text-align:left}
.score{font-size:12px;color:#a8a29e}
.btn{padding:4px 12px;border-radius:8px;font-size:14px;font-weight:500;border:none}
.btn-confirm{background:#f59e0b;color:#fff}
.btn-done{background:transparent;color:#16a34a;font-weight:700}
.hint{text-align:center;font-size:12px;color:#d6d3d1;margin-top:32px}
.empty{text-align:center;padding:80px 0;color:#a8a29e;font-size:20px}
.loading{text-align:center;padding:80px 0;color:#a8a29e;font-size:18px}
</style>
</head>
<body>
<div class="wrap">
<div class="header">
<div class="icon">✍️</div>
<h1>罚抄确认</h1>
<div class="sub" id="sub">加载中...</div>
</div>
<div id="list" class="list"><div class="loading">加载中...</div></div>
<p class="hint">点击学生姓名确认已完成抄写</p>
</div>
<script>
let justId=null
function render(students){
  const sub=document.getElementById('sub')
  const list=document.getElementById('list')
  const pending=students.filter(s=>!s.completed).length
  sub.textContent=pending>0?'待确认 '+pending+' 人':'全部已完成'
  if(!students.length){list.innerHTML='<div class="empty">当前没有罚抄名单</div>';return}
  list.innerHTML=students.map(s=>{
    const done=!!s.completed,just=justId===s.id
    return '<div class="card'+(just?' just':done?' done':'')+'" data-id="'+s.id+'" data-done="'+done+'">'
      +'<div class="dot '+(done?'ok':'pending')+'">'+(done?'✓':'')+'</div>'
      +'<span class="name">'+s.student_name+'</span>'
      +'<span class="score">扣分：'+s.deduction_count+'</span>'
      +(done?'<span class="btn btn-done">✓ 已抄完</span>':'<span class="btn btn-confirm">确认已抄完</span>')
      +'</div>'
  }).join('')
}
async function load(){
  try{
    const r=await fetch('/api/punishment/students')
    const j=await r.json()
    if(j.success)render(j.data||[])
  }catch(e){console.error(e)}
}
document.getElementById('list').addEventListener('click',async function(e){
  const card=e.target.closest('.card')
  if(!card||card.dataset.done==='true')return
  const id=card.dataset.id
  try{
    const r=await fetch('/api/punishment/sign-in',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    const j=await r.json()
    if(j.success){justId=id;load();setTimeout(()=>{justId=null;load()},2000)}
  }catch(e){console.error(e)}
})
load()
setInterval(load,5000)
</script>
</body>
</html>`;
}
async function handlePunishment(req, res) {
    const method = (req.method || 'GET').toUpperCase();
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    (0, query_helpers_1.executeRun)(`CREATE TABLE IF NOT EXISTS copy_punishment_weeks (
    id TEXT PRIMARY KEY, start_date TEXT NOT NULL, end_date TEXT,
    status TEXT DEFAULT 'active', created_at INTEGER
  )`);
    (0, query_helpers_1.executeRun)(`CREATE TABLE IF NOT EXISTS copy_punishment_students (
    id TEXT PRIMARY KEY, week_id TEXT NOT NULL, student_id TEXT NOT NULL,
    student_name TEXT NOT NULL, deduction_count INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0, completed_at INTEGER
  )`);
    if (method === 'GET' && url.pathname === '/api/punishment/students') {
        try {
            const week = (0, query_helpers_1.queryAll)("SELECT * FROM copy_punishment_weeks WHERE status = 'active' ORDER BY created_at DESC LIMIT 1");
            if (week.length === 0) {
                sendJSON(res, { success: true, data: [] });
                return;
            }
            const students = (0, query_helpers_1.queryAll)('SELECT * FROM copy_punishment_students WHERE week_id = ? ORDER BY deduction_count DESC', [week[0].id]);
            sendJSON(res, { success: true, data: students });
        }
        catch (err) {
            sendJSON(res, { success: false, error: String(err) }, 500);
        }
        return;
    }
    if (method === 'POST' && url.pathname === '/api/punishment/sign-in') {
        try {
            const body = await parseBody(req);
            const id = String(body.id || '').trim();
            if (!id) {
                sendJSON(res, { success: false, error: '缺少 id' }, 400);
                return;
            }
            (0, query_helpers_1.executeRun)('UPDATE copy_punishment_students SET completed = 1, completed_at = ? WHERE id = ? AND completed = 0', [Date.now(), id]);
            (0, connection_1.saveDatabase)();
            sendJSON(res, { success: true });
        }
        catch (err) {
            sendJSON(res, { success: false, error: String(err) }, 500);
        }
        return;
    }
    sendJSON(res, { success: false, error: 'Method not allowed' }, 405);
}
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
            const fontColor = typeof body.font_color === 'string' && body.font_color.length > 0 ? body.font_color : null;
            const fontSize = typeof body.font_size === 'string' && body.font_size.length > 0 ? body.font_size : null;
            (0, query_helpers_1.executeRun)(`CREATE TABLE IF NOT EXISTS message_board (
          id TEXT PRIMARY KEY, student_name TEXT NOT NULL, content TEXT NOT NULL,
          tag TEXT DEFAULT '其他', expires_at INTEGER, created_at INTEGER NOT NULL, image TEXT, font_color TEXT, font_size TEXT
        )`);
            try {
                (0, query_helpers_1.executeRun)("ALTER TABLE message_board ADD COLUMN image TEXT", []);
            }
            catch (_) { /* 列已存在 */ }
            try {
                (0, query_helpers_1.executeRun)("ALTER TABLE message_board ADD COLUMN font_color TEXT", []);
            }
            catch (_) { /* 列已存在 */ }
            try {
                (0, query_helpers_1.executeRun)("ALTER TABLE message_board ADD COLUMN font_size TEXT", []);
            }
            catch (_) { /* 列已存在 */ }
            const id = (0, crypto_1.randomUUID)();
            (0, query_helpers_1.executeRun)(`INSERT INTO message_board (id, student_name, content, tag, expires_at, created_at, image, font_color, font_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, studentName, content, tag, expiresAt, Date.now(), image, fontColor, fontSize]);
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
// ── 小组植树 ──
const TREE_GROWTH_THRESHOLDS = [0, 10, 25, 50, 85, 130];
const TREE_MAX_LEVEL = 5;
const TREE_FRUIT_START_LEVEL = 4;
const TREE_ACTION_CONFIG = {
    water: { cost: 1, growth: 2 },
    sunlight: { cost: 2, growth: 3 },
    fertilize: { cost: 3, growth: 5 },
    pesticide: { cost: 2, growth: 4 },
};
async function handleTrees(req, res) {
    const method = (req.method || 'GET').toUpperCase();
    const reqUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
    if (method === 'GET') {
        try {
            const groups = (0, query_helpers_1.queryAll)('SELECT id FROM groups ORDER BY sort_order, created_at');
            const now = Date.now();
            for (const g of groups) {
                const existing = (0, query_helpers_1.queryOne)('SELECT id FROM group_trees WHERE group_id = ?', [g.id]);
                if (!existing) {
                    (0, query_helpers_1.executeRun)(`INSERT INTO group_trees (id, group_id, level, growth, fruits, fruits_redeemed, created_at, updated_at)
             VALUES (?, ?, 0, 0, 0, 0, ?, ?)`, [(0, crypto_1.randomUUID)(), g.id, now, now]);
                }
            }
            const trees = (0, query_helpers_1.queryAll)(`SELECT t.*, g.name as group_name, g.color as group_color, g.total_score
         FROM group_trees t JOIN groups g ON g.id = t.group_id
         ORDER BY g.sort_order, g.created_at`);
            sendJSON(res, { success: true, data: trees });
        }
        catch (err) {
            sendJSON(res, { success: false, error: err instanceof Error ? err.message : String(err) }, 500);
        }
        return;
    }
    if (method === 'POST' && reqUrl.pathname === '/api/trees/action') {
        try {
            const body = await parseBody(req);
            const groupId = String(body.group_id || '');
            const actionType = String(body.action_type || '');
            if (!groupId || !TREE_ACTION_CONFIG[actionType]) {
                sendJSON(res, { success: false, error: '参数无效' }, 400);
                return;
            }
            const config = TREE_ACTION_CONFIG[actionType];
            const group = (0, query_helpers_1.queryOne)('SELECT total_score FROM groups WHERE id = ?', [groupId]);
            if (!group) {
                sendJSON(res, { success: false, error: '小组不存在' }, 404);
                return;
            }
            if (group.total_score < config.cost) {
                sendJSON(res, { success: false, error: '积分不足' });
                return;
            }
            let tree = (0, query_helpers_1.queryOne)('SELECT * FROM group_trees WHERE group_id = ?', [groupId]);
            if (!tree) {
                const id = (0, crypto_1.randomUUID)();
                const now2 = Date.now();
                (0, query_helpers_1.executeRun)(`INSERT INTO group_trees (id, group_id, level, growth, fruits, fruits_redeemed, created_at, updated_at) VALUES (?, ?, 0, 0, 0, 0, ?, ?)`, [id, groupId, now2, now2]);
                tree = (0, query_helpers_1.queryOne)('SELECT * FROM group_trees WHERE group_id = ?', [groupId]);
            }
            if (!tree) {
                sendJSON(res, { success: false, error: '初始化失败' }, 500);
                return;
            }
            const treeLevel = tree.level;
            const treeGrowth = tree.growth;
            const treeId2 = tree.id;
            if (treeLevel >= TREE_MAX_LEVEL) {
                sendJSON(res, { success: false, error: '已达到最高等级' });
                return;
            }
            const newGrowth = treeGrowth + config.growth;
            let newLevel = treeLevel;
            let fruitProduced = false;
            while (newLevel < TREE_MAX_LEVEL && newGrowth >= TREE_GROWTH_THRESHOLDS[newLevel + 1]) {
                newLevel++;
                if (newLevel >= TREE_FRUIT_START_LEVEL)
                    fruitProduced = true;
            }
            const fruitsToAdd = fruitProduced ? (newLevel - Math.max(treeLevel, TREE_FRUIT_START_LEVEL - 1)) : 0;
            const now = Date.now();
            (0, query_helpers_1.executeTransaction)([
                { sql: 'UPDATE groups SET total_score = total_score - ?, updated_at = ? WHERE id = ?', params: [config.cost, now, groupId] },
                { sql: `INSERT INTO group_score_history (id, group_id, delta, reason, created_at) VALUES (?, ?, ?, ?, ?)`, params: [(0, crypto_1.randomUUID)(), groupId, -config.cost, `植树${actionType}`, now] },
                { sql: 'UPDATE group_trees SET growth = ?, level = ?, fruits = fruits + ?, updated_at = ? WHERE id = ?', params: [newGrowth, newLevel, fruitsToAdd, now, treeId2] },
                { sql: `INSERT INTO tree_actions (id, tree_id, action_type, cost, growth_value, created_at) VALUES (?, ?, ?, ?, ?, ?)`, params: [(0, crypto_1.randomUUID)(), treeId2, actionType, config.cost, config.growth, now] },
            ]);
            (0, connection_1.saveDatabase)();
            const updated = (0, query_helpers_1.queryOne)('SELECT * FROM group_trees WHERE id = ?', [treeId2]);
            sendJSON(res, { success: true, data: updated, leveledUp: newLevel > treeLevel, fruitProduced: fruitsToAdd > 0 });
        }
        catch (err) {
            sendJSON(res, { success: false, error: err instanceof Error ? err.message : String(err) }, 500);
        }
        return;
    }
    if (method === 'POST' && reqUrl.pathname === '/api/trees/redeem') {
        try {
            const body = await parseBody(req);
            const treeId = String(body.tree_id || '');
            if (!treeId) {
                sendJSON(res, { success: false, error: '缺少 tree_id' }, 400);
                return;
            }
            const tree = (0, query_helpers_1.queryOne)('SELECT * FROM group_trees WHERE id = ?', [treeId]);
            if (!tree || tree.fruits <= tree.fruits_redeemed) {
                sendJSON(res, { success: false, error: '没有可摘取的果实' });
                return;
            }
            (0, query_helpers_1.executeRun)('UPDATE group_trees SET fruits_redeemed = fruits_redeemed + 1, updated_at = ? WHERE id = ?', [Date.now(), treeId]);
            (0, connection_1.saveDatabase)();
            const updated = (0, query_helpers_1.queryOne)('SELECT * FROM group_trees WHERE id = ?', [treeId]);
            sendJSON(res, { success: true, data: updated });
        }
        catch (err) {
            sendJSON(res, { success: false, error: err instanceof Error ? err.message : String(err) }, 500);
        }
        return;
    }
    sendJSON(res, { success: false, error: 'Method not allowed' }, 405);
}
// ── 手机看板 API ──
function handleMobile(req, res) {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const sub = url.pathname.replace('/api/mobile/', '');
    try {
        if (sub === 'homework') {
            const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
            const records = (0, query_helpers_1.queryAll)(`SELECT hr.student_id, hr.subject, hr.status, s.name as student_name, g.name as group_name, g.color as group_color
         FROM homework_records hr
         JOIN students s ON s.id = hr.student_id
         LEFT JOIN groups g ON g.id = s.group_id
         WHERE hr.date = ?
         ORDER BY g.sort_order, g.created_at, s.sort_order`, [date]);
            const subjects = (0, query_helpers_1.queryOne)('SELECT subjects FROM homework_daily WHERE date = ?', [date]);
            let subjectList = [];
            if (subjects && subjects.subjects) {
                try {
                    subjectList = JSON.parse(subjects.subjects);
                }
                catch { }
            }
            sendJSON(res, { success: true, data: records, date, subjects: subjectList });
            return;
        }
        if (sub === 'deductions') {
            const days = parseInt(url.searchParams.get('days') || '7', 10);
            const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
            const records = (0, query_helpers_1.queryAll)(`SELECT dr.student_name, s.name as current_name, g.name as group_name, g.color as group_color,
                COUNT(*) as count, SUM(dr.points) as total_points
         FROM deduction_records dr
         LEFT JOIN students s ON s.id = dr.student_id
         LEFT JOIN groups g ON g.id = s.group_id
         WHERE dr.date >= ?
         GROUP BY dr.student_id
         ORDER BY total_points DESC
         LIMIT 30`, [since]);
            sendJSON(res, { success: true, data: records, since, days });
            return;
        }
        if (sub === 'attendance') {
            const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
            const windows = (0, query_helpers_1.queryAll)('SELECT * FROM attendance_windows WHERE date = ? ORDER BY window_start', [date]);
            const result = [];
            for (const w of windows) {
                const abnormal = (0, query_helpers_1.queryAll)(`SELECT awr.status, s.name as student_name, g.name as group_name, g.color as group_color
           FROM attendance_window_records awr
           JOIN students s ON s.id = awr.student_id
           LEFT JOIN groups g ON g.id = s.group_id
           WHERE awr.window_id = ? AND awr.status != 'signed'
           ORDER BY awr.status, g.sort_order, s.sort_order`, [w.id]);
                if (abnormal.length > 0) {
                    result.push({
                        window_label: w.label || '',
                        window_time: `${w.window_start}-${w.window_end}`,
                        students: abnormal,
                    });
                }
            }
            sendJSON(res, { success: true, data: result, date });
            return;
        }
        sendJSON(res, { success: false, error: 'Unknown mobile endpoint' }, 404);
    }
    catch (err) {
        sendJSON(res, { success: false, error: err instanceof Error ? err.message : String(err) }, 500);
    }
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
        if (url === '/punishment-signin' && method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
            res.end(getPunishmentSignInHTML());
            return;
        }
        if (url.startsWith('/api/reflection')) {
            handleReflection(req, res);
            return;
        }
        if (url.startsWith('/api/punishment')) {
            handlePunishment(req, res);
            return;
        }
        if (url === '/api/messages' || url.startsWith('/api/messages?')) {
            handleMessages(req, res);
            return;
        }
        if (url.startsWith('/api/trees')) {
            handleTrees(req, res);
            return;
        }
        if (url.startsWith('/api/mobile/')) {
            handleMobile(req, res);
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
//# sourceMappingURL=index.js.map