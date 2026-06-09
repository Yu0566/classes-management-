# 留言板功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现留言板功能——教师浏览器端输入学生留言 → 教室系统卡片墙展示，教室端只读

**Architecture:** 新增 `message_board` 表存储留言，`src/lib/message-board.ts` 数据层封装 CRUD，`/api/messages` API 端点，新建 `MessageBoardPage.tsx` 页面以卡片墙布局展示。教师端表单通过 `isLanHttpMode()` 控制可见性。

**Tech Stack:** React 18 + TypeScript 5 + Tailwind CSS 3 + sql.js + Electron 30

---

### Task 1: 数据库 — 添加 message_board 表

**Files:**
- Modify: `electron/database/migrations.ts:387`

- [ ] **Step 1: 在 migrations.ts 末尾添加建表语句**

在 `// 更新 schema version` 之前插入：

```typescript
  // 留言板
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS message_board (
      id TEXT PRIMARY KEY,
      student_name TEXT NOT NULL,
      content TEXT NOT NULL,
      tag TEXT DEFAULT '其他',
      expires_at INTEGER,
      created_at INTEGER NOT NULL
    )`)
  } catch (_) { /* 表已存在 */ }
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_message_board_created ON message_board(created_at)") } catch (_) { /* ignore */ }
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc -p tsconfig.node.json
```

- [ ] **Step 3: Commit**

```bash
git add electron/database/migrations.ts
git commit -m "feat: add message_board table migration"
```

---

### Task 2: 数据层 — src/lib/message-board.ts

**Files:**
- Create: `src/lib/message-board.ts`

- [ ] **Step 1: 创建数据访问层文件**

```typescript
import { v4 as uuid } from 'uuid'
import { queryAll, executeRun } from './db'

export type MessageTag = '建议' | '感谢' | '心愿' | '其他'

export interface MessageRecord {
  id: string
  student_name: string
  content: string
  tag: MessageTag
  expires_at: number | null
  created_at: number
}

export async function getMessages(): Promise<MessageRecord[]> {
  return queryAll<MessageRecord>(
    `SELECT * FROM message_board
     WHERE expires_at IS NULL OR expires_at > ?
     ORDER BY created_at DESC`,
    [Date.now()]
  )
}

export async function addMessage(
  studentName: string,
  content: string,
  tag: MessageTag = '其他',
  expiresAt: number | null = null,
): Promise<string> {
  const id = uuid()
  await executeRun(
    `INSERT INTO message_board (id, student_name, content, tag, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, studentName.trim(), content.trim(), tag, expiresAt, Date.now()]
  )
  return id
}

export async function deleteMessage(id: string): Promise<void> {
  await executeRun('DELETE FROM message_board WHERE id = ?', [id])
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/message-board.ts
git commit -m "feat: add message-board data layer"
```

---

### Task 3: API 端点 — LAN Server 和 Standalone Server

**Files:**
- Modify: `electron/lan-server.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: 在 lan-server.ts 添加消息处理器函数**

在 `handleNotifyReads` 函数之后，`addFirewallRule` 之前插入：

```typescript
async function handleMessages(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const method = (req.method || 'GET').toUpperCase()

  if (method === 'GET') {
    try {
      const messages = queryAll(
        `SELECT * FROM message_board
         WHERE expires_at IS NULL OR expires_at > ?
         ORDER BY created_at DESC`,
        [Date.now()]
      )
      sendJSON(res, { success: true, data: messages })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      sendJSON(res, { success: false, error: msg }, 500)
    }
    return
  }

  if (method === 'POST') {
    try {
      const body = await parseBody(req)
      const studentName = String(body.student_name || '').trim()
      const content = String(body.content || '').trim()
      if (!studentName || !content) {
        sendJSON(res, { success: false, error: '学生姓名和内容不能为空' }, 400)
        return
      }
      const tag = (['建议', '感谢', '心愿', '其他'].includes(String(body.tag)) ? String(body.tag) : '其他') as string
      const expiresAt = typeof body.expires_at === 'number' && body.expires_at > 0 ? body.expires_at : null

      executeRun(
        `CREATE TABLE IF NOT EXISTS message_board (
          id TEXT PRIMARY KEY, student_name TEXT NOT NULL, content TEXT NOT NULL,
          tag TEXT DEFAULT '其他', expires_at INTEGER, created_at INTEGER NOT NULL
        )`
      )

      const id = randomUUID()
      executeRun(
        `INSERT INTO message_board (id, student_name, content, tag, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, studentName, content, tag, expiresAt, Date.now()]
      )
      saveDatabase()
      sendJSON(res, { success: true, data: { id } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      sendJSON(res, { success: false, error: msg }, 500)
    }
    return
  }

  if (method === 'DELETE') {
    try {
      const url = new URL(req.url || '/', `http://localhost:${serverPort}`)
      const id = url.searchParams.get('id') || ''
      if (!id) {
        sendJSON(res, { success: false, error: '缺少 id' }, 400)
        return
      }
      executeRun('DELETE FROM message_board WHERE id = ?', [id])
      saveDatabase()
      sendJSON(res, { success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      sendJSON(res, { success: false, error: msg }, 500)
    }
    return
  }

  sendJSON(res, { success: false, error: 'Method not allowed' }, 405)
}
```

- [ ] **Step 2: 在 lan-server.ts 注册路由**

在 `/api/notify/reads` 路由块之后，`if (method === 'GET')` 之前插入：

```typescript
        if (url === '/api/messages' || url.startsWith('/api/messages?')) {
          handleMessages(req, res)
          return
        }
```

- [ ] **Step 3: 在 server/index.ts 同样添加处理器和路由**

在 `handleNotifyReads` 函数之后，`addFirewallRule` 之前插入 `handleMessages` 函数（与 Step 1 相同代码）。在路由注册处（`/api/notify/reads` 块之后，`// 健康检查` 之前）插入：

```typescript
    if (url === '/api/messages' || url.startsWith('/api/messages?')) {
      handleMessages(req, res)
      return
    }
```

- [ ] **Step 4: 验证编译**

```bash
npx tsc -p tsconfig.node.json && npx tsc -p server/tsconfig.json && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add electron/lan-server.ts server/index.ts
git commit -m "feat: add /api/messages endpoint to LAN and standalone servers"
```

---

### Task 4: 页面 — MessageBoardPage.tsx

**Files:**
- Create: `src/pages/MessageBoardPage.tsx`

- [ ] **Step 1: 创建留言板页面组件**

```typescript
import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Send, Loader2, X, Tag, Clock } from 'lucide-react'
import { getMessages, addMessage, deleteMessage, type MessageRecord, type MessageTag } from '../lib/message-board'

function isLanHttpMode(): boolean {
  return (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    && window.location.hostname !== 'localhost'
    && !window.location.hostname.includes('127.0.0.1')
}

const TAG_CONFIG: Record<MessageTag, { label: string; bg: string; text: string }> = {
  '建议': { label: '建议', bg: 'bg-blue-100', text: 'text-blue-700' },
  '感谢': { label: '感谢', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  '心愿': { label: '心愿', bg: 'bg-pink-100', text: 'text-pink-700' },
  '其他': { label: '其他', bg: 'bg-stone-100', text: 'text-stone-600' },
}

export default function MessageBoardPage() {
  const [messages, setMessages] = useState<MessageRecord[]>([])
  const [studentName, setStudentName] = useState('')
  const [content, setContent] = useState('')
  const [tag, setTag] = useState<MessageTag>('其他')
  const [expiresIn, setExpiresIn] = useState<string>('never')
  const [sending, setSending] = useState(false)
  const isTeacher = isLanHttpMode()

  const loadMessages = useCallback(async () => {
    try {
      const data = await getMessages()
      setMessages(data)
    } catch (err) {
      console.error('加载留言失败:', err)
    }
  }, [])

  useEffect(() => { loadMessages() }, [loadMessages])

  const handleSend = async () => {
    if (!studentName.trim() || !content.trim()) return
    setSending(true)
    try {
      let expiresAt: number | null = null
      if (expiresIn !== 'never') {
        const hours = parseInt(expiresIn)
        expiresAt = Date.now() + hours * 3600 * 1000
      }
      await addMessage(studentName.trim(), content.trim(), tag, expiresAt)
      setStudentName('')
      setContent('')
      setTag('其他')
      setExpiresIn('never')
      loadMessages()
    } catch (err) {
      console.error('发送留言失败:', err)
    } finally {
      setSending(false)
    }
  }

  const handleDelete = async (id: string) => {
    await deleteMessage(id)
    setMessages(prev => prev.filter(m => m.id !== id))
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const isExpired = (expiresAt: number | null) => {
    return expiresAt !== null && expiresAt <= Date.now()
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <MessageSquare size={28} className="text-violet-500" />
          <div>
            <h1 className="text-2xl font-bold text-stone-800">留言板</h1>
            <p className="text-sm text-stone-500">学生的心声，在大屏上展示</p>
          </div>
        </div>

        {/* 教师端：写留言表单 */}
        {isTeacher && (
          <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
            <div className="space-y-3">
              <div className="flex gap-3">
                <input
                  value={studentName}
                  onChange={e => setStudentName(e.target.value)}
                  placeholder="学生姓名"
                  className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
                <div className="flex gap-1">
                  {(Object.keys(TAG_CONFIG) as MessageTag[]).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTag(t)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        tag === t
                          ? 'border-violet-400 bg-violet-50 text-violet-700'
                          : 'border-stone-200 text-stone-500 hover:border-stone-300'
                      }`}
                    >
                      {TAG_CONFIG[t].label}
                    </button>
                  ))}
                </div>
                <select
                  value={expiresIn}
                  onChange={e => setExpiresIn(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-xs text-stone-500 bg-white"
                >
                  <option value="never">长期保留</option>
                  <option value="1">1小时后过期</option>
                  <option value="6">6小时后过期</option>
                  <option value="24">24小时后过期</option>
                </select>
              </div>
              <div className="flex gap-3">
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="输入留言内容..."
                  rows={2}
                  maxLength={300}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !studentName.trim() || !content.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600 disabled:opacity-50 text-sm font-medium transition-colors self-end"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  发送
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 卡片墙 */}
        {messages.length === 0 ? (
          <div className="text-center py-16 text-stone-400">
            <MessageSquare size={48} className="mx-auto mb-3 opacity-30" />
            <p>还没有留言，等待学生的心声...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {messages.map(msg => {
              const expired = isExpired(msg.expires_at)
              const tagCfg = TAG_CONFIG[msg.tag] || TAG_CONFIG['其他']
              return (
                <div
                  key={msg.id}
                  className={`bg-white rounded-xl shadow-sm border p-4 relative group transition-opacity ${
                    expired ? 'opacity-50' : ''
                  }`}
                >
                  {isTeacher && (
                    <button
                      onClick={() => handleDelete(msg.id)}
                      className="absolute top-2 right-2 p-1 rounded hover:bg-red-100 text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X size={14} />
                    </button>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-stone-800">{msg.student_name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${tagCfg.bg} ${tagCfg.text}`}>
                      {tagCfg.label}
                    </span>
                    {expired && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-600">
                        已过期
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  <div className="flex items-center gap-1 mt-3 text-[10px] text-stone-400">
                    <Clock size={10} />
                    {formatTime(msg.created_at)}
                    {msg.expires_at && !expired && (
                      <span className="ml-1">· {formatTime(msg.expires_at)} 过期</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/MessageBoardPage.tsx
git commit -m "feat: add MessageBoardPage with card wall layout"
```

---

### Task 5: 路由和导航

**Files:**
- Modify: `src/App.tsx` — 添加路由
- Modify: `src/components/layout/MainLayout.tsx` — 添加导航项

- [ ] **Step 1: 在 App.tsx 添加路由导入和 Route**

在 imports 区域添加：
```typescript
import MessageBoardPage from './pages/MessageBoardPage'
```

在 Routes 内（SettingsPage 路由之后）添加：
```typescript
        <Route path="message-board" element={<MessageBoardPage />} />
```

- [ ] **Step 2: 在 MainLayout.tsx 添加导航项**

在 navItems 数组中（notify 之后）添加：
```typescript
  { path: '/message-board', label: '留言板', icon: MessageSquare },
```

- [ ] **Step 3: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/layout/MainLayout.tsx
git commit -m "feat: add message-board route and nav item"
```
