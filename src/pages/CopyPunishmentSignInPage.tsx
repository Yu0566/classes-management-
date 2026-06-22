import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, Copy } from 'lucide-react'

interface PunishmentStudent {
  id: string
  student_name: string
  deduction_count: number
  completed: number
  completed_at: number | null
}

export default function CopyPunishmentSignInPage() {
  const [students, setStudents] = useState<PunishmentStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null)

  const loadStudents = useCallback(async () => {
    try {
      const resp = await fetch('/api/punishment/students')
      const json = await resp.json()
      if (json.success) {
        setStudents(json.data || [])
      } else {
        setError(json.error || '加载失败')
      }
    } catch {
      setError('无法连接到服务器')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStudents()
    const timer = setInterval(loadStudents, 5000)
    return () => clearInterval(timer)
  }, [loadStudents])

  const handleComplete = async (student: PunishmentStudent) => {
    if (student.completed) return
    try {
      const resp = await fetch('/api/punishment/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: student.id }),
      })
      const json = await resp.json()
      if (json.success) {
        setJustCompletedId(student.id)
        setTimeout(() => setJustCompletedId(null), 2000)
        loadStudents()
      }
    } catch {
      setError('提交失败，请重试')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #fef9f0, #fdf5e6)' }}>
        <div className="text-stone-400 text-lg">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #fef9f0, #fdf5e6)' }}>
        <div className="text-center">
          <div className="text-red-400 text-lg mb-4">{error}</div>
          <button onClick={() => { setError(null); loadStudents() }} className="px-6 py-2 bg-amber-500 text-white rounded-xl font-medium">重试</button>
        </div>
      </div>
    )
  }

  if (students.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #fef9f0, #fdf5e6)' }}>
        <div className="text-center">
          <Copy size={64} className="mx-auto mb-4 text-stone-200" />
          <p className="text-stone-400 text-xl">当前没有罚抄名单</p>
        </div>
      </div>
    )
  }

  const completedCount = students.filter(s => s.completed).length

  return (
    <div className="min-h-screen p-6" style={{ background: 'linear-gradient(135deg, #fef9f0 0%, #fdf5e6 50%, #fffbf5 100%)' }}>
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <Copy size={36} className="text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-stone-700">罚抄确认</h1>
          <p className="text-sm text-stone-400 mt-2">待确认 {students.length - completedCount} 人</p>
        </div>

        <div className="grid gap-2">
          {students.map(s => {
            const isDone = !!s.completed
            const justDone = justCompletedId === s.id
            return (
              <button
                key={s.id}
                onClick={() => handleComplete(s)}
                disabled={isDone}
                className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl text-base font-medium transition-all ${
                  justDone
                    ? 'bg-green-100 border-2 border-green-400 scale-105 shadow-lg'
                    : isDone
                    ? 'bg-green-50 border-2 border-green-200 text-green-600'
                    : 'bg-white border-2 border-stone-100 hover:border-amber-300 hover:shadow-md active:scale-95 text-stone-600'
                }`}
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  isDone ? 'bg-green-500 text-white' : 'bg-stone-100 text-stone-400'
                }`}>
                  {isDone ? <CheckCircle size={16} /> : ''}
                </span>
                <span className="flex-1 text-left">{s.student_name}</span>
                <span className="text-xs text-stone-400">扣分：{s.deduction_count}</span>
                {isDone
                  ? <span className="text-sm text-green-500 font-bold">✓ 已抄完</span>
                  : <span className="px-3 py-1 bg-amber-500 text-white text-sm rounded-lg font-medium">确认已抄完</span>
                }
              </button>
            )
          })}
        </div>

        <p className="text-center text-xs text-stone-300 mt-8">点击学生姓名确认已完成抄写</p>
      </div>
    </div>
  )
}
