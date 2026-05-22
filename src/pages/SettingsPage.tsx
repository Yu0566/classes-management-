import { useState } from 'react'
import { Database, Download, HardDrive, RefreshCw } from 'lucide-react'
import DataImportPage from './DataImportPage'

export default function SettingsPage() {
  const [tab, setTab] = useState<'import' | 'backup' | 'export' | 'about'>('import')

  const tabs = [
    { key: 'import' as const, label: '数据导入', icon: Download },
    { key: 'backup' as const, label: '备份恢复', icon: HardDrive },
    { key: 'export' as const, label: '数据导出', icon: RefreshCw },
    { key: 'about' as const, label: '关于', icon: Database },
  ]

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">系统设置</h1>

        {/* 标签 */}
        <div className="flex gap-2 mb-6">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-primary-500 text-white' : 'border text-gray-600 hover:bg-gray-50'
              }`}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        {/* 内容 */}
        {tab === 'import' && <DataImportPage />}

        {tab === 'backup' && (
          <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
            <HardDrive size={48} className="mx-auto mb-3 text-gray-300" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">备份与恢复</h3>
            <p className="text-gray-500 text-sm mb-4">
              数据库文件自动保存在应用数据目录中。<br />
              您可以手动备份数据库文件或从备份恢复。
            </p>
            <div className="flex gap-2 justify-center">
              <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm">
                手动备份
              </button>
              <button className="px-4 py-2 border text-gray-600 rounded-lg hover:bg-gray-50 text-sm">
                从备份恢复
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-4">
              自动备份功能将在后续版本实现（保留最近30天）
            </p>
          </div>
        )}

        {tab === 'export' && (
          <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
            <RefreshCw size={48} className="mx-auto mb-3 text-gray-300" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">数据导出</h3>
            <p className="text-gray-500 text-sm mb-4">
              导出积分表、考勤表等数据为 Excel/CSV 格式
            </p>
            <div className="flex gap-2 justify-center">
              <button className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm">
                导出积分表
              </button>
              <button className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm">
                导出考勤表
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-4">Excel/CSV 导出功能将在后续版本实现</p>
          </div>
        )}

        {tab === 'about' && (
          <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
            <Database size={48} className="mx-auto mb-3 text-primary-400" />
            <h3 className="text-lg font-semibold text-gray-700 mb-1">课堂管理系统</h3>
            <p className="text-sm text-gray-500 mb-4">版本 1.0.0</p>
            <div className="text-sm text-gray-600 space-y-1">
              <p>技术栈：Electron + React + TypeScript + SQLite</p>
              <p>数据库：sql.js (SQLite WASM)</p>
              <p>UI：Tailwind CSS + Lucide Icons</p>
            </div>
            <p className="text-xs text-gray-400 mt-4">桌面端一体化班级管理解决方案</p>
          </div>
        )}
      </div>
    </div>
  )
}
