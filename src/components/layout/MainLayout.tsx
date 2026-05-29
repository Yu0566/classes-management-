import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Reorder } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, Star, Users,
  ClipboardCheck, CalendarCheck, Utensils, Pencil, Coins,
  Settings, ChevronLeft, ChevronRight, ClipboardList, Contact, GripVertical, Calculator, Armchair
} from 'lucide-react'

const STORAGE_KEY = 'nav-item-order'

const defaultNavItems = [
  { path: '/', label: '班级看板', icon: LayoutDashboard, exact: true },
  { path: '/groups', label: '小组积分', icon: Star },
  { path: '/students', label: '学生管理', icon: Contact },
  { path: '/student-scores', label: '个人积分', icon: Users },
  { path: '/duty', label: '值日管理', icon: CalendarCheck },
  { path: '/homework', label: '作业管理', icon: ClipboardList },
  { path: '/daily-register', label: '每日考勤', icon: ClipboardCheck },
  { path: '/lunch-rest', label: '午餐午休', icon: Utensils },
  { path: '/daily-practice', label: '每日一练', icon: Pencil },
  { path: '/coins', label: '宝龙币', icon: Coins },
  { path: '/math-homework', label: '数学作业等级', icon: Calculator },
  { path: '/seating', label: '座位编排', icon: Armchair },
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

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [navItems, setNavItems] = useState(loadNavOrder)
  const navigate = useNavigate()
  const location = useLocation()

  const handleReorder = (paths: string[]) => {
    const reordered = paths
      .map(p => navItems.find(i => i.path === p))
      .filter(Boolean) as typeof navItems
    setNavItems(reordered)
    saveNavOrder(reordered)
  }

  const currentPath = location.hash.replace('#', '') || '/'
  const isActive = (item: typeof defaultNavItems[number]) => {
    if (item.exact) return currentPath === item.path
    return currentPath.startsWith(item.path)
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 左侧边栏 */}
      <aside
        className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center justify-center border-b border-gray-200 px-3">
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
              const active = isActive(item)
              const Icon = item.icon
              return (
                <Reorder.Item
                  key={item.path}
                  value={item.path}
                  as="div"
                  whileDrag={{
                    scale: 1.05,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                    borderRadius: '8px',
                    backgroundColor: '#fff',
                    zIndex: 50,
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="relative group rounded-lg"
                  style={{ touchAction: 'none' }}
                >
                  {/* 拖拽手柄 */}
                  {!collapsed && (
                    <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 cursor-grab active:cursor-grabbing z-10 p-0.5">
                      <GripVertical size={14} />
                    </div>
                  )}
                  {/* 导航按钮 */}
                  <button
                    onClick={() => navigate(item.path)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 text-left ${
                      active
                        ? 'bg-primary-100 text-primary-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <Icon size={20} />
                    {!collapsed && <span className="text-sm whitespace-nowrap">{item.label}</span>}
                  </button>
                </Reorder.Item>
              )
            })}
          </Reorder.Group>
        </nav>

        {/* 底部设置 */}
        <div className="border-t border-gray-200 p-2">
          <button
            onClick={() => navigate('/settings')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 text-left ${
              currentPath === '/settings'
                ? 'bg-primary-100 text-primary-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Settings size={20} />
            {!collapsed && <span className="text-sm whitespace-nowrap">系统设置</span>}
          </button>
        </div>

        {/* 折叠按钮 */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="h-10 flex items-center justify-center border-t border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
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
