import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X } from 'lucide-react'

interface NotificationItem {
  id: number
  title: string
  message: string
}

interface NotificationContextValue {
  enqueue: (title: string, message: string) => void
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

const iconVariants = {
  hidden: { scale: 0, rotate: -30 },
  visible: {
    scale: 1, rotate: 0,
    transition: { type: 'spring', stiffness: 260, damping: 20, delay: 0.3 },
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
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #312e81 100%)',
      }}
      variants={overlayVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={onClose}
    >
      {/* 装饰背景 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-indigo-400/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-amber-300/5 blur-3xl" />
      </div>

      <motion.div
        className="relative z-10 w-full max-w-4xl mx-8 text-center"
        variants={contentVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* 图标 */}
        <motion.div
          className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-400/15 mb-6"
          variants={iconVariants}
          initial="hidden"
          animate="visible"
        >
          <Bell size={32} className="text-amber-400" />
        </motion.div>

        {/* 标题 */}
        <h2 className="text-base text-slate-400 font-medium tracking-wide mb-8">
          {item.title}
        </h2>

        {/* 内容 */}
        <p className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-snug whitespace-pre-wrap break-words max-w-2xl mx-auto mb-14">
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
        <p className="text-slate-500 text-sm mt-6">
          按 Esc 或点击任意位置关闭 · {AUTO_DISMISS_MS / 1000}秒后自动关闭
        </p>
      </motion.div>

      {/* 底部进度条 */}
      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10">
        <motion.div
          className="h-full bg-gradient-to-r from-amber-400 to-amber-300 rounded-r-full"
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

  const enqueue = useCallback((title: string, message: string) => {
    setQueue(prev => [...prev, { id: nextId++, title, message }])
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

  // IPC listener
  useEffect(() => {
    if (!window.electronAPI?.onNotifyShow) return
    const unsub = window.electronAPI.onNotifyShow(({ title, message }) => {
      enqueue(title, message)
    })
    return unsub
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
