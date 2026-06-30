import { useState, useEffect, useCallback, useRef } from 'react'
import { Trash2, CheckCircle, Timer, Users, RefreshCw, Copy, UserPlus, X, AlertTriangle, Plus, Clock, LogIn, Check, Lock, Megaphone, History } from 'lucide-react'
import { useConfirm } from '../components/ui/ConfirmDialog'
import Modal from '../components/ui/Modal'
import StudentPickerModal from '../components/ui/StudentPickerModal'
import * as reflectionApi from '../lib/reflection'
import * as copyPunishmentApi from '../lib/copy-punishment'
import * as detentionApi from '../lib/detention'
import * as studentApi from '../lib/students'
import * as groupApi from '../lib/groups'
import { queryAll } from '../lib/db'
import DutyPanel from './DutyPage'
import type { ReflectionRecord, ReflectionStudent, CopyPunishmentStudent, CopyPunishmentLog, Group, DetentionRecord, DetentionStudent, StudentWithGroup } from '../types'

type WindowState = 'idle' | 'counting_down' | 'signing_in' | 'finished'

const PASTEL_BG = { background: 'linear-gradient(135deg, #fef9f0 0%, #fdf5e6 50%, #fffbf5 100%)' }
const DOT_COLORS = ['bg-red-400', 'bg-orange-400', 'bg-sky-400', 'bg-emerald-400', 'bg-violet-400']

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatTime(ts: number) {
  const m = Math.floor(ts / 60)
  const s = ts % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function getGroupDuration(groupId: string): number {
  return Number(localStorage.getItem('reflection_duration_' + groupId)) || 30
}

const isBrowser = !window.electronAPI

export default function AfterSchoolPage() {
  const [activeTab, setActiveTab] = useState<'duty' | 'reflection' | 'punishment' | 'detention'>('duty')

  // ========== 小组团建 state ==========
  const [addedGroupIds, setAddedGroupIds] = useState<string[]>([])
  const [groupStates, setGroupStates] = useState<Record<string, WindowState>>({})
  const [groupCountdowns, setGroupCountdowns] = useState<Record<string, number>>({})
  const [groupSignInRemainings, setGroupSignInRemainings] = useState<Record<string, number>>({})
  const [groupStudents, setGroupStudents] = useState<Record<string, ReflectionStudent[]>>({})
  const [allGroups, setAllGroups] = useState<Group[]>([])
  const [reflectionPwInput, setReflectionPwInput] = useState('')
  const [forceEndTarget, setForceEndTarget] = useState<string | null>(null)
  const [resetTarget, setResetTarget] = useState<string | null>(null)
  const [showGroupPicker, setShowGroupPicker] = useState(false)
  const [recordCache, setRecordCache] = useState<Record<string, ReflectionRecord>>({})
  const manuallyAddedRef = useRef<Set<string>>(new Set())

  // 密码弹窗用 ref，避免闭包过期
  const pwModalRef = useRef({ pwInput: '', resetTarget: null as string | null, forceEndTarget: null as string | null })
  pwModalRef.current.pwInput = reflectionPwInput
  pwModalRef.current.resetTarget = resetTarget
  pwModalRef.current.forceEndTarget = forceEndTarget

  // Timer
  const masterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const statesRef = useRef(groupStates)
  statesRef.current = groupStates
  const recordCacheRef = useRef(recordCache)
  recordCacheRef.current = recordCache

  // Handler refs
  const onCountdownEndRef = useRef<(groupId: string) => void>(() => {})
  onCountdownEndRef.current = async (groupId: string) => {
    await reflectionApi.openSignInWindow(todayStr(), groupId)
    setGroupSignInRemainings(prev => ({ ...prev, [groupId]: reflectionApi.SIGN_IN_WINDOW_SECONDS }))
    setGroupStates(prev => ({ ...prev, [groupId]: 'signing_in' }))
  }


  const removeGroupFromUI = useCallback((groupId: string) => {
    setAddedGroupIds(prev => prev.filter(id => id !== groupId))
    setGroupStates(prev => { const n = { ...prev }; delete n[groupId]; return n })
    setGroupCountdowns(prev => { const n = { ...prev }; delete n[groupId]; return n })
    setGroupSignInRemainings(prev => { const n = { ...prev }; delete n[groupId]; return n })
    setGroupStudents(prev => { const n = { ...prev }; delete n[groupId]; return n })
    setRecordCache(prev => { const n = { ...prev }; delete n[groupId]; return n })
    manuallyAddedRef.current.delete(groupId)
  }, [])

  const onSignInEndRef = useRef<(groupId: string) => void>(() => {})
  onSignInEndRef.current = async (groupId: string) => {
    const date = todayStr()
    await reflectionApi.closeSignInWindow(date, groupId)
    const record = recordCacheRef.current[groupId] || await reflectionApi.getRecord(date, groupId)
    if (record) {
      const students = await reflectionApi.getReflectionStudents(record.id, groupId)
      setGroupStudents(prev => ({ ...prev, [groupId]: students }))
      if (students.length > 0 && students.every(s => s.sign_in_time)) {
        await reflectionApi.deleteReflectionRecord(date, groupId)
        removeGroupFromUI(groupId)
        return
      }
    }
    setGroupStates(prev => ({ ...prev, [groupId]: 'finished' }))
  }

  // ========== 罚抄管理 state ==========
  const [punishmentStudents, setPunishmentStudents] = useState<CopyPunishmentStudent[]>([])
  const [punishmentWeekLabel, setPunishmentWeekLabel] = useState('')
  const [allStudents, setAllStudents] = useState<StudentWithGroup[]>([])
  const [showPunishmentPicker, setShowPunishmentPicker] = useState(false)
  const [showPunishmentLog, setShowPunishmentLog] = useState(false)
  const [punishmentLog, setPunishmentLog] = useState<CopyPunishmentLog[]>([])

  // ========== 延时续费 state ==========
  const [detentionRecord, setDetentionRecord] = useState<DetentionRecord | null>(null)
  const [detentionStudents, setDetentionStudents] = useState<DetentionStudent[]>([])
  const [detentionState, setDetentionState] = useState<WindowState>('idle')
  const [detentionCountdown, setDetentionCountdown] = useState(detentionApi.DETENTION_DURATION_MINUTES * 60)
  const [detentionSignInRemaining, setDetentionSignInRemaining] = useState(detentionApi.SIGN_IN_WINDOW_SECONDS)
  const [showDetentionPicker, setShowDetentionPicker] = useState(false)
  const [detentionDuration, setDetentionDuration] = useState(() => {
    const saved = localStorage.getItem('detention_duration')
    return saved ? parseInt(saved, 10) : detentionApi.DETENTION_DURATION_MINUTES
  })
  const [detentionPwInput, setDetentionPwInput] = useState('')
  const [detentionPwError, setDetentionPwError] = useState(false)
  const [showDetentionPwModal, setShowDetentionPwModal] = useState(false)
  const detentionCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const detentionSignInRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const detentionRecordRef = useRef<DetentionRecord | null>(null)
  const detentionDurationRef = useRef(detentionDuration)
  detentionRecordRef.current = detentionRecord
  detentionDurationRef.current = detentionDuration
  // 延时续费用到的全量学生+组信息
  const [detentionAllStudents, setDetentionAllStudents] = useState<StudentWithGroup[]>([])
  const [detentionGroupMap, setDetentionGroupMap] = useState<Map<string, Group>>(new Map())

  const { confirm, notify } = useConfirm()

  // ========== 延时续费 数据加载 ==========
  const loadDetentionData = useCallback(async () => {
    try {
      const [students, groups, record] = await Promise.all([
        studentApi.getAllStudents(),
        groupApi.getAllGroups(),
        detentionApi.getOrCreateDetentionRecord(todayStr()),
      ])
      setDetentionAllStudents(students)
      setDetentionGroupMap(new Map(groups.map(g => [g.id, g])))
      setDetentionRecord(record)
      const ds = await detentionApi.getDetentionStudents(record.id)
      setDetentionStudents(ds)

      const now = Date.now()
      const countdownMs = detentionDurationRef.current * 60 * 1000
      const signInMs = detentionApi.SIGN_IN_WINDOW_SECONDS * 1000

      if (record.sign_in_window_end) {
        setDetentionState('finished')
      } else if (record.sign_in_window_start && record.sign_in_window_start + signInMs > now) {
        setDetentionState('signing_in')
        setDetentionSignInRemaining(Math.max(0, Math.ceil((record.sign_in_window_start + signInMs - now) / 1000)))
      } else if (record.sign_in_window_start) {
        await detentionApi.closeSignInWindow(todayStr())
        setDetentionState('finished')
      } else if (record.countdown_started_at && record.countdown_started_at + countdownMs > now) {
        setDetentionState('counting_down')
        setDetentionCountdown(Math.max(0, Math.ceil((record.countdown_started_at + countdownMs - now) / 1000)))
      } else if (record.countdown_started_at) {
        // 系统关闭期间倒计时到期，自动开启签到窗口
        await detentionApi.openSignInWindow(todayStr())
        setDetentionState('signing_in')
        setDetentionSignInRemaining(detentionApi.SIGN_IN_WINDOW_SECONDS)
      }
    } catch (err) {
      console.error('[延时续费] 加载失败', err)
    }
  }, [])

  useEffect(() => { loadDetentionData() }, [loadDetentionData])

  // 延时续费 倒计时
  useEffect(() => {
    if (detentionState === 'counting_down' && detentionCountdown > 0) {
      detentionCountdownRef.current = setInterval(() => {
        setDetentionCountdown(prev => {
          if (prev <= 1) { clearInterval(detentionCountdownRef.current!); handleDetentionCountdownEnd(); return 0 }
          return prev - 1
        })
      }, 1000)
      return () => { if (detentionCountdownRef.current) clearInterval(detentionCountdownRef.current) }
    }
  }, [detentionState])

  // 延时续费 签到窗口倒计时
  useEffect(() => {
    if (detentionState === 'signing_in' && detentionSignInRemaining > 0) {
      detentionSignInRef.current = setInterval(() => {
        setDetentionSignInRemaining(prev => {
          if (prev <= 1) { clearInterval(detentionSignInRef.current!); handleDetentionSignInWindowEnd(); return 0 }
          return prev - 1
        })
      }, 1000)
      return () => { if (detentionSignInRef.current) clearInterval(detentionSignInRef.current) }
    }
  }, [detentionState])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (detentionCountdownRef.current) clearInterval(detentionCountdownRef.current)
      if (detentionSignInRef.current) clearInterval(detentionSignInRef.current)
    }
  }, [])

  const handleDetentionCountdownEnd = async () => {
    await detentionApi.openSignInWindow(todayStr())
    const record = await detentionApi.getDetentionRecord(todayStr())
    setDetentionRecord(record || null)
    setDetentionState('signing_in')
    setDetentionSignInRemaining(detentionApi.SIGN_IN_WINDOW_SECONDS)
  }

  const handleDetentionSignInWindowEnd = async () => {
    const cr = detentionRecordRef.current
    if (!cr) return
    try {
      await detentionApi.closeSignInWindow(todayStr())
      setDetentionState('finished')
      const ds = await detentionApi.getDetentionStudents(cr.id)
      setDetentionStudents(ds)
    } catch (err) {
      console.error('[detention signin end]', err)
      setDetentionState('finished')
    }
  }

  const handleDetentionStart = async () => {
    if (detentionStudents.length === 0) { await notify('延时续费名单为空'); return }
    if (!await confirm({ message: '确认开始延时续费？\n\n开始后将进入倒计时，倒计时结束后开启签到窗口。', variant: 'normal' })) return
    const record = await detentionApi.startDetention(todayStr())
    setDetentionRecord(record)
    setDetentionState('counting_down')
    setDetentionCountdown(detentionDuration * 60)
  }

  const handleDetentionStudentSignIn = async (dsId: string) => {
    await detentionApi.studentSignIn(dsId)
    setDetentionStudents(prev => prev.map(d => d.id === dsId ? { ...d, sign_in_time: Date.now() } : d))
  }

  const handleDetentionAddStudent = async (studentId: string, studentName: string) => {
    const record = detentionRecord || detentionRecordRef.current
    if (!record) { await notify('延时续费数据未加载，请刷新重试'); return }
    try {
      await detentionApi.addDetentionStudent(record.id, studentId, studentName)
      const ds = await detentionApi.getDetentionStudents(record.id)
      setDetentionStudents(ds)
    } catch (err) {
      await notify('添加失败')
    }
  }

  const handleDetentionRemoveStudent = async (dsId: string, studentName: string) => {
    if (!await confirm({ message: `确认将"${studentName}"从延时续费名单中移除？` })) return
    await detentionApi.removeDetentionStudent(dsId)
    setDetentionStudents(prev => prev.filter(d => d.id !== dsId))
  }

  const handleDetentionReset = async () => {
    if (detentionCountdownRef.current) clearInterval(detentionCountdownRef.current)
    if (detentionSignInRef.current) clearInterval(detentionSignInRef.current)
    await detentionApi.resetDetentionRecord(todayStr())
    setDetentionState('idle')
    if (detentionRecordRef.current) {
      const students = await detentionApi.getDetentionStudents(detentionRecordRef.current.id)
      setDetentionStudents(students)
    }
  }

  const handleDetentionNextRound = async () => {
    const cr = detentionRecordRef.current
    if (!cr) return
    const signedStudentIds = detentionStudents
      .filter(d => d.sign_in_time)
      .map(d => d.id)
    await detentionApi.resetDetentionRecord(todayStr())
    for (const dsId of signedStudentIds) {
      await detentionApi.removeDetentionStudent(dsId)
    }
    setDetentionState('idle')
    const ds = await detentionApi.getDetentionStudents(cr.id)
    setDetentionStudents(ds)
  }

  const handleDetentionPwSubmit = async () => {
    const pw = localStorage.getItem('duty_password') || 'admin'
    if (detentionPwInput !== pw) { setDetentionPwError(true); return }
    setDetentionPwInput('')
    setDetentionPwError(false)
    setShowDetentionPwModal(false)
    await handleDetentionReset()
  }

  // ===== 加载小组团建 =====
  const loadReflection = useCallback(async () => {
    const groups = await queryAll<Group>('SELECT * FROM groups ORDER BY (total_score + COALESCE(tree_spent, 0)) ASC')
    setAllGroups(groups)
    const bottom2Ids = new Set(groups.slice(0, 2).map(g => g.id))

    const date = todayStr()
    const records = await reflectionApi.getRecordsByDate(date)
    const cache: Record<string, ReflectionRecord> = {}
    const ids: string[] = []
    const states: Record<string, WindowState> = {}
    const countdowns: Record<string, number> = {}
    const signIns: Record<string, number> = {}
    const studentsMap: Record<string, ReflectionStudent[]> = {}
    const manual = new Set<string>()

    for (const r of records) {
      if (cache[r.group_id]) continue
      cache[r.group_id] = r
      ids.push(r.group_id)
      if (!bottom2Ids.has(r.group_id)) manual.add(r.group_id)
      const st = await reflectionApi.getReflectionStudents(r.id, r.group_id)
      studentsMap[r.group_id] = st

      if (r.countdown_started_at && !r.sign_in_window_start) {
        const dur = getGroupDuration(r.group_id) * 60
        const elapsed = Math.floor((Date.now() - r.countdown_started_at) / 1000)
        const remaining = Math.max(0, dur - elapsed)
        if (remaining > 0) {
          countdowns[r.group_id] = remaining
          states[r.group_id] = 'counting_down'
        } else {
          await reflectionApi.openSignInWindow(date, r.group_id)
          signIns[r.group_id] = reflectionApi.SIGN_IN_WINDOW_SECONDS
          states[r.group_id] = 'signing_in'
        }
      } else if (r.sign_in_window_start && !r.sign_in_window_end) {
        const elapsed = Math.floor((Date.now() - r.sign_in_window_start) / 1000)
        const remaining = Math.max(0, reflectionApi.SIGN_IN_WINDOW_SECONDS - elapsed)
        if (remaining > 0) {
          signIns[r.group_id] = remaining
          states[r.group_id] = 'signing_in'
        } else {
          await reflectionApi.closeSignInWindow(date, r.group_id)
          if (st.length > 0 && st.every(s => s.sign_in_time)) {
            await reflectionApi.deleteReflectionRecord(date, r.group_id)
            delete cache[r.group_id]
            continue
          }
          states[r.group_id] = 'finished'
        }
      } else if (r.sign_in_window_end) {
        if (st.length > 0 && st.every(s => s.sign_in_time)) {
          await reflectionApi.deleteReflectionRecord(date, r.group_id)
          delete cache[r.group_id]
          continue
        }
        states[r.group_id] = 'finished'
      } else {
        states[r.group_id] = 'idle'
      }
    }

    manuallyAddedRef.current = manual
    setRecordCache(cache)
    setAddedGroupIds(ids.filter(id => cache[id]))
    setGroupStates(states)
    setGroupCountdowns(countdowns)
    setGroupSignInRemainings(signIns)
    setGroupStudents(studentsMap)
  }, [])

  useEffect(() => {
    loadReflection()
    loadPunishment()
    loadAllStudents()
  }, [loadReflection])

  // ===== 主定时器 =====
  useEffect(() => {
    const hasActive = Object.values(groupStates).some(s => s === 'counting_down' || s === 'signing_in')
    if (hasActive && !masterTimerRef.current) {
      masterTimerRef.current = setInterval(() => {
        setGroupCountdowns(prev => {
          const next = { ...prev }
          for (const gid of Object.keys(next)) {
            if (statesRef.current[gid] === 'counting_down') {
              if (next[gid] <= 1) {
                delete next[gid]
                onCountdownEndRef.current(gid)
              } else {
                next[gid] = next[gid] - 1
              }
            }
          }
          return next
        })
        setGroupSignInRemainings(prev => {
          const next = { ...prev }
          for (const gid of Object.keys(next)) {
            if (statesRef.current[gid] === 'signing_in') {
              if (next[gid] <= 1) {
                delete next[gid]
                onSignInEndRef.current(gid)
              } else {
                next[gid] = next[gid] - 1
              }
            }
          }
          return next
        })
      }, 1000)
    } else if (!hasActive && masterTimerRef.current) {
      clearInterval(masterTimerRef.current)
      masterTimerRef.current = null
    }
    return () => {
      if (masterTimerRef.current) { clearInterval(masterTimerRef.current); masterTimerRef.current = null }
    }
  }, [groupStates])

  // ===== 操作 =====
  const handleAddGroup = async (group: Group) => {
    const date = todayStr()
    const record = await reflectionApi.getOrCreateRecord(date, group.id, group.name)
    await reflectionApi.addReflectionGroup(record.id, group.id, group.name)
    const students = await reflectionApi.getReflectionStudents(record.id, group.id)

    manuallyAddedRef.current.add(group.id)
    setRecordCache(prev => ({ ...prev, [group.id]: record }))
    setAddedGroupIds(prev => [...prev, group.id])
    setGroupStates(prev => ({ ...prev, [group.id]: 'idle' }))
    setGroupStudents(prev => ({ ...prev, [group.id]: students }))
    setShowGroupPicker(false)
  }

  const handleDeleteGroup = async (groupId: string) => {
    const g = allGroups.find(x => x.id === groupId)
    const name = g?.name || recordCache[groupId]?.group_name || groupId
    if (!await confirm({ message: `确认删除"${name}"的小组团建？\n\n将移除该小组及所有学生记录。` })) return
    await reflectionApi.deleteReflectionRecord(todayStr(), groupId)
    removeGroupFromUI(groupId)
  }

  const handleRemoveStudent = async (groupId: string, dsId: string) => {
    if (!await confirm({ message: '确认将该学生从小组团建名单中移除？' })) return
    await reflectionApi.removeReflectionStudent(dsId)
    setGroupStudents(prev => ({
      ...prev,
      [groupId]: (prev[groupId] || []).filter(s => s.id !== dsId),
    }))
  }

  const handleReflectionSignIn = async (groupId: string, rsId: string) => {
    await reflectionApi.studentSignIn(rsId)
    const updated = (groupStudents[groupId] || []).map(s =>
      s.id === rsId ? { ...s, sign_in_time: Date.now() } : s
    )
    setGroupStudents(prev => ({ ...prev, [groupId]: updated }))
    if (updated.length > 0 && updated.every(s => s.sign_in_time)) {
      await reflectionApi.deleteReflectionRecord(todayStr(), groupId)
      removeGroupFromUI(groupId)
    }
  }

  const handleStartGroup = async (groupId: string) => {
    const students = groupStudents[groupId] || []
    const g = allGroups.find(x => x.id === groupId)
    const name = g?.name || recordCache[groupId]?.group_name || groupId
    const dur = getGroupDuration(groupId)
    if (students.length === 0) {
      notify({ message: `"${name}"没有学生，请先添加` })
      return
    }
    if (!await confirm({ message: `确认开始"${name}"的小组团建？\n时长：${dur} 分钟`, variant: 'normal' })) return

    await reflectionApi.startReflection(todayStr(), groupId)
    setGroupCountdowns(prev => ({ ...prev, [groupId]: dur * 60 }))
    setGroupStates(prev => ({ ...prev, [groupId]: 'counting_down' }))
  }

  const doForceEnd = async (groupId: string) => {
    const date = todayStr()
    const record = recordCache[groupId] || await reflectionApi.getRecord(date, groupId)
    if (record) {
      if (record.countdown_started_at && !record.sign_in_window_start) {
        await reflectionApi.openSignInWindow(date, groupId)
        await reflectionApi.closeSignInWindow(date, groupId)
      } else if (record.sign_in_window_start && !record.sign_in_window_end) {
        await reflectionApi.closeSignInWindow(date, groupId)
      }
      const students = await reflectionApi.getReflectionStudents(record.id, groupId)
      setGroupStudents(prev => ({ ...prev, [groupId]: students }))
      if (students.length > 0 && students.every(s => s.sign_in_time)) {
        await reflectionApi.deleteReflectionRecord(date, groupId)
        removeGroupFromUI(groupId)
        return
      }
    }
    setGroupStates(prev => ({ ...prev, [groupId]: 'finished' }))
    setGroupCountdowns(prev => { const n = { ...prev }; delete n[groupId]; return n })
    setGroupSignInRemainings(prev => { const n = { ...prev }; delete n[groupId]; return n })
  }

  const doResetOne = async (groupId: string) => {
    const date = todayStr()
    await reflectionApi.resetReflectionRecord(date, groupId)
    const record = await reflectionApi.getRecord(date, groupId)
    if (record) {
      const students = await reflectionApi.getReflectionStudents(record.id, groupId)
      setRecordCache(prev => ({ ...prev, [groupId]: record }))
      setGroupStudents(prev => ({ ...prev, [groupId]: students }))
    }
    setGroupStates(prev => ({ ...prev, [groupId]: 'idle' }))
    setGroupCountdowns(prev => { const n = { ...prev }; delete n[groupId]; return n })
    setGroupSignInRemainings(prev => { const n = { ...prev }; delete n[groupId]; return n })
  }

  const handlePwSubmit = async () => {
    const pw = localStorage.getItem('duty_password') || 'admin'
    const { pwInput, forceEndTarget: fe, resetTarget: rt } = pwModalRef.current
    if (pwInput !== pw) {
      notify({ message: '密码错误', variant: 'error' })
      return
    }
    setReflectionPwInput('')
    if (fe) {
      setForceEndTarget(null)
      await doForceEnd(fe)
    } else if (rt) {
      setResetTarget(null)
      await doResetOne(rt)
    }
  }

  // ===== 生成倒数两组 =====
  const handleGenerateReflection = async () => {
    const groups = await queryAll<Group>('SELECT * FROM groups ORDER BY (total_score + COALESCE(tree_spent, 0)) ASC')
    setAllGroups(groups)
    if (groups.length === 0) { await notify('暂无小组数据'); return }
    const bottom2 = groups.slice(0, 2)
    const date = todayStr()
    let added = 0
    for (const g of bottom2) {
      if (addedGroupIds.includes(g.id)) continue
      const record = await reflectionApi.getOrCreateRecord(date, g.id, g.name)
      await reflectionApi.addReflectionGroup(record.id, g.id, g.name)
      added++
    }
    if (added === 0) { await notify('倒数两组已在列表中'); return }
    await loadReflection()
  }

  // ===== 轮询学生签到状态（检测 LAN 签到） =====
  useEffect(() => {
    const hasSigningIn = Object.values(groupStates).some(s => s === 'signing_in')
    if (!hasSigningIn) return

    const poll = setInterval(async () => {
      const date = todayStr()
      for (const [groupId, state] of Object.entries(statesRef.current)) {
        if (state !== 'signing_in') continue
        const record = recordCacheRef.current[groupId]
        if (!record) continue
        const students = await reflectionApi.getReflectionStudents(record.id, groupId)
        setGroupStudents(prev => ({ ...prev, [groupId]: students }))
        if (students.length > 0 && students.every(s => s.sign_in_time)) {
          await reflectionApi.deleteReflectionRecord(date, groupId)
          removeGroupFromUI(groupId)
        }
      }
    }, 3000)

    return () => clearInterval(poll)
  }, [groupStates, removeGroupFromUI])

  // ===== 罚抄管理 =====
  const loadPunishment = useCallback(async () => {
    const week = await copyPunishmentApi.getActiveWeek()
    if (!week) { setPunishmentStudents([]); setPunishmentWeekLabel(''); return }
    const students = await copyPunishmentApi.getWeekStudents(week.id)
    setPunishmentStudents(students)
    if (week.start_date && week.end_date) setPunishmentWeekLabel(`${week.start_date} ~ ${week.end_date}`)
    else if (week.start_date) setPunishmentWeekLabel(`开始于 ${week.start_date}`)
  }, [])

  const loadAllStudents = useCallback(async () => {
    const rows = await studentApi.getAllStudents()
    setAllStudents(rows)
  }, [])

  const loadPunishmentLog = useCallback(async () => {
    const rows = await copyPunishmentApi.getPunishmentLog(50)
    setPunishmentLog(rows)
  }, [])

  const handleGenerateList = async () => {
    if (!await confirm({ message: '确认生成新的罚抄名单？\n\n将取当前个人积分最低的前5名学生。\n旧名单将被归档。', variant: 'normal' })) return
    await copyPunishmentApi.generatePunishmentList(5)
    loadPunishment()
  }

  const handlePunishmentRemind = async () => {
    const names = await copyPunishmentApi.getUncompletedNames()
    if (names.length === 0) { await notify('当前没有未完成的学生'); return }
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `以下 ${names.length} 名学生还未完成罚抄，请督促：\n\n${names.join('、')}\n\n来办公室`,
          mode: 'fullscreen',
          duration: 30,
          urgency: '紧急',
        }),
      })
      const data = await res.json()
      if (data.success) await notify('提醒已发送到教室大屏')
      else await notify(`发送失败：${data.error || '未知错误'}`)
    } catch (err) {
      await notify('发送失败，请确认服务器正在运行')
    }
  }

  // 罚抄名单轮询（检测学生端签到）
  useEffect(() => {
    if (activeTab !== 'punishment' || punishmentStudents.length === 0) return
    const hasUncompleted = punishmentStudents.some(s => !s.completed)
    if (!hasUncompleted) return
    const poll = setInterval(() => loadPunishment(), 5000)
    return () => clearInterval(poll)
  }, [activeTab, punishmentStudents, loadPunishment])

  const handleAddPunishmentStudent = async (studentId: string, studentName: string) => {
    let week = await copyPunishmentApi.getActiveWeek()
    if (!week) {
      const result = await copyPunishmentApi.generatePunishmentList(0)
      week = { id: result.weekId, start_date: '', end_date: null, status: 'active', created_at: Date.now() }
    }
    await copyPunishmentApi.addPunishmentStudent(week.id, studentId, studentName)
    setShowPunishmentPicker(false)
    loadPunishment()
  }

  const handleMarkPunishmentCompleted = async (cpsId: string) => {
    await copyPunishmentApi.markCompleted(cpsId)
    loadPunishment()
  }

  // ===== 渲染 =====
  const stepOrder: WindowState[] = ['idle', 'counting_down', 'signing_in', 'finished']

  function renderGroupCard(groupId: string, idx: number) {
    const state = groupStates[groupId] || 'idle'
    const countdown = groupCountdowns[groupId] || 0
    const signInRemaining = groupSignInRemainings[groupId] || 0
    const students = groupStudents[groupId] || []
    const g = allGroups.find(x => x.id === groupId)
    const groupName = g?.name || recordCache[groupId]?.group_name || groupId
    const dur = getGroupDuration(groupId)
    const dotClass = DOT_COLORS[idx % DOT_COLORS.length]
    const signedCount = students.filter(s => s.sign_in_time).length

    return (
      <div key={groupId} className={`bg-white rounded-2xl shadow-sm border p-5 ${state === 'finished' ? 'opacity-60' : ''}`}>
        {/* 标题行 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${dotClass}`}>
              {idx + 1}
            </span>
            <span className="font-semibold text-stone-700">{groupName}</span>
            {!manuallyAddedRef.current.has(groupId) ? (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-semibold border border-amber-300">
                倒数
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded text-[10px] font-medium border border-stone-200">
                手动
              </span>
            )}
            {g && <span className="text-xs text-stone-400">总分 {g.total_score}</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs">
              <input
                type="number"
                defaultValue={dur}
                onChange={e => { localStorage.setItem('reflection_duration_' + groupId, e.target.value) }}
                className="w-14 px-2 py-1 bg-stone-50 rounded-lg text-xs outline-none border border-stone-200 text-center"
                min={1}
                disabled={state !== 'idle'}
              />
              <span className="text-stone-400">分钟</span>
            </div>
            {state === 'idle' && (
              <button
                onClick={() => handleDeleteGroup(groupId)}
                className="flex items-center gap-1 px-2 py-1 text-stone-300 hover:text-red-400 hover:bg-red-50 rounded-lg text-xs transition-colors"
                title="删除此小组"
              >
                <Trash2 size={13} />
              </button>
            )}
            {state === 'finished' && (
              <button
                onClick={() => { setResetTarget(groupId); setReflectionPwInput('') }}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs font-medium border border-red-200 hover:bg-red-100"
              >
                <RefreshCw size={11} /> 还原
              </button>
            )}
            {(state === 'counting_down' || state === 'signing_in') && (
              <button
                onClick={() => { setForceEndTarget(groupId); setReflectionPwInput('') }}
                className="px-2.5 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs font-medium border border-red-200 hover:bg-red-100"
              >
                强制结束
              </button>
            )}
          </div>
        </div>

        {/* 状态步骤条 */}
        <div className="flex items-center gap-1.5 mb-4">
          {stepOrder.map((s, i) => {
            const isActive = state === s
            const isPast = stepOrder.indexOf(state) > i
            return (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                  isActive ? 'bg-amber-500 text-white shadow-md' :
                  isPast ? 'bg-green-100 text-green-500' :
                  'bg-stone-100 text-stone-300'
                }`}>
                  {isPast ? <CheckCircle size={10} /> : i + 1}
                </div>
                {i < 3 && <div className={`w-3 h-0.5 ${isPast ? 'bg-green-200' : 'bg-stone-200'}`} />}
              </div>
            )
          })}
        </div>

        {/* idle */}
        {state === 'idle' && (
          <div>
            {students.length === 0 ? (
              <p className="text-xs text-stone-300 text-center py-3">小组暂无学生</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                {students.map(rs => (
                  <div key={rs.id} className="flex items-center justify-between px-2.5 py-1.5 bg-stone-50 rounded-lg text-xs">
                    <span className="font-medium text-stone-600 truncate">{rs.student_name}</span>
                    <button onClick={() => handleRemoveStudent(groupId, rs.id)} className="text-stone-300 hover:text-red-400 flex-shrink-0">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => handleStartGroup(groupId)}
              disabled={students.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-40 hover:bg-amber-600 w-full justify-center"
            >
              <Timer size={14} />
              开始小组团建
            </button>
          </div>
        )}

        {/* counting_down */}
        {state === 'counting_down' && (
          <div className="text-center">
            <p className={`text-4xl font-bold font-mono tracking-wider ${countdown <= 30 ? 'text-red-500 animate-pulse' : 'text-amber-500'}`}>
              {formatTime(countdown)}
            </p>
            <p className="text-xs text-stone-400 mt-1">{students.length} 名学生</p>
          </div>
        )}

        {/* signing_in */}
        {state === 'signing_in' && (
          <div>
            <div className="text-center mb-3">
              <p className={`text-3xl font-bold font-mono ${signInRemaining <= 15 ? 'text-red-500 animate-pulse' : 'text-amber-500'}`}>
                {formatTime(signInRemaining)}
              </p>
              <p className="text-xs text-stone-400">签到中 {signedCount}/{students.length}</p>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {students.map(rs => (
                <button
                  key={rs.id}
                  onClick={() => !rs.sign_in_time && handleReflectionSignIn(groupId, rs.id)}
                  disabled={!!rs.sign_in_time}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium text-center border transition-all ${
                    rs.sign_in_time
                      ? 'bg-green-50 border-green-300 text-green-700 cursor-default'
                      : 'bg-stone-50 border-stone-200 text-stone-600 hover:border-amber-300 hover:bg-amber-50 active:scale-95'
                  }`}
                >
                  {rs.sign_in_time ? <span className="flex items-center justify-center gap-1"><CheckCircle size={10} />{rs.student_name}</span> : rs.student_name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* finished */}
        {state === 'finished' && (
          <div className="text-center">
            <CheckCircle size={28} className="mx-auto mb-1 text-green-400" />
            <p className="text-sm font-semibold text-stone-600">已完成</p>
            <p className="text-xs text-stone-400">签到 {signedCount}/{students.length}</p>
            {students.filter(s => !s.sign_in_time).length > 0 && (
              <p className="text-xs text-red-400 mt-1">
                未签到：{students.filter(s => !s.sign_in_time).map(s => s.student_name).join('、')}
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto" style={PASTEL_BG}>
      <div className="p-8 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-stone-700 mb-6">课后管理</h1>

        {/* Tab 切换 */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab('duty')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'duty' ? 'bg-amber-500 text-white shadow-md' : 'bg-white text-stone-500 border border-stone-200 hover:border-amber-300'
            }`}
          >
            值日
          </button>
          <button
            onClick={() => setActiveTab('reflection')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'reflection' ? 'bg-amber-500 text-white shadow-md' : 'bg-white text-stone-500 border border-stone-200 hover:border-amber-300'
            }`}
          >
            小组团建
          </button>
          <button
            onClick={() => setActiveTab('punishment')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${
              activeTab === 'punishment' ? 'bg-amber-500 text-white shadow-md' : 'bg-white text-stone-500 border border-stone-200 hover:border-amber-300'
            }`}
          >
            罚抄管理
            {punishmentStudents.filter(s => !s.completed).length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {punishmentStudents.filter(s => !s.completed).length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('detention')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all relative ${
              activeTab === 'detention' ? 'bg-amber-500 text-white shadow-md' : 'bg-white text-stone-500 border border-stone-200 hover:border-amber-300'
            }`}
          >
            延时续费
            {detentionStudents.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {detentionStudents.length}
              </span>
            )}
          </button>
        </div>

        {/* ==================== 值日 ==================== */}
        {activeTab === 'duty' && <DutyPanel />}

        {/* ==================== 小组团建 ==================== */}
        {activeTab === 'reflection' && (
          <>
            {/* 顶部信息栏 */}
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200/60 p-4 mb-6 flex items-center gap-3">
              <button
                onClick={handleGenerateReflection}
                disabled={allGroups.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition-all disabled:opacity-40"
              >
                <Users size={14} />
                生成团建
              </button>
              <span className="text-xs text-stone-400">选取总分倒数两组</span>
              <div className="ml-auto">
                <button
                  onClick={() => setShowGroupPicker(true)}
                  disabled={allGroups.length === 0}
                  className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium border border-amber-200 hover:bg-amber-100 transition-all disabled:opacity-40"
                >
                  <Plus size={13} />
                  添加小组
                </button>
              </div>
            </div>

            {/* 小组卡片 */}
            {addedGroupIds.length > 0 ? (
              <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
                {addedGroupIds.map((gid, i) => renderGroupCard(gid, i))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-stone-200/60 p-8 text-center">
                <Users size={48} className="mx-auto mb-4 text-stone-200" />
                <p className="text-stone-400 mb-1">暂无团建小组</p>
                <p className="text-xs text-stone-300">点击"生成团建"选取倒数两组，或手动添加小组</p>
              </div>
            )}

          </>
        )}

        {/* ==================== 罚抄管理 ==================== */}
        {activeTab === 'punishment' && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200/60 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold text-stone-600">罚抄名单</h3>
                {punishmentWeekLabel && <p className="text-xs text-stone-400 mt-1">{punishmentWeekLabel}</p>}
              </div>
              <div className="flex gap-2">
                {punishmentStudents.some(s => !s.completed) && (
                  <button
                    onClick={handlePunishmentRemind}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-200 hover:bg-red-100 transition-all"
                  >
                    <Megaphone size={16} />
                    全屏提醒
                  </button>
                )}
                <button
                  onClick={() => { loadPunishmentLog(); setShowPunishmentLog(true) }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-stone-50 text-stone-500 rounded-xl text-sm font-medium border border-stone-200 hover:border-amber-300 hover:text-amber-600 transition-all"
                >
                  <History size={16} />
                  生成记录
                </button>
                <button
                  onClick={() => { loadAllStudents(); setShowPunishmentPicker(true) }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-stone-50 text-stone-500 rounded-xl text-sm font-medium border border-stone-200 hover:border-amber-300 hover:text-amber-600 transition-all"
                >
                  <UserPlus size={16} />
                  手动添加
                </button>
                <button
                  onClick={handleGenerateList}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 text-amber-700 rounded-xl text-sm font-medium border border-amber-200 hover:bg-amber-100 transition-all"
                >
                  <Copy size={16} />
                  生成名单
                </button>
              </div>
            </div>

            {punishmentStudents.length === 0 ? (
              <div className="text-center py-16 text-stone-300">
                <Copy size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-lg mb-2">暂未生成罚抄名单</p>
                <p className="text-sm">点击"生成名单"根据最近一次清零以来的扣分统计前5名学生</p>
              </div>
            ) : punishmentStudents.every(s => s.completed) ? (
              <div className="text-center py-16 text-stone-300">
                <CheckCircle size={48} className="mx-auto mb-4 text-green-300" />
                <p className="text-lg mb-2 text-green-500">全部抄完</p>
                <p className="text-sm">所有学生已通过浏览器确认完成</p>
              </div>
            ) : (
              <div className="space-y-2">
                {punishmentStudents.filter(s => !s.completed).map((cps, i) => (
                  <div key={cps.id} className="flex items-center gap-4 px-4 py-3 rounded-xl border bg-stone-50 border-stone-200">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      i < 3 ? 'bg-amber-500 text-white' : 'bg-stone-300 text-white'
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <span className="font-semibold text-stone-700">{cps.student_name}</span>
                      <span className="text-xs text-stone-400 ml-2">累计扣分：{cps.deduction_count}</span>
                    </div>
                    {isBrowser ? (
                      <button onClick={() => handleMarkPunishmentCompleted(cps.id)}
                        className="px-3 py-1 bg-amber-500 text-white text-xs rounded-lg font-medium hover:bg-amber-600 active:scale-95 transition-all">
                        确认已抄完
                      </button>
                    ) : (
                      <span className="text-xs text-stone-400">等待老师在浏览器端确认</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================== 延时续费 ==================== */}
        {activeTab === 'detention' && (
          <>
            {/* 延时续费时长设置 */}
            <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
              <div className="flex items-center gap-4 flex-wrap">
                <label className="text-sm text-stone-500">续费时长（分钟）</label>
                <div className="flex items-center gap-1">
                  <button onClick={() => { const v = Math.max(1, detentionDuration - 5); setDetentionDuration(v); detentionDurationRef.current = v; localStorage.setItem('detention_duration', String(v)) }} className="w-7 h-7 flex items-center justify-center border rounded hover:bg-stone-100 text-sm">−5</button>
                  <input type="number" min={1} max={120} value={detentionDuration}
                    onChange={e => { const v = Math.max(1, Math.min(120, parseInt(e.target.value) || 30)); setDetentionDuration(v); detentionDurationRef.current = v; localStorage.setItem('detention_duration', String(v)) }}
                    className="w-16 text-center border rounded-lg py-1 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                  <button onClick={() => { const v = Math.min(120, detentionDuration + 5); setDetentionDuration(v); detentionDurationRef.current = v; localStorage.setItem('detention_duration', String(v)) }} className="w-7 h-7 flex items-center justify-center border rounded hover:bg-stone-100 text-sm">+5</button>
                </div>
              </div>
            </div>

            {/* 延时续费名单 idle */}
            {detentionState === 'idle' && (
              <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-stone-700">延时续费名单 ({detentionStudents.length}人)</h3>
                  <button onClick={() => setShowDetentionPicker(true)} className="flex items-center gap-1 text-sm px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600">
                    <Plus size={14} /> 添加学生
                  </button>
                </div>
                {detentionStudents.length === 0 ? (
                  <p className="text-center text-stone-400 py-4 text-sm">暂无延时续费学生，点击上方按钮手动添加</p>
                ) : (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {detentionStudents.map(ds => (
                      <span key={ds.id} className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-sm px-2 py-1 rounded">
                        {ds.student_name}
                        <button onClick={() => handleDetentionRemoveStudent(ds.id, ds.student_name)} className="hover:text-red-500"><X size={14} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <button onClick={handleDetentionStart} disabled={detentionStudents.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 font-medium">
                  <Clock size={18} /> 开始延时续费（{detentionDuration}分钟）
                </button>
              </div>
            )}

            {/* 延时续费倒计时 */}
            {detentionState === 'counting_down' && (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-4 text-center">
                  <Clock size={48} className="mx-auto mb-2 text-amber-500" />
                  <div className={`text-5xl font-mono font-bold mb-2 ${detentionCountdown <= 30 ? 'text-red-500 animate-pulse' : 'text-amber-600'}`}>
                    {formatTime(detentionCountdown)}
                  </div>
                  <p className="text-amber-700 mb-4">延时续费进行中，倒计时结束后开启签到窗口</p>
                  <button onClick={() => { setDetentionPwInput(''); setDetentionPwError(false); setShowDetentionPwModal(true) }} className="flex items-center gap-1 px-4 py-2 text-sm bg-stone-400 text-white rounded-lg hover:bg-stone-500">
                    <Lock size={14} /> 重置延时续费（需密码）
                  </button>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <h3 className="font-semibold text-stone-700 mb-2">延时续费名单 ({detentionStudents.length}人)</h3>
                  <div className="flex flex-wrap gap-2">
                    {detentionStudents.map(ds => (
                      <span key={ds.id} className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-sm px-2 py-1 rounded">
                        {ds.student_name}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* 延时续费签到窗口 */}
            {detentionState === 'signing_in' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-amber-800 flex items-center gap-2">
                    <LogIn size={20} /> 延时续费签到 - 剩余 {formatTime(detentionSignInRemaining)}
                  </h3>
                </div>
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                  {detentionStudents.map(ds => (
                    <button key={ds.id}
                      onClick={() => !ds.sign_in_time && handleDetentionStudentSignIn(ds.id)}
                      disabled={!!ds.sign_in_time}
                      className={`p-3 rounded-lg text-center text-sm font-medium transition-colors ${
                        ds.sign_in_time ? 'bg-green-200 text-green-800 cursor-default' : 'bg-white text-stone-700 hover:bg-green-100 hover:text-green-700 border border-amber-200'
                      }`}>
                      {ds.sign_in_time ? (<span className="flex items-center justify-center gap-1"><Check size={14} /> {ds.student_name}</span>) : ds.student_name}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-amber-600 mt-3">
                  已签到：{detentionStudents.filter(d => d.sign_in_time).length}/{detentionStudents.length}
                </p>
                <div className="flex items-center justify-center mt-3">
                  <button onClick={() => { setDetentionPwInput(''); setDetentionPwError(false); setShowDetentionPwModal(true) }}
                    className="flex items-center gap-1 px-4 py-2 text-sm bg-stone-400 text-white rounded-lg hover:bg-stone-500">
                    <Lock size={14} /> 重置延时续费
                  </button>
                </div>
              </div>
            )}

            {/* 延时续费完成 */}
            {detentionState === 'finished' && (
              <div className="bg-stone-50 border rounded-xl p-6 mb-4">
                <div className="text-center mb-4">
                  <Check size={48} className="mx-auto mb-2 text-green-500" />
                  <h3 className="text-lg font-semibold text-stone-700 mb-1">延时续费流程已完成</h3>
                  <p className="text-stone-500 text-sm">
                    签到 {detentionStudents.filter(d => d.sign_in_time).length}/{detentionStudents.length} 人
                  </p>
                </div>
                {detentionStudents.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-sm font-medium text-green-700 mb-2">已签到（{detentionStudents.filter(d => d.sign_in_time).length}人）</p>
                      {detentionStudents.filter(d => d.sign_in_time).map(ds => (
                        <span key={ds.id} className="inline-block text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded mr-1 mb-1">{ds.student_name}</span>
                      ))}
                      {detentionStudents.filter(d => d.sign_in_time).length === 0 && <p className="text-xs text-green-400">无</p>}
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <p className="text-sm font-medium text-red-700 mb-2">未签到（{detentionStudents.filter(d => !d.sign_in_time).length}人）</p>
                      {detentionStudents.filter(d => !d.sign_in_time).map(ds => (
                        <span key={ds.id} className="inline-block text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded mr-1 mb-1">{ds.student_name}</span>
                      ))}
                      {detentionStudents.filter(d => !d.sign_in_time).length === 0 && <p className="text-xs text-red-400">无</p>}
                    </div>
                  </div>
                )}
                <button onClick={handleDetentionNextRound}
                  className="mt-4 w-full py-2.5 flex items-center justify-center gap-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium">
                  <Clock size={16} />
                  {detentionStudents.filter(d => !d.sign_in_time).length > 0
                    ? `下一轮续费（未签到 ${detentionStudents.filter(d => !d.sign_in_time).length} 人自动加入）`
                    : '开启下一轮续费'}
                </button>
                <button onClick={() => { setDetentionPwInput(''); setDetentionPwError(false); setShowDetentionPwModal(true) }}
                  className="mt-2 w-full py-2 text-sm flex items-center justify-center gap-1 border border-stone-300 text-stone-500 rounded-lg hover:bg-stone-50">
                  <Lock size={14} /> 重置延时续费（需密码）
                </button>
              </div>
            )}
          </>
        )}

        {/* 密码验证 Modal */}
        <Modal
          open={resetTarget !== null || forceEndTarget !== null}
          onClose={() => { setResetTarget(null); setForceEndTarget(null) }}
          title="验证密码"
        >
          <div className="space-y-4">
            <p className="text-sm text-stone-500">
              {forceEndTarget
                ? `强制结束"${allGroups.find(g => g.id === forceEndTarget)?.name || forceEndTarget}"的小组团建`
                : `还原"${allGroups.find(g => g.id === resetTarget)?.name || resetTarget}"的小组团建状态`}
            </p>
            <input
              type="password"
              value={reflectionPwInput}
              onChange={e => setReflectionPwInput(e.target.value)}
              placeholder="输入管理密码"
              className="w-full px-4 py-3 bg-stone-50 rounded-xl text-base outline-none border border-stone-200"
              onKeyDown={e => { if (e.key === 'Enter') handlePwSubmit() }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setResetTarget(null); setForceEndTarget(null) }}
                className="px-4 py-2 text-sm font-medium text-stone-500 bg-stone-100 hover:bg-stone-200 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handlePwSubmit}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg"
              >
                确认
              </button>
            </div>
          </div>
        </Modal>

        {/* 添加小组 Modal */}
        <Modal open={showGroupPicker} onClose={() => setShowGroupPicker(false)} title="选择要添加的小组">
          <div className="space-y-2 max-h-64 overflow-auto">
            {allGroups.filter(g => !addedGroupIds.includes(g.id)).length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-4">所有小组已添加</p>
            ) : (
              allGroups.filter(g => !addedGroupIds.includes(g.id)).map(g => (
                <button
                  key={g.id}
                  onClick={() => handleAddGroup(g)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-amber-50 transition-all text-left border border-stone-100 hover:border-amber-200"
                >
                  <span className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-500">
                    {g.name.charAt(0)}
                  </span>
                  <div>
                    <span className="font-medium text-stone-600">{g.name}</span>
                    <span className="text-xs text-stone-400 ml-2">总分 {g.total_score}</span>
                  </div>
                  {g.leader_name && <span className="text-xs text-stone-300 ml-auto">组长：{g.leader_name}</span>}
                </button>
              ))
            )}
          </div>
        </Modal>

        {/* 手动添加学生 Modal（罚抄） */}
        <StudentPickerModal
          open={showPunishmentPicker}
          onClose={() => setShowPunishmentPicker(false)}
          title="添加罚抄学生"
          students={allStudents}
          excludeIds={punishmentStudents.map(ps => ps.student_id)}
          onSelect={handleAddPunishmentStudent}
        />

        {/* 罚抄名单生成记录 Modal */}
        <Modal open={showPunishmentLog} onClose={() => setShowPunishmentLog(false)} title="罚抄名单记录">
          <div className="space-y-2 max-h-96 overflow-auto">
            {punishmentLog.length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-8">暂无记录</p>
            ) : (
              punishmentLog.map(log => {
                const d = new Date(log.created_at)
                const time = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                const actionLabel = log.action === 'generate' ? '生成名单' : log.action === 'add' ? '手动添加' : '移除'
                const actionColor = log.action === 'generate' ? 'bg-amber-100 text-amber-700'
                  : log.action === 'add' ? 'bg-sky-100 text-sky-700' : 'bg-red-100 text-red-600'
                const desc = log.action === 'generate'
                  ? ((log.count ?? 0) > 0
                      ? `取积分最低 ${log.count} 人${log.detail ? '：' + log.detail : ''}`
                      : (log.detail || '生成空名单'))
                  : (log.student_name || '')
                return (
                  <div key={log.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-stone-100 bg-stone-50">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold flex-shrink-0 ${actionColor}`}>{actionLabel}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-stone-600 break-words">{desc}</p>
                      <p className="text-[11px] text-stone-400 mt-0.5">{time} · {log.source || '浏览器/未知设备'}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </Modal>

        {/* 延时续费密码验证 Modal */}
        <Modal
          open={showDetentionPwModal}
          onClose={() => { setShowDetentionPwModal(false); setDetentionPwInput(''); setDetentionPwError(false) }}
          title="验证密码"
        >
          <div className="space-y-4">
            <p className="text-sm text-stone-500">请输入管理员密码以重置延时续费，将删除本次记录并还原已扣积分</p>
            <input
              type="password"
              value={detentionPwInput}
              onChange={e => { setDetentionPwInput(e.target.value); setDetentionPwError(false) }}
              placeholder="输入管理密码"
              className={`w-full px-4 py-3 bg-stone-50 rounded-xl text-base outline-none border ${detentionPwError ? 'border-red-400' : 'border-stone-200'}`}
              onKeyDown={e => { if (e.key === 'Enter') handleDetentionPwSubmit() }}
            />
            {detentionPwError && <p className="text-xs text-red-500">密码错误，请重试</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowDetentionPwModal(false); setDetentionPwInput(''); setDetentionPwError(false) }}
                className="px-4 py-2 text-sm font-medium text-stone-500 bg-stone-100 hover:bg-stone-200 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleDetentionPwSubmit}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg"
              >
                确认重置延时续费
              </button>
            </div>
          </div>
        </Modal>

        {/* 延时续费学生选择 Modal */}
        <StudentPickerModal
          open={showDetentionPicker}
          onClose={() => setShowDetentionPicker(false)}
          title="添加延时续费学生"
          students={detentionAllStudents}
          excludeIds={detentionStudents.map(d => d.student_id)}
          onSelect={handleDetentionAddStudent}
        />
      </div>
    </div>
  )
}
