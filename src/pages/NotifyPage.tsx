import { useState, useEffect, useCallback } from 'react'
import { Megaphone, Send, Loader2, Image as ImageIcon, X, Trash2, Clock, CheckCheck, Users } from 'lucide-react'
import { saveNotification, getRecentNotifications, deleteNotification, getNotificationReads, type NotificationRecord, type Urgency, type ConfirmMode } from '../lib/notification-history'
import * as studentApi from '@/lib/students'

export default function NotifyPage() {
  const [notifyMessage, setNotifyMessage] = useState('')
  const [notifyMode, setNotifyMode] = useState<'fullscreen' | 'top'>('fullscreen')
  const [notifyUrgency, setNotifyUrgency] = useState<Urgency>('普通')
  const [notifyDuration, setNotifyDuration] = useState(30)
  const [notifyPermanent, setNotifyPermanent] = useState(false)
  const [notifyImages, setNotifyImages] = useState<string[]>([])
  const [notifySending, setNotifySending] = useState(false)
  const [notifyResult, setNotifyResult] = useState<{ success: boolean; message: string } | null>(null)
  const [notifyHistory, setNotifyHistory] = useState<NotificationRecord[]>([])
  const [readStatuses, setReadStatuses] = useState<Record<string, string[]>>({})

  // 确认模式
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>('none')
  const [confirmStudents, setConfirmStudents] = useState<string[]>([])
  const [allStudents, setAllStudents] = useState<{ id: string; name: string }[]>([])

  const loadNotifyHistory = useCallback(async () => {
    try {
      const records = await getRecentNotifications(100)
      setNotifyHistory(records)
      // 加载确认状态
      const statuses: Record<string, string[]> = {}
      for (const r of records) {
        if (r.confirm_mode !== 'none') {
          const reads = await getNotificationReads(r.id)
          statuses[r.id] = reads.map(r => r.student_name)
        }
      }
      setReadStatuses(statuses)
    } catch (err) {
      console.error('加载通知历史失败:', err)
    }
  }, [])

  useEffect(() => {
    loadNotifyHistory()
    studentApi.getAllStudents().then(list =>
      setAllStudents(list.map(s => ({ id: s.id, name: s.name })))
    )
  }, [loadNotifyHistory])

  const toggleStudent = (name: string) => {
    setConfirmStudents(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  const handleSend = useCallback(async () => {
    if (!notifyMessage.trim()) return
    setNotifySending(true)
    setNotifyResult(null)
    const effectiveDuration = notifyPermanent ? 0 : notifyDuration
    try {
      const body: Record<string, unknown> = {
        message: notifyMessage.trim(),
        mode: notifyMode,
        duration: effectiveDuration,
        urgency: notifyUrgency,
        confirmMode,
      }
      if (confirmMode === 'specific') body.confirmStudents = confirmStudents
      if (notifyImages.length > 0) body.images = notifyImages

      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setNotifyResult({ success: true, message: '通知已发送' })
        // 若服务器已保存（返回了 notificationId），则跳过客户端保存避免重复
        if (!data.notificationId) {
          await saveNotification(notifyMessage.trim(), notifyMode, effectiveDuration, notifyImages, notifyUrgency, confirmMode, confirmStudents)
        }
        loadNotifyHistory()
        setNotifyMessage('')
        setNotifyImages([])
        setNotifyUrgency('普通')
        setConfirmMode('none')
        setConfirmStudents([])
        setNotifyPermanent(false)
      } else {
        setNotifyResult({ success: false, message: data.error || '发送失败' })
      }
    } catch (err) {
      setNotifyResult({ success: false, message: err instanceof Error ? err.message : '网络错误' })
    } finally {
      setNotifySending(false)
      setTimeout(() => setNotifyResult(null), 4000)
    }
  }, [notifyMessage, notifyMode, notifyDuration, notifyImages, notifyUrgency, notifyPermanent, confirmMode, confirmStudents, loadNotifyHistory])

  const handleApplyHistory = async (record: NotificationRecord) => {
    setNotifyMessage(record.message)
    setNotifyMode(record.mode)
    setNotifyDuration(record.duration || 30)
    setNotifyPermanent(record.duration === 0)
    // 历史记录中的大图也做一次压缩
    const images = record.images || []
    const resized = await Promise.all(images.map(img => resizeImage(img)))
    setNotifyImages(resized)
    setNotifyUrgency(record.urgency || '普通')
    setConfirmMode(record.confirm_mode || 'none')
    setConfirmStudents(record.confirm_students || [])
  }

  const handleDeleteHistory = async (id: string) => {
    await deleteNotification(id)
    setNotifyHistory(prev => prev.filter(r => r.id !== id))
  }

  const resizeImage = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const MAX = 600
        let { width, height } = img
        if (width <= MAX && height <= MAX) { resolve(dataUrl); return }
        if (width > height) { height = Math.round(height * MAX / width); width = MAX }
        else { width = Math.round(width * MAX / height); height = MAX }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    })
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        if (notifyImages.length >= 4) break
        const file = items[i].getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = async () => {
          const resized = await resizeImage(reader.result as string)
          setNotifyImages(prev => [...prev, resized])
        }
        reader.readAsDataURL(file)
      }
    }
  }

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const remaining = 4 - notifyImages.length
    files.slice(0, remaining).forEach(file => {
      const reader = new FileReader()
      reader.onload = async () => {
        const resized = await resizeImage(reader.result as string)
        setNotifyImages(prev => [...prev, resized])
      }
      reader.readAsDataURL(file)
    })
  }

  const getConfirmLabel = (mode: ConfirmMode) => {
    switch (mode) {
      case 'none': return '';
      case 'any': return '需要确认';
      case 'specific': return '指定学生确认';
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Megaphone size={28} className="text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold text-stone-800">班级通知</h1>
            <p className="text-sm text-stone-500">向教室电脑桌面发送弹窗通知</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6" onPaste={handlePaste}>
          <div className="space-y-4">
            {/* 内容 */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">通知内容</label>
              <textarea
                value={notifyMessage}
                onChange={e => setNotifyMessage(e.target.value)}
                placeholder="请输入要发送的通知内容..."
                rows={4}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                maxLength={200}
              />
              <p className="text-xs text-stone-400 mt-1">{notifyMessage.length}/200</p>
            </div>

            {/* 显示方式 */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">显示方式</label>
              <div className="flex gap-3">
                {[
                  { key: 'fullscreen' as const, label: '全屏显示', desc: '覆盖整个屏幕，适合重要通知', emoji: '🖥️' },
                  { key: 'top' as const, label: '顶部通知', desc: '屏幕上方1/3区域，轻度提醒', emoji: '📋' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setNotifyMode(opt.key)}
                    className={`flex-1 p-3 rounded-xl border-2 text-left transition-all ${
                      notifyMode === opt.key
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="text-lg mb-0.5">{opt.emoji}</div>
                    <div className="text-sm font-medium text-stone-700">{opt.label}</div>
                    <div className="text-xs text-stone-400 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 紧急程度 */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">紧急程度</label>
              <div className="flex gap-2">
                {([
                  { key: '普通' as const, label: '普通', emoji: '⚪', color: 'gray' },
                  { key: '重要' as const, label: '重要', emoji: '🟠', color: 'orange' },
                  { key: '紧急' as const, label: '紧急', emoji: '🔴', color: 'red' },
                ]).map(u => (
                  <button
                    key={u.key}
                    type="button"
                    onClick={() => setNotifyUrgency(u.key)}
                    className={`flex-1 p-2.5 rounded-xl border-2 text-center transition-all ${
                      notifyUrgency === u.key
                        ? u.color === 'red' ? 'border-red-400 bg-red-50' : u.color === 'orange' ? 'border-orange-400 bg-orange-50' : 'border-stone-400 bg-stone-50'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="text-base">{u.emoji}</div>
                    <div className={`text-xs font-medium mt-0.5 ${
                      u.color === 'red' ? 'text-red-600' : u.color === 'orange' ? 'text-orange-600' : 'text-stone-600'
                    }`}>{u.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 停留时长 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-stone-700">
                  停留时长：<span className="text-amber-600 font-bold">{notifyPermanent ? '长期' : `${notifyDuration} 秒`}</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyPermanent}
                    onChange={e => setNotifyPermanent(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-amber-500"
                  />
                  <span className="text-xs text-stone-500">长期显示（手动关闭）</span>
                </label>
              </div>
              {!notifyPermanent && (
                <>
                  <input
                    type="range"
                    min={5} max={120} step={5}
                    value={notifyDuration}
                    onChange={e => setNotifyDuration(parseInt(e.target.value))}
                    className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <div className="flex justify-between text-xs text-stone-400 mt-0.5">
                    <span>5秒</span><span>30秒</span><span>60秒</span><span>120秒</span>
                  </div>
                </>
              )}
            </div>

            {/* 图片 */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                图片（可选 · 最多4张）
                {notifyImages.length > 0 && <span className="text-stone-400 font-normal ml-1">({notifyImages.length}/4)</span>}
              </label>
              {notifyImages.length > 0 && (
                <div className="flex gap-2 flex-wrap mb-2">
                  {notifyImages.map((img, i) => (
                    <div key={i} className="relative inline-block">
                      <img src={img} alt={`图${i + 1}`} className="h-20 rounded-lg border" />
                      <button
                        onClick={() => setNotifyImages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {notifyImages.length < 4 && (
                <div className="flex gap-2">
                  <label className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm text-stone-500 hover:bg-stone-50 cursor-pointer">
                    <ImageIcon size={14} />
                    选择图片
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleFilePick} />
                  </label>
                  <span className="text-xs text-stone-400 self-center">或直接粘贴图片（Ctrl+V）</span>
                </div>
              )}
            </div>

            {/* 确认方式 */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">学生确认方式</label>
              <div className="flex gap-2">
                {([
                  { key: 'none' as const, label: '不需要', desc: '仅推送通知' },
                  { key: 'any' as const, label: '谁确认都行', desc: '统计确认人数' },
                  { key: 'specific' as const, label: '指定学生', desc: '跟踪具体名单' },
                ]).map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setConfirmMode(opt.key)}
                    className={`flex-1 p-2.5 rounded-xl border-2 text-center transition-all ${
                      confirmMode === opt.key
                        ? 'border-primary-400 bg-primary-50'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="text-sm font-medium text-stone-700">{opt.label}</div>
                    <div className="text-xs text-stone-400 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>

              {/* 指定学生选择 */}
              {confirmMode === 'specific' && (
                <div className="mt-3 p-3 bg-stone-50 rounded-lg">
                  <p className="text-xs text-stone-500 mb-2">
                    已选 {confirmStudents.length} 人
                    {confirmStudents.length > 0 && (
                      <span className="ml-2 text-primary-600">{confirmStudents.join('、')}</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {allStudents.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleStudent(s.name)}
                        className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                          confirmStudents.includes(s.name)
                            ? 'bg-primary-500 text-white border-primary-500'
                            : 'bg-white text-stone-500 border-stone-200 hover:border-primary-300'
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 发送按钮 */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleSend}
                disabled={notifySending || !notifyMessage.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm font-medium transition-colors"
              >
                {notifySending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {notifySending ? '发送中...' : '发送通知'}
              </button>
              {notifyResult && (
                <span className={`text-sm font-medium ${notifyResult.success ? 'text-green-600' : 'text-red-500'}`}>
                  {notifyResult.message}
                </span>
              )}
            </div>

            {notifyResult?.success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
                通知已成功发送到教室电脑。
              </div>
            )}
            {notifyResult && !notifyResult.success && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {notifyResult.message}
              </div>
            )}
          </div>

          {/* 历史记录 */}
          {notifyHistory.length > 0 && (
            <div className="border-t pt-4 mt-6">
              <h4 className="text-sm font-medium text-stone-600 mb-2 flex items-center gap-1.5">
                <Clock size={14} /> 最近发送记录
              </h4>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {notifyHistory.map(record => {
                  const reads = readStatuses[record.id] || []
                  return (
                    <div
                      key={record.id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-stone-50 border border-transparent hover:border-stone-200 cursor-pointer group transition-colors"
                      onClick={() => handleApplyHistory(record)}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${record.mode === 'fullscreen' ? 'bg-purple-400' : 'bg-amber-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-stone-700 truncate">{record.message}</div>
                        {record.confirm_mode !== 'none' && (
                          <div className="mt-1">
                            {record.confirm_mode === 'specific' ? (
                              <div className="flex flex-wrap gap-1">
                                {record.confirm_students.map(name => {
                                  const ok = reads.includes(name)
                                  return (
                                    <span key={name} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium ${
                                      ok ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-400'
                                    }`}>
                                      {ok ? <CheckCheck size={10} /> : <Clock size={10} />}
                                      {name}
                                    </span>
                                  )
                                })}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <CheckCheck size={10} className={reads.length > 0 ? 'text-green-500' : 'text-stone-300'} />
                                <span className="text-[11px] text-stone-500">{reads.length > 0 ? `${reads.length} 人已确认` : '暂无确认'}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {record.images && record.images.length > 0 && (
                        <div className="flex gap-0.5 flex-shrink-0">
                          {record.images.slice(0, 3).map((img, i) => (
                            <img key={i} src={img} className="w-7 h-7 rounded object-cover" alt="" />
                          ))}
                          {record.images.length > 3 && <span className="text-[10px] text-stone-400 self-center">+{record.images.length - 3}</span>}
                        </div>
                      )}
                      <span className="text-[10px] text-stone-400 flex-shrink-0">
                        {record.urgency === '紧急' ? '🔴' : record.urgency === '重要' ? '🟠' : ''} {record.mode === 'fullscreen' ? '全屏' : '顶部'} · {record.duration === 0 ? '长期' : `${record.duration}s`}
                      </span>
                      <span className="text-[10px] text-stone-400 flex-shrink-0">{getConfirmLabel(record.confirm_mode)}</span>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteHistory(record.id) }}
                        className="p-1 rounded hover:bg-red-100 text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 使用说明 */}
          <div className="border-t pt-4 mt-6">
            <h4 className="text-sm font-medium text-stone-600 mb-2">使用说明</h4>
            <ul className="text-sm text-stone-500 space-y-1.5 list-disc list-inside">
              <li>全屏显示：覆盖整个桌面，适合重要通知</li>
              <li>顶部通知：屏幕上方1/3区域，轻度提醒</li>
              <li>重要通知为橙色背景，紧急通知为红色背景 + 脉冲动画</li>
              <li>支持发送多张图片（最多4张），粘贴或选择均可</li>
              <li>需要确认：学生通过 LAN 网页选择姓名后点击"已收到"</li>
              <li>指定学生：只有被选中的学生才可确认，教师可查看具体完成名单</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
