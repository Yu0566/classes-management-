import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Send, Loader2, X, Clock, MessageSquare, Sparkles, ImageIcon } from 'lucide-react'
import { getMessages, addMessage, deleteMessage, getImages, type MessageRecord, type MessageTag } from '../lib/message-board'

function isLanHttpMode(): boolean {
  return (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    && window.location.hostname !== 'localhost'
    && !window.location.hostname.includes('127.0.0.1')
}

const TAG_CONFIG: Record<MessageTag, { label: string; dot: string }> = {
  '建议': { label: '建议', dot: '#3b82f6' },
  '感谢': { label: '感谢', dot: '#10b981' },
  '心愿': { label: '心愿', dot: '#ec4899' },
  '其他': { label: '其他', dot: '#78716c' },
}

const PALETTE = [
  { bg: '#fef9c3', line: '#f59e0b' },
  { bg: '#fee2e2', line: '#ef4444' },
  { bg: '#dbeafe', line: '#3b82f6' },
  { bg: '#d1fae5', line: '#10b981' },
  { bg: '#fce7f3', line: '#ec4899' },
  { bg: '#e0e7ff', line: '#6366f1' },
  { bg: '#ffedd5', line: '#f97316' },
  { bg: '#cffafe', line: '#06b6d4' },
  { bg: '#ede9fe', line: '#8b5cf6' },
  { bg: '#fef3c7', line: '#eab308' },
]

const FONT_COLORS = [
  { hex: '#e03131', name: '红色' },
  { hex: '#f08c00', name: '橙色' },
  { hex: '#e6a800', name: '金色' },
  { hex: '#2f9e44', name: '绿色' },
  { hex: '#1971c2', name: '蓝色' },
  { hex: '#7048e8', name: '紫色' },
  { hex: '#c2255c', name: '粉色' },
  { hex: '#0c8599', name: '青色' },
  { hex: '#9c36b5', name: '紫罗兰' },
  { hex: '#e8590c', name: '橘红' },
  { hex: '#2b8a3e', name: '翠绿' },
  { hex: '#364fc7', name: '靛蓝' },
]

const FONT_SIZES = [
  { size: '14px', label: '小号' },
  { size: '16px', label: '标准' },
  { size: '20px', label: '大号' },
  { size: '24px', label: '特大' },
]

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i) | 0
  return Math.abs(h)
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const maxW = 800
        let w = img.width
        let h = img.height
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

export default function MessageBoardPage() {
  const [messages, setMessages] = useState<MessageRecord[]>([])
  const [studentName, setStudentName] = useState('')
  const [content, setContent] = useState('')
  const [tag, setTag] = useState<MessageTag>('其他')
  const [expiresIn, setExpiresIn] = useState('never')
  const [fontColor, setFontColor] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
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
    setSendError(null)
    try {
      let expiresAt: number | null = null
      if (expiresIn !== 'never') {
        expiresAt = Date.now() + parseInt(expiresIn) * 3600 * 1000
      }
      await addMessage(studentName.trim(), content.trim(), tag, expiresAt, imagePreviews, fontColor, fontSize)
      setStudentName('')
      setContent('')
      setTag('其他')
      setExpiresIn('never')
      setImagePreviews([])
      setFontColor(null)
      setFontSize(null)
      loadMessages()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('发送留言失败:', msg)
      setSendError(msg)
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
    const mm = d.getMonth() + 1
    const dd = d.getDate()
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${mm}月${dd}日 ${hh}:${min}`
  }

  const isExpired = (expiresAt: number | null) => {
    return expiresAt !== null && expiresAt <= Date.now()
  }

  const noteStyles = useMemo(() => {
    return messages.map(msg => {
      const h = hashId(msg.id)
      const color = PALETTE[h % PALETTE.length]
      const rotate = ((h % 7) - 3) * 0.8
      const w = [240, 260, 280, 250][h % 4]
      return { color, rotate, w }
    })
  }, [messages])

  return (
    <div className="h-full overflow-auto" style={{ background: '#f5f0e8' }}>
      <div className="p-8 max-w-7xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#fbbf24' }}>
            <MessageSquare size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-700">留言板</h1>
            <p className="text-sm text-stone-400">学生心声 · 便签墙</p>
          </div>
        </div>

        {/* 教师端表单 */}
        {isTeacher && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200/60 p-6 mb-10">
            <div className="flex items-center gap-2 mb-5">
              <Sparkles size={18} className="text-amber-400" />
              <span className="text-sm font-semibold text-stone-500">写一张新便签</span>
            </div>

            {/* 第一行：姓名 + 标签 + 过期 */}
            <div className="flex flex-wrap items-end gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-stone-400 mb-1.5">谁说的？</label>
                <input
                  value={studentName}
                  onChange={e => setStudentName(e.target.value)}
                  placeholder="输入学生姓名"
                  className="w-36 px-4 py-3 bg-stone-50 rounded-xl text-base outline-none border border-stone-200 focus:border-amber-300 focus:ring-2 focus:ring-amber-50 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-400 mb-1.5">分类标签</label>
                <div className="flex gap-2">
                  {(Object.keys(TAG_CONFIG) as MessageTag[]).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTag(t)}
                      className={`px-4 py-3 rounded-xl text-sm font-medium transition-all border ${
                        tag === t
                          ? 'border-amber-300 bg-amber-50 text-amber-700 shadow-sm'
                          : 'border-stone-200 bg-stone-50 text-stone-400 hover:border-stone-300 hover:text-stone-500'
                      }`}
                    >
                      {TAG_CONFIG[t].label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-400 mb-1.5">保留时间</label>
                <select
                  value={expiresIn}
                  onChange={e => setExpiresIn(e.target.value)}
                  className="px-4 py-3 bg-stone-50 rounded-xl text-sm text-stone-500 outline-none border border-stone-200 cursor-pointer"
                >
                  <option value="never">长期保留</option>
                  <option value="1">1小时后过期</option>
                  <option value="6">6小时后过期</option>
                  <option value="24">24小时后过期</option>
                </select>
              </div>
            </div>

            {/* 字体颜色 */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-stone-400 mb-2">字体颜色</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFontColor(null)}
                  className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${
                    fontColor === null ? 'border-amber-400 scale-110' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ background: '#3d3d3d' }}
                  title="默认"
                >
                  <span className="text-white text-[10px] font-bold">A</span>
                </button>
                {FONT_COLORS.map(c => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setFontColor(c.hex)}
                    className={`w-9 h-9 rounded-full border-2 transition-all hover:scale-110 ${
                      fontColor === c.hex ? 'border-amber-400 scale-110 shadow-md' : 'border-stone-200'
                    }`}
                    style={{ background: c.hex }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* 字号 */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-stone-400 mb-2">字号</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFontSize(null)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    fontSize === null
                      ? 'border-amber-300 bg-amber-50 text-amber-700'
                      : 'border-stone-200 bg-stone-50 text-stone-400 hover:border-stone-300'
                  }`}
                >
                  默认
                </button>
                {FONT_SIZES.map(s => (
                  <button
                    key={s.size}
                    type="button"
                    onClick={() => setFontSize(s.size)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      fontSize === s.size
                        ? 'border-amber-300 bg-amber-50 text-amber-700'
                        : 'border-stone-200 bg-stone-50 text-stone-400 hover:border-stone-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 第二行：内容 + 图片 + 发送 */}
            <div className="flex items-end gap-3">
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="写下留言内容...（可直接粘贴图片）"
                rows={2}
                maxLength={300}
                onPaste={async (e) => {
                  const items = e.clipboardData?.items
                  if (!items) return
                  for (const item of Array.from(items)) {
                    if (item.type.startsWith('image/')) {
                      e.preventDefault()
                      const file = item.getAsFile()
                      if (!file) continue
                      try {
                        const dataUrl = await compressImage(file)
                        setImagePreviews(prev => [...prev, dataUrl])
                      } catch (err) {
                        console.error('粘贴图片失败:', err)
                      }
                    }
                  }
                }}
                className="flex-1 px-4 py-3 bg-stone-50 rounded-xl text-base outline-none border border-stone-200 focus:border-amber-300 focus:ring-2 focus:ring-amber-50 transition-all resize-none"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = e.target.files
                  if (!files || files.length === 0) return
                  for (const file of Array.from(files)) {
                    try {
                      const dataUrl = await compressImage(file)
                      setImagePreviews(prev => [...prev, dataUrl])
                    } catch (err) {
                      console.error('图片压缩失败:', err)
                    }
                  }
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-3 bg-stone-50 rounded-xl text-sm font-medium text-stone-400 border border-stone-200 hover:border-amber-300 hover:text-amber-600 transition-all"
              >
                <ImageIcon size={18} />
                图片
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !studentName.trim() || !content.trim()}
                className="flex items-center gap-2 px-6 py-3 text-white rounded-xl text-base font-semibold transition-all disabled:opacity-40 shadow-sm hover:shadow-md"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
              >
                {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                贴上墙
              </button>
            </div>

            {/* 图片预览 */}
            {imagePreviews.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {imagePreviews.map((img, idx) => (
                  <div key={idx} className="inline-block relative">
                    <img src={img} alt={`预览${idx + 1}`} className="h-20 rounded-lg border border-stone-200" />
                    <button
                      onClick={() => setImagePreviews(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-white border-2 border-red-200 text-red-400 rounded-full flex items-center justify-center shadow-sm hover:bg-red-50 hover:border-red-300"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 错误提示 */}
            {sendError && (
              <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <X size={16} className="flex-shrink-0" />
                <span>发送失败：{sendError}</span>
                <button onClick={() => setSendError(null)} className="ml-auto text-red-400 hover:text-red-600">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* 便签墙 */}
        {messages.length === 0 ? (
          <div className="text-center py-28 text-stone-300 select-none">
            <MessageSquare size={56} className="mx-auto mb-4 opacity-15" />
            <p className="text-lg">还没有留言，写一张贴上去吧</p>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center" style={{ gap: '32px 28px', padding: '12px 0 48px' }}>
            {messages.map((msg, i) => {
              const expired = isExpired(msg.expires_at)
              const tagCfg = TAG_CONFIG[msg.tag] || TAG_CONFIG['其他']
              const { color, rotate, w } = noteStyles[i] || { color: PALETTE[0], rotate: 0, w: 260 }

              return (
                <div
                  key={msg.id}
                  className="group relative flex-shrink-0"
                  style={{
                    width: w,
                    transform: `rotate(${rotate}deg)`,
                    transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                    opacity: expired ? 0.45 : 1,
                    zIndex: 1,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'rotate(0deg) translateY(-6px) scale(1.03)'
                    e.currentTarget.style.zIndex = '20'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = `rotate(${rotate}deg) translateY(0) scale(1)`
                    e.currentTarget.style.zIndex = '1'
                  }}
                >
                  <div
                    className="p-6 flex flex-col"
                    style={{
                      background: color.bg,
                      borderRadius: '6px 22px 8px 20px',
                      boxShadow: '0 2px 3px rgba(0,0,0,0.03), 0 6px 16px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.5)',
                      minHeight: 140,
                    }}
                  >
                    <div
                      className="absolute top-0 left-10 right-10 h-[3px] rounded-full opacity-40"
                      style={{ background: color.line }}
                    />

                    {isTeacher && (
                      <button
                        onClick={() => handleDelete(msg.id)}
                        className="absolute -top-2 -right-2 w-7 h-7 bg-white border-2 border-red-200 text-red-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-sm hover:bg-red-50 hover:border-red-300 hover:text-red-500"
                        style={{ zIndex: 30 }}
                      >
                        <X size={13} />
                      </button>
                    )}

                    {/* 姓名 + 标签 */}
                    <div className="flex items-center gap-3 mb-3">
                      <span className="font-bold text-stone-700 text-base tracking-wide" style={{ fontFamily: "'ZCOOL KuaiLe', 'KaiTi', serif", color: msg.font_color || undefined }}>{msg.student_name}</span>
                      <span className="flex items-center gap-1.5 text-sm text-stone-400">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tagCfg.dot }} />
                        {tagCfg.label}
                      </span>
                      {expired && (
                        <span className="text-xs text-red-400 bg-red-50 px-2 py-0.5 rounded-full font-medium">
                          已过期
                        </span>
                      )}
                    </div>

                    {/* 图片 */}
                    {(() => {
                      const imgs = getImages(msg)
                      if (imgs.length === 0) return null
                      return (
                        <div className="mb-3 -mx-1 flex flex-wrap gap-1">
                          {imgs.map((src, idx) => (
                            <img
                              key={idx}
                              src={src}
                              alt={`图片${idx + 1}`}
                              className="max-w-full max-h-32 rounded-lg object-contain"
                              style={{ background: 'rgba(0,0,0,0.03)' }}
                            />
                          ))}
                        </div>
                      )
                    })()}

                    {/* 内容 */}
                    <p
                      className="whitespace-pre-wrap flex-1 tracking-wide"
                      style={{
                        fontFamily: "'Ma Shan Zheng', 'KaiTi', cursive",
                        lineHeight: msg.font_size ? 1.8 : 1.9,
                        color: msg.font_color || undefined,
                        fontSize: msg.font_size || undefined,
                      }}
                    >
                      {msg.content}
                    </p>

                    {/* 时间 */}
                    <div className="flex items-center gap-1.5 mt-4 text-xs text-stone-300">
                      <Clock size={12} />
                      {formatTime(msg.created_at)}
                    </div>
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
