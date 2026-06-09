import { useState, useEffect, useCallback, useRef } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Reorder, useDragControls } from 'framer-motion'
import {
  LayoutDashboard, Star, Users,
  ClipboardCheck, CalendarCheck, Utensils, Pencil, Coins,
  Settings, ChevronLeft, ChevronRight, ClipboardList, Contact, Calculator, Megaphone, TrendingUp, CalendarDays, GripVertical, MessageSquare, Monitor
} from 'lucide-react'
import { getNewMessageCount } from '@/lib/message-board'

const STORAGE_KEY = 'nav-item-order'
const MSG_LAST_VIEWED_KEY = 'message_board_last_viewed'

const defaultNavItems = [
  { path: '/', label: '班级看板', icon: LayoutDashboard, exact: true },
  { path: '/groups', label: '小组积分', icon: Star },
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
  { path: '/notify', label: '班级通知', icon: Megaphone },
  { path: '/message-board', label: '留言板', icon: MessageSquare },
]

function loadNavOrder() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const order: string[] = JSON.parse(saved)
      const ordered = order
        .map(p => defaultNavItems.find(item => item.path === p))
        .filter(Boolean) as typeof defaultNavItems
      const missing = defaultNavItems.filter(item => !order.includes(item.path))
      return [...ordered, ...missing]
    }
  } catch { /* ignore */ }
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
}: {
  item: (typeof defaultNavItems)[number]
  active: boolean
  collapsed: boolean
  badge?: number
  onClick: () => void
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
      </div>
    </Reorder.Item>
  )
}

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [navItems, setNavItems] = useState(loadNavOrder)
  const [remoteHostname, setRemoteHostname] = useState('')
  const [newMsgCount, setNewMsgCount] = useState(0)
  const lastViewedRef = useRef(Number(localStorage.getItem(MSG_LAST_VIEWED_KEY)) || Date.now())
  const navigate = useNavigate()
  const location = useLocation()
  const [isElectron] = useState(() => !!(window as any).electronAPI)
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
          <Reorder.Group
            axis="y"
            values={navItems.map(i => i.path)}
            onReorder={handleReorder}
            as="div"
            className="space-y-1"
          >
            {navItems.map(item => {
              if (item.path === '/notify' && isElectron) return null
              const badge = item.path === '/message-board' ? newMsgCount : undefined
              return (
                <NavButton
                  key={item.path}
                  item={item}
                  active={isActive(item)}
                  collapsed={collapsed}
                  badge={badge}
                  onClick={() => navigate(item.path)}
                />
              )
            })}
          </Reorder.Group>
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
    </div>
  )
}
