import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, Star, Users, Calculator, History,
  ClipboardCheck, BarChart3, AlertTriangle,
  CalendarCheck, Utensils, Pencil, Coins,
  Settings, ChevronLeft, ChevronRight, ClipboardList, Contact
} from 'lucide-react'

// 导航菜单配置
const navItems = [
  { path: '/', label: '仪表盘', icon: LayoutDashboard, exact: true },
  {
    label: '积分管理', icon: Star, children: [
      { path: '/groups', label: '小组积分', icon: Users },
      { path: '/score-calc', label: '一键算分', icon: Calculator },
      { path: '/score-history', label: '操作历史', icon: History },
    ]
  },
  {
    label: '个人积分', icon: Users, children: [
      { path: '/students', label: '学生管理', icon: Contact },
      { path: '/daily-register', label: '每日登记', icon: ClipboardCheck },
      { path: '/student-scores', label: '积分一览', icon: BarChart3 },
      { path: '/deductions', label: '扣分记录', icon: AlertTriangle },
    ]
  },
  { path: '/duty', label: '值日管理', icon: CalendarCheck },
  { path: '/homework', label: '作业管理', icon: ClipboardList },
  { path: '/attendance', label: '每日考勤', icon: CalendarCheck },
  { path: '/lunch-rest', label: '午餐午休', icon: Utensils },
  { path: '/daily-practice', label: '每日一练', icon: Pencil },
  { path: '/coins', label: '宝龙币', icon: Coins },
]

interface NavItemProps {
  path: string
  label: string
  icon: LucideIcon
  collapsed: boolean
  exact?: boolean
}

function NavItem({ path, label, icon: Icon, collapsed, exact }: NavItemProps) {
  return (
    <NavLink
      to={path}
      end={exact}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150 ${
          isActive
            ? 'bg-primary-100 text-primary-700 font-medium'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      <Icon size={20} />
      {!collapsed && <span className="text-sm whitespace-nowrap">{label}</span>}
    </NavLink>
  )
}

interface NavGroupProps {
  label: string
  icon: LucideIcon
  children: { path: string; label: string; icon: LucideIcon }[]
  collapsed: boolean
}

function NavGroup({ label, icon: Icon, children, collapsed }: NavGroupProps) {
  const [open, setOpen] = useState(true)
  const location = useLocation()
  const isChildActive = children.some(c => location.pathname.startsWith(c.path))

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-3 px-3 py-2 w-full rounded-lg transition-colors duration-150 text-left ${
          isChildActive
            ? 'text-primary-600 font-medium'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        <Icon size={20} />
        {!collapsed && (
          <>
            <span className="text-sm font-medium flex-1 whitespace-nowrap">{label}</span>
            <ChevronRight
              size={14}
              className={`transition-transform ${open ? 'rotate-90' : ''}`}
            />
          </>
        )}
      </button>
      {open && !collapsed && (
        <div className="ml-4 mt-1 space-y-1 border-l border-gray-200 pl-3">
          {children.map(c => (
            <NavItem key={c.path} path={c.path} label={c.label} icon={c.icon} collapsed={false} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false)

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
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {navItems.map(item => {
            if ('children' in item && item.children) {
              return (
                <NavGroup
                  key={item.label}
                  label={item.label}
                  icon={item.icon}
                  children={item.children}
                  collapsed={collapsed}
                />
              )
            }
            return (
              <NavItem
                key={item.path!}
                path={item.path!}
                label={item.label}
                icon={item.icon}
                collapsed={collapsed}
                exact={item.exact}
              />
            )
          })}
        </nav>

        {/* 底部设置 */}
        <div className="border-t border-gray-200 p-2">
          <NavItem path="/settings" label="系统设置" icon={Settings} collapsed={collapsed} />
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
