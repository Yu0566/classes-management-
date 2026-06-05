import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface NotificationItem {
  id: number
  message: string
}

interface NotificationContextValue {
  enqueue: (message: string) => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function useNotification() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider')
  return ctx
}

const AUTO_DISMISS_MS = 15000

let nextId = 1

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } },
  exit: { opacity: 0, transition: { duration: 0.4 } },
}

const contentVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 30 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 28, delay: 0.15 },
  },
  exit: {
    opacity: 0, scale: 1.05, y: -20,
    transition: { duration: 0.3 },
  },
}

function NotificationOverlay({
  item,
  hovered,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: {
  item: NotificationItem
  progress: number
  hovered: boolean
  onClose: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black"
      variants={overlayVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={onClose}
    >
      <motion.div
        className="relative z-10 w-full max-w-5xl mx-8 text-center"
        variants={contentVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* 纯文字内容 */}
        <p className="text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-snug whitespace-pre-wrap break-words max-w-3xl mx-auto mb-16">
          {item.message}
        </p>

        {/* 关闭按钮 */}
        <button
          onClick={(e) => { e.stopPropagation(); onClose() }}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-base font-medium border border-white/20 hover:border-white/30 transition-all backdrop-blur"
        >
          <X size={18} />
          {hovered ? '已暂停 · 点击关闭' : '点击关闭'}
        </button>

        {/* 提示 */}
        <p className="text-stone-500 text-sm mt-6">
          按 Esc 或点击任意位置关闭 · {AUTO_DISMISS_MS / 1000}秒后自动关闭
        </p>
      </motion.div>

      {/* 底部进度条 */}
      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10">
        <motion.div
          className="h-full bg-white/50 rounded-r-full"
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
          key={item.id}
        />
      </div>
    </motion.div>
  )
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<NotificationItem[]>([])
  const [hovered, setHovered] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const current = queue[0] ?? null

  const dismiss = useCallback(() => {
    setQueue(prev => prev.slice(1))
  }, [])

  const enqueue = useCallback((message: string) => {
    setQueue(prev => [...prev, { id: nextId++, message }])
  }, [])

  // Auto-dismiss with pause on hover
  useEffect(() => {
    if (!current) return
    if (hovered) {
      clearTimeout(timerRef.current)
      return
    }
    timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timerRef.current)
  }, [current, hovered, dismiss])

  // IPC listener (Electron)
  useEffect(() => {
    if (!window.electronAPI?.onNotifyShow) return
    const unsub = window.electronAPI.onNotifyShow(({ message }) => {
      enqueue(message)
    })
    return unsub
  }, [enqueue])

  // HTTP 轮询模式（浏览器访问远程服务端时）
  useEffect(() => {
    const isHttp =
      window.location.protocol === 'http:' && !(window as any).electronAPI?.db
    if (!isHttp) return

    let lastTs = Date.now()
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      try {
        const res = await fetch(`/api/notifications?since=${lastTs}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          for (const n of data.data) {
            if (n.created_at > lastTs) lastTs = n.created_at
            enqueue(n.message)
          }
        }
      } catch { /* ignore */ }
      timer = setTimeout(poll, 3000)
    }

    poll()
    return () => clearTimeout(timer)
  }, [enqueue])

  return (
    <NotificationContext.Provider value={{ enqueue }}>
      {children}
      <AnimatePresence mode="wait">
        {current && (
          <NotificationOverlay
            key={current.id}
            item={current}
            progress={hovered ? 100 : 0}
            hovered={hovered}
            onClose={dismiss}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          />
        )}
      </AnimatePresence>
    </NotificationContext.Provider>
  )
}
