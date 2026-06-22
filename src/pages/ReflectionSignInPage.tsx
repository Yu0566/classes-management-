import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, Clock, Users } from 'lucide-react'

interface StudentItem {
  id: string
  student_name: string
  sign_in_time: number | null
  group_id: string | null
}

interface GroupRecord {
  group_id: string
  group_name: string
  countdown_started_at: number | null
  sign_in_window_start: number | null
  sign_in_window_end: number | null
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function isGroupInSignIn(r: GroupRecord): boolean {
  return !!r.sign_in_window_start && !r.sign_in_window_end
}

export default function ReflectionSignInPage() {
  const [students, setStudents] = useState<StudentItem[]>([])
  const [records, setRecords] = useState<GroupRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [signedInId, setSignedInId] = useState<string | null>(null)

  const loadStudents = useCallback(async () => {
    try {
      const resp = await fetch(`/api/reflection/students?date=${todayStr()}`)
      const json = await resp.json()
      if (json.success) {
        setStudents(json.data || [])
        setRecords(json.records || [])
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

  const handleSignIn = async (student: StudentItem) => {
    if (student.sign_in_time) return
    try {
      const resp = await fetch('/api/reflection/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: student.id }),
      })
      const json = await resp.json()
      if (json.success) {
        setSignedInId(student.id)
        setTimeout(() => setSignedInId(null), 2000)
        loadStudents()
      }
    } catch {
      setError('签到失败，请重试')
    }
  }

  const activeRecords = records.filter(isGroupInSignIn)

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
          <button onClick={loadStudents} className="px-6 py-2 bg-amber-500 text-white rounded-xl font-medium">重试</button>
        </div>
      </div>
    )
  }

  if (activeRecords.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #fef9f0, #fdf5e6)' }}>
        <div className="text-center">
          <Clock size={64} className="mx-auto mb-4 text-stone-200" />
          <p className="text-stone-400 text-xl">当前没有签到窗口</p>
          <p className="text-stone-300 text-sm mt-2">请等待老师开启签到</p>
        </div>
      </div>
    )
  }

  const dots = ['bg-red-400', 'bg-orange-400', 'bg-sky-400', 'bg-emerald-400', 'bg-violet-400']

  return (
    <div className="min-h-screen p-6" style={{ background: 'linear-gradient(135deg, #fef9f0 0%, #fdf5e6 50%, #fffbf5 100%)' }}>
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <Users size={36} className="text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-stone-700">小组团建签到</h1>
          <div className="flex justify-center gap-4 mt-2">
            {activeRecords.map((r, i) => (
              <span key={r.group_id} className="text-sm text-stone-500 font-medium">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${dots[i % dots.length]} mr-1`} />
                {r.group_name}
              </span>
            ))}
          </div>
        </div>

        {activeRecords.map((r, i) => {
          const groupStudents = students.filter(s => s.group_id === r.group_id)
          if (groupStudents.length === 0) return null
          const signedCount = groupStudents.filter(s => s.sign_in_time).length
          return (
            <div key={r.group_id} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-6 h-6 rounded-full ${dots[i % dots.length]} text-white flex items-center justify-center text-xs font-bold`}>
                  {i + 1}
                </span>
                <span className="text-sm font-semibold text-stone-500">{r.group_name}</span>
                <span className="text-xs text-stone-400">{signedCount}/{groupStudents.length}</span>
              </div>
              <div className="grid gap-2">
                {groupStudents.map(s => {
                  const isSigned = !!s.sign_in_time
                  const justSigned = signedInId === s.id
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleSignIn(s)}
                      disabled={isSigned}
                      className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl text-base font-medium transition-all ${
                        justSigned
                          ? 'bg-green-100 border-2 border-green-400 scale-105 shadow-lg'
                          : isSigned
                          ? 'bg-green-50 border-2 border-green-200 text-green-600'
                          : 'bg-white border-2 border-stone-100 hover:border-amber-300 hover:shadow-md active:scale-95 text-stone-600'
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        isSigned ? 'bg-green-500 text-white' : 'bg-stone-100 text-stone-400'
                      }`}>
                        {isSigned ? <CheckCircle size={16} /> : ''}
                      </span>
                      {s.student_name}
                      {isSigned && <span className="ml-auto text-sm text-green-500">已签到</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        <p className="text-center text-xs text-stone-300 mt-8">点击你的姓名完成签到</p>
      </div>
    </div>
  )
}
