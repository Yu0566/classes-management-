import { useEffect, useState } from 'react'
import { AlertTriangle, Minimize2 } from 'lucide-react'

export default function CloseConfirmDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const off = window.electronAPI?.onCloseRequest(() => setOpen(true))
    return off
  }, [])

  const respond = (decision: 'minimize' | 'quit' | 'cancel') => {
    setOpen(false)
    window.electronAPI?.respondClose(decision)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') respond('cancel')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => respond('cancel')}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-[400px] px-7 py-7 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-4">
          <AlertTriangle size={28} className="text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-stone-800">关闭课堂管理系统？</h2>
        <p className="mt-3 text-sm text-stone-500 leading-relaxed">
          关闭后浏览器 / 手机将无法连接本机。<br />
          建议最小化到后台，软件继续运行。
        </p>

        <button
          onClick={() => respond('minimize')}
          autoFocus
          className="mt-6 w-full flex items-center justify-center gap-2 py-4 text-base font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-xl shadow-lg shadow-primary-500/30 transition-colors"
        >
          <Minimize2 size={20} />
          最小化到后台（推荐）
        </button>

        <button
          onClick={() => respond('quit')}
          className="mt-4 text-sm text-stone-400 hover:text-stone-600 transition-colors"
        >
          仍要退出 ›
        </button>
      </div>
    </div>
  )
}
