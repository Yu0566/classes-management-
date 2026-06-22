import { useState, useEffect, useCallback, useRef } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Reorder, useDragControls } from 'framer-motion'
import {
  LayoutDashboard, Star, Users,
  ClipboardCheck, CalendarCheck, Utensils, Pencil, Coins,
  Settings, ChevronLeft, ChevronRight, ClipboardList, Contact, Calculator, Megaphone, TrendingUp, CalendarDays, GripVertical, MessageSquare, Monitor, Clock, Lock, Unlock, TreePine, BookOpen
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { getNewMessageCount } from '@/lib/message-board'
import { getUncompletedCount } from '@/lib/copy-punishment'

const STORAGE_KEY = 'nav-item-order'
const NAV_VERSION_KEY = 'nav-item-version'
const NAV_VERSION = 4 // bump this when defaultNavItems changes
const MSG_LAST_VIEWED_KEY = 'message_board_last_viewed'

const defaultNavItems = [
  { path: '/', label: '班级看板', icon: LayoutDashboard, exact: true },
  { path: '/groups', label: '小组积分', icon: Star },
  { path: '/tree', label: '小组植树', icon: TreePine },
  { path: '/students', label: '学生管理', icon: Contact },
  { path: '/student-scores', label: '个人积分', icon: Users },
  { path: '/growth-records', label: '成长记录', icon: TrendingUp },
  { path: '/duty', label: '值日管理', icon: CalendarCheck, exact: true },
  { path: '/duty-rotation', label: '班级轮值', icon: CalendarDays },
  { path: '/homework', label: '作业管理', icon: ClipboardList },
  { path: '/daily-register', label: '每日考勤', icon: ClipboardCheck },
  { path: '/lunch-rest', label: '午餐午休', icon: Utensils },
  { path: '/daily-practice', label: '每日一练', icon: Pencil },
  { path: '/coins', label: '宝龙币', icon: Coins },
  { path: '/math-homework', label: '数学作业等级', icon: Calculator },
  { path: '/chinese-class', label: '课堂加分', icon: BookOpen },
  { path: '/notify', label: '班级通知', icon: Megaphone },
  { path: '/message-board', label: '留言板', icon: MessageSquare },
  { path: '/after-school', label: '课后管理', icon: Clock },
]

function loadNavOrder() {
  try {
    const storedVersion = Number(localStorage.getItem(NAV_VERSION_KEY)) || 0
    if (storedVersion < NAV_VERSION) {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.setItem(NAV_VERSION_KEY, String(NAV_VERSION))
      return defaultNavItems
    }
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const order: string[] = JSON.parse(saved)
      const ordered = order
        .map(p => defaultNavItems.find(item => item.path === p))
        .filter(Boolean) as typeof defaultNavItems
      const missing = defaultNavItems.filter(item => !order.includes(item.path))
      if (missing.length > 0) {
        const result = [...ordered]
        for (const item of missing) {
          const defaultIdx = defaultNavItems.indexOf(item)
          const prevItem = defaultNavItems[defaultIdx - 1]
          const insertAfter = prevItem ? result.findIndex(i => i.path === prevItem.path) : -1
          result.splice(insertAfter + 1, 0, item)
        }
        saveNavOrder(result)
        return result
      }
      return ordered
    }
  } catch { /* ignore */ }
  localStorage.setItem(NAV_VERSION_KEY, String(NAV_VERSION))
  return defaultNavItems
}

function saveNavOrder(items: typeof defaultNavItems) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.map(i => i.path)))
}

/** 单项导航，自带拖拽手柄 */
function NavButton({
  item,
  active,
  collapsed,
  badge,
  onClick,
  onLock,
}: {
  item: (typeof defaultNavItems)[number]
  active: boolean
  collapsed: boolean
  badge?: number
  onClick: () => void
  onLock?: () => void
}) {
  const dragControls = useDragControls()
  const Icon = item.icon

  return (
    <Reorder.Item
      value={item.path}
      dragControls={dragControls}
      dragListener={false}
      whileDrag={{
        scale: 1.03,
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        borderRadius: '8px',
        backgroundColor: '#fff',
        zIndex: 50,
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="relative group rounded-lg list-none"
    >
      <div className="flex items-center">
        {/* 拖拽手柄 */}
        {!collapsed && (
          <span
            className="flex-shrink-0 pl-1 cursor-grab text-transparent group-hover:text-stone-300 hover:!text-stone-500 active:cursor-grabbing transition-colors"
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => dragControls.start(e)}
          >
            <GripVertical size={14} />
          </span>
        )}
        {/* 导航按钮 */}
        <button
          onClick={onClick}
          className={`flex-1 flex items-center gap-3 px-2 py-2 rounded-lg transition-colors duration-150 text-left relative ${
            active
              ? 'bg-primary-100 text-primary-700 font-medium'
              : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'
          }`}
        >
          <span className="relative inline-flex">
            <Icon size={20} />
            {badge != null && badge > 0 && (
              <span className="absolute -top-1.5 -right-2 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full leading-none">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </span>
          {!collapsed && <span className="text-sm whitespace-nowrap">{item.label}</span>}
        </button>
        {/* 锁定按钮 */}
        {onLock && !collapsed && (
          <button
            onClick={(e) => { e.stopPropagation(); onLock() }}
            className="flex-shrink-0 p-1 text-transparent group-hover:text-stone-300 hover:!text-stone-500 transition-colors"
            title="锁定此功能"
          >
            <Unlock size={12} />
          </button>
        )}
      </div>
    </Reorder.Item>
  )
}

const LOCKED_KEY = 'locked-nav-items'

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [navItems, setNavItems] = useState(loadNavOrder)
  const [remoteHostname, setRemoteHostname] = useState('')
  const [newMsgCount, setNewMsgCount] = useState(0)
  const [punishmentBadge, setPunishmentBadge] = useState(0)
  const lastViewedRef = useRef(Number(localStorage.getItem(MSG_LAST_VIEWED_KEY)) || Date.now())
  const navigate = useNavigate()
  const location = useLocation()
  const [isElectron] = useState(() => !!(window as any).electronAPI)

  // 锁定功能
  const [lockedPaths, setLockedPaths] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(LOCKED_KEY) || '[]') } catch { return [] }
  })
  const [unlockTarget, setUnlockTarget] = useState<string | null>(null)
  const [unlockPwInput, setUnlockPwInput] = useState('')
  const [unlockPwError, setUnlockPwError] = useState(false)

  const lockPath = (path: string) => {
    setLockedPaths(prev => {
      const next = [...prev, path]
      localStorage.setItem(LOCKED_KEY, JSON.stringify(next))
      return next
    })
  }

  const unlockPath = (path: string) => {
    setLockedPaths(prev => {
      const next = prev.filter(p => p !== path)
      localStorage.setItem(LOCKED_KEY, JSON.stringify(next))
      return next
    })
  }

  const handleUnlockSubmit = () => {
    const pw = localStorage.getItem('duty_password') || 'admin'
    if (unlockPwInput !== pw) { setUnlockPwError(true); return }
    if (unlockTarget) {
      unlockPath(unlockTarget)
      navigate(unlockTarget)
    }
    setUnlockTarget(null)
    setUnlockPwInput('')
    setUnlockPwError(false)
  }
  const isLanHttp = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    && window.location.hostname !== 'localhost'
    && !window.location.hostname.includes('127.0.0.1')

  console.log('[MainLayout] mounted, isLanHttp:', isLanHttp, 'hostname:', window.location.hostname, 'protocol:', window.location.protocol)

  // 是否正在留言板页面
  const onMessageBoard = location.pathname === '/message-board'

  // 进入留言板页面时清除角标
  useEffect(() => {
    if (onMessageBoard) {
      const now = Date.now()
      lastViewedRef.current = now
      localStorage.setItem(MSG_LAST_VIEWED_KEY, String(now))
      setNewMsgCount(0)
    }
  }, [onMessageBoard])

  // 定期轮询新留言
  const checkNewMessages = useCallback(async () => {
    try {
      const count = await getNewMessageCount(lastViewedRef.current)
      setNewMsgCount(count)
    } catch { /* 数据库未就绪时忽略 */ }
  }, [])

  useEffect(() => {
    checkNewMessages()
    const timer = setInterval(checkNewMessages, 10000)
    return () => clearInterval(timer)
  }, [checkNewMessages])

  // 罚抄未完成角标轮询
  const checkPunishmentBadge = useCallback(async () => {
    try {
      const count = await getUncompletedCount()
      setPunishmentBadge(count)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    checkPunishmentBadge()
    const timer = setInterval(checkPunishmentBadge, 30000)
    return () => clearInterval(timer)
  }, [checkPunishmentBadge])

  useEffect(() => {
    if (!isLanHttp) return
    const checkHealth = () => {
      fetch('/api/health')
        .then(r => r.json())
        .then(d => {
          const name = d.deviceName || d.hostname || ''
          console.log('[MainLayout] health check:', { deviceName: d.deviceName, hostname: d.hostname, displayName: name })
          setRemoteHostname(name)
        })
        .catch(err => console.log('[MainLayout] health check failed:', err))
    }
    checkHealth()
    const timer = setInterval(checkHealth, 30000)
    return () => clearInterval(timer)
  }, [isLanHttp])

  const handleReorder = (paths: string[]) => {
    const reordered = paths
      .map(p => navItems.find(i => i.path === p))
      .filter(Boolean) as typeof navItems
    setNavItems(reordered)
    saveNavOrder(reordered)
  }

  const currentPath = location.pathname || '/'
  const isActive = (item: (typeof defaultNavItems)[number]) => {
    if (item.exact) return currentPath === item.path
    return currentPath === item.path || currentPath.startsWith(item.path + '/')
  }

  return (
    <div className="flex h-screen bg-[#fdfaf3]">
      {/* 左侧边栏 */}
      <aside
        className={`bg-[#fffdf7] border-r border-stone-200 flex flex-col transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center justify-center border-b border-stone-200 px-3">
          {!collapsed && (
            <span className="text-lg font-bold text-primary-700 whitespace-nowrap">
              课堂管理
            </span>
          )}
        </div>

        {/* 导航 */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {/* 未锁定项（可拖拽排序） */}
          <Reorder.Group
            axis="y"
            values={navItems.filter(i => !lockedPaths.includes(i.path) && !(i.path === '/notify' && isElectron)).map(i => i.path)}
            onReorder={(paths) => {
              const unlocked = paths.map(p => navItems.find(i => i.path === p)).filter(Boolean) as typeof navItems
              const locked = navItems.filter(i => lockedPaths.includes(i.path))
              const reordered = [...unlocked, ...locked]
              setNavItems(reordered)
              saveNavOrder(reordered)
            }}
            as="div"
            className="space-y-1"
          >
            {navItems.filter(i => !lockedPaths.includes(i.path) && !(i.path === '/notify' && isElectron)).map(item => {
              const badge = item.path === '/message-board' ? newMsgCount
                : item.path === '/after-school' ? punishmentBadge
                : undefined
              return (
                <NavButton
                  key={item.path}
                  item={item}
                  active={isActive(item)}
                  collapsed={collapsed}
                  badge={badge}
                  onClick={() => navigate(item.path)}
                  onLock={() => lockPath(item.path)}
                />
              )
            })}
          </Reorder.Group>

          {/* 锁定项 */}
          {lockedPaths.length > 0 && (
            <>
              <div className="my-2 border-t border-dashed border-stone-200" />
              <div className="space-y-1">
                {navItems.filter(i => lockedPaths.includes(i.path)).map(item => {
                  const Icon = item.icon
                  return (
                    <div key={item.path} className="relative group rounded-lg">
                      <button
                        onClick={() => { setUnlockPwInput(''); setUnlockPwError(false); setUnlockTarget(item.path) }}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-stone-300 hover:bg-stone-50 transition-colors text-left"
                      >
                        <span className="relative inline-flex">
                          <Icon size={20} />
                        </span>
                        {!collapsed && <span className="text-sm whitespace-nowrap">{item.label}</span>}
                        {!collapsed && <Lock size={12} className="ml-auto text-stone-300" />}
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </nav>

        {/* 底部设置 */}
        <div className="border-t border-stone-200 p-2">
          <button
            onClick={() => navigate('/settings')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 text-left ${
              currentPath === '/settings'
                ? 'bg-primary-100 text-primary-700 font-medium'
                : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'
            }`}
          >
            <Settings size={20} />
            {!collapsed && <span className="text-sm whitespace-nowrap">系统设置</span>}
          </button>
        </div>

        {/* 远程连接指示 */}
        {isLanHttp && remoteHostname && (
          <div className="border-t border-stone-200 px-2 py-1.5">
            <div className="flex items-center gap-2 text-xs text-stone-400">
              <Monitor size={12} />
              {!collapsed && <span className="truncate" title={`已连接到 ${remoteHostname}`}>{remoteHostname}</span>}
            </div>
          </div>
        )}

        {/* 折叠按钮 */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="h-10 flex items-center justify-center border-t border-stone-200 text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </aside>

      {/* 主内容 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* 解锁密码弹窗 */}
      <Modal open={unlockTarget !== null} onClose={() => setUnlockTarget(null)} title="解锁功能" width="sm">
        <div className="space-y-3">
          <p className="text-sm text-stone-500">
            输入密码以解锁「{navItems.find(i => i.path === unlockTarget)?.label}」
          </p>
          <input
            type="password"
            value={unlockPwInput}
            onChange={e => { setUnlockPwInput(e.target.value); setUnlockPwError(false) }}
            onKeyDown={e => e.key === 'Enter' && handleUnlockSubmit()}
            placeholder="请输入密码"
            autoFocus
            className={`w-full px-3 py-2 border rounded-lg text-sm ${unlockPwError ? 'border-red-400' : 'border-stone-300'} focus:outline-none focus:ring-2 focus:ring-primary-200`}
          />
          {unlockPwError && <p className="text-xs text-red-500">密码错误</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setUnlockTarget(null)} className="px-3 py-1.5 text-sm text-stone-500 hover:text-stone-700">取消</button>
            <button onClick={handleUnlockSubmit} className="px-4 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">解锁</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
