import { useState } from 'react'
import { Upload, CheckCircle, AlertTriangle, Database, Trash2, Shield, Loader2 } from 'lucide-react'
import { executeTransaction, executeRun } from '@/lib/db'
import { v4 as uuid } from 'uuid'

interface ImportResult {
  groups: number
  students: number
  dailyStatuses: number
  deductionRecords: number
  manualAdjustRecords: number
  dutyRecords: number
  coinGroups: number
  lunchRestRecords: number
  dailyPracticeRecords: number
  practiceSignins: number
  attendanceRecords: number
  homeworkRecords: number
  errors: string[]
}

async function clearAllData(): Promise<void> {
  const tables = [
    'coin_history', 'coin_groups',
    'duty_students', 'duty_records',
    'practice_score_awards', 'practice_signins',
    'math_homework_grades',
    'homework_records', 'homework_submissions', 'homework_daily', 'homework',
    'daily_practice_records', 'lunch_rest_records',
    'attendance_window_records', 'attendance_windows', 'attendance_records',
    'manual_adjust_records', 'deduction_records',
    'group_score_history', 'score_snapshots', 'score_category_settings',
    'daily_statuses', 'students', 'groups',
  ]
  for (const table of tables) {
    await executeRun(`DELETE FROM ${table}`)
  }
}

export default function DataImportPage() {
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState<Record<string, number> | null>(null)
  const [pendingData, setPendingData] = useState<Record<string, unknown> | null>(null)
  const [clearFirst, setClearFirst] = useState(true)

  const handleFileSelect = async () => {
    try {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return

        setImporting(true)
        setResult(null)
        try {
          const text = await file.text()
          const data = JSON.parse(text)

          const preview_data: Record<string, number> = {}
          if (data.version === 4 || data.version === 3) {
            // 桌面版备份格式预览
            if (Array.isArray(data.groups)) preview_data['小组'] = data.groups.length
            if (Array.isArray(data.students)) {
              preview_data['学生'] = data.students.length
              // 已排座学生数
              const seated = (data.students as any[]).filter((s: any) => (s.seat_order ?? -1) >= 0).length
              if (seated > 0) preview_data['已排座位'] = seated
            }
            if (data.version === 3) {
              if (Array.isArray(data.daily_statuses)) preview_data['每日状态'] = data.daily_statuses.length
              if (Array.isArray(data.deduction_records)) preview_data['扣分记录'] = data.deduction_records.length
              if (Array.isArray(data.manual_adjust_records)) preview_data['手动调整'] = data.manual_adjust_records.length
              if (Array.isArray(data.duty_records)) preview_data['值日记录'] = data.duty_records.length
              if (Array.isArray(data.coin_groups)) preview_data['宝龙币'] = data.coin_groups.length
              if (Array.isArray(data.lunch_rest_records)) preview_data['午餐午休'] = data.lunch_rest_records.length
              if (Array.isArray(data.daily_practice_records)) preview_data['每日一练'] = data.daily_practice_records.length
              if (Array.isArray(data.practice_signins)) preview_data['每日一练签到'] = data.practice_signins.length
              if (Array.isArray(data.attendance_records)) preview_data['考勤记录'] = data.attendance_records.length
              if (Array.isArray(data.homework_records)) preview_data['作业记录'] = data.homework_records.length
              if (Array.isArray(data.group_score_history)) preview_data['积分历史'] = data.group_score_history.length
              if (Array.isArray(data.score_snapshots)) preview_data['积分快照'] = data.score_snapshots.length
            }
          } else {
            // 旧格式（Web 版）预览
            if (Array.isArray(data.groups_v2)) preview_data['小组'] = data.groups_v2.length
            if (Array.isArray(data.individual_students)) preview_data['学生'] = data.individual_students.length
            if (Array.isArray(data.individual_daily_statuses)) preview_data['每日状态'] = data.individual_daily_statuses.length
            if (Array.isArray(data.individual_deduction_records)) preview_data['扣分记录'] = data.individual_deduction_records.length
            if (Array.isArray(data.individual_manual_adjust_records)) preview_data['手动调整'] = data.individual_manual_adjust_records.length
            if (Array.isArray(data.duty_records)) preview_data['值日记录'] = data.duty_records.length
            if (Array.isArray(data.coinGroups)) preview_data['宝龙币'] = data.coinGroups.length
          }
          setPreview(preview_data)
          setPendingData(data)
        } catch (err) {
          setResult({
            groups: 0, students: 0, dailyStatuses: 0,
            deductionRecords: 0, manualAdjustRecords: 0,
            dutyRecords: 0, coinGroups: 0,
            lunchRestRecords: 0, dailyPracticeRecords: 0, practiceSignins: 0,
            attendanceRecords: 0, homeworkRecords: 0,
            errors: [err instanceof Error ? err.message : '文件格式错误'],
          })
        }
        setImporting(false)
      }
      input.click()
    } catch {
      setImporting(false)
    }
  }

  const handleConfirmImport = async () => {
    if (!pendingData) return
    setImporting(true)
    setPreview(null)
    try {
      if (clearFirst) {
        await clearAllData()
      }
      const r = await importData(pendingData)
      setResult(r)
    } catch (err) {
      setResult({
        groups: 0, students: 0, dailyStatuses: 0,
        deductionRecords: 0, manualAdjustRecords: 0,
        dutyRecords: 0, coinGroups: 0,
        lunchRestRecords: 0, dailyPracticeRecords: 0, practiceSignins: 0,
        attendanceRecords: 0, homeworkRecords: 0,
        errors: [err instanceof Error ? err.message : '导入失败'],
      })
    }
    setImporting(false)
    setPendingData(null)
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-stone-800 mb-2">数据导入</h1>
        <p className="text-sm text-stone-500 mb-6">
          从 Web 版班级管理系统或桌面版导出的 JSON 文件，将数据迁移到桌面版
        </p>

        {/* 导入按钮 */}
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center mb-6">
          <Upload size={48} className="mx-auto mb-3 text-primary-400" />
          <p className="text-stone-600 mb-4">选择 JSON 备份文件</p>
          <button
            onClick={handleFileSelect}
            disabled={importing}
            className="px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 font-medium"
          >
            {importing ? '导入中...' : '选择文件并导入'}
          </button>
          <p className="text-xs text-stone-400 mt-2">
            支持桌面版 v3 全量备份格式和 Web 版 localStorage 格式
          </p>
        </div>

        {/* 预览 + 确认导入 */}
        {preview && !result && pendingData && (
          <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
            <h3 className="font-medium text-stone-800 mb-3 flex items-center gap-2">
              <Database size={18} className="text-blue-500" /> 数据预览
            </h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {Object.entries(preview).map(([key, count]) => (
                <div key={key} className="text-sm text-stone-600 bg-stone-50 rounded-lg px-3 py-2">
                  {key}：<span className="font-semibold text-stone-800">{count}</span> 条
                </div>
              ))}
            </div>

            {/* 清空选项 */}
            <label className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={clearFirst}
                onChange={e => setClearFirst(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-red-300 text-red-500 focus:ring-red-400"
              />
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-red-700">
                  <Shield size={14} /> 清空所有旧数据再导入（推荐）
                </div>
                <p className="text-xs text-red-500 mt-0.5">
                  先删除数据库中所有小组、学生、积分、考勤等数据，再导入文件中的内容。确保数据不会重复或冲突。
                </p>
              </div>
            </label>

            {!clearFirst && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700 mb-4">
                将保留现有数据，文件中有相同 ID 的记录会被覆盖，不同 ID 的会新增。
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleConfirmImport}
                disabled={importing}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium text-sm transition-colors disabled:opacity-50 ${
                  clearFirst ? 'bg-red-500 hover:bg-red-600' : 'bg-primary-500 hover:bg-primary-600'
                }`}
              >
                {importing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : clearFirst ? (
                  <Trash2 size={16} />
                ) : (
                  <Upload size={16} />
                )}
                {importing ? '导入中...' : clearFirst ? '清空旧数据并导入' : '合并导入'}
              </button>
              <button
                onClick={() => { setPreview(null); setPendingData(null) }}
                className="px-4 py-2.5 border rounded-lg text-stone-600 hover:bg-stone-50 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 导入结果 */}
        {result && (
          <div className={`border rounded-xl p-6 ${result.errors.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
            <div className="flex items-center gap-2 mb-4">
              {result.errors.length > 0 ? (
                <AlertTriangle size={24} className="text-yellow-500" />
              ) : (
                <CheckCircle size={24} className="text-green-500" />
              )}
              <h3 className="text-lg font-semibold">
                {result.errors.length > 0 ? '导入完成（有警告）' : '导入成功'}
              </h3>
            </div>

            <div className="space-y-1 mb-4">
              {result.groups > 0 && <p className="text-sm">小组：{result.groups} 个</p>}
              {result.students > 0 && <p className="text-sm">学生：{result.students} 个</p>}
              {result.dailyStatuses > 0 && <p className="text-sm">每日状态：{result.dailyStatuses} 条</p>}
              {result.deductionRecords > 0 && <p className="text-sm">扣分记录：{result.deductionRecords} 条</p>}
              {result.manualAdjustRecords > 0 && <p className="text-sm">手动调整：{result.manualAdjustRecords} 条</p>}
              {result.dutyRecords > 0 && <p className="text-sm">值日记录：{result.dutyRecords} 个</p>}
              {result.coinGroups > 0 && <p className="text-sm">宝龙币小组：{result.coinGroups} 个</p>}
              {result.lunchRestRecords > 0 && <p className="text-sm">午餐午休记录：{result.lunchRestRecords} 条</p>}
              {result.dailyPracticeRecords > 0 && <p className="text-sm">每日一练记录：{result.dailyPracticeRecords} 条</p>}
              {result.practiceSignins > 0 && <p className="text-sm">每日一练签到：{result.practiceSignins} 条</p>}
              {result.attendanceRecords > 0 && <p className="text-sm">考勤记录：{result.attendanceRecords} 条</p>}
              {result.homeworkRecords > 0 && <p className="text-sm">作业记录：{result.homeworkRecords} 条</p>}
              {Object.values(result).every(v => typeof v === 'number' && v === 0) && !result.errors.length && (
                <p className="text-sm text-stone-400">未识别到有效数据</p>
              )}
            </div>

            {result.errors.length > 0 && (
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-sm font-medium text-red-700 mb-1">错误：</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-sm text-red-600">{e}</p>
                ))}
              </div>
            )}

            <button
              onClick={() => { setResult(null); setPreview(null) }}
              className="mt-4 px-4 py-2 border rounded-lg text-stone-600 hover:bg-stone-50 text-sm"
            >
              导入更多
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// 辅助：简单表导入
function importSimpleTable(
  data: Record<string, unknown>, key: string, table: string, cols: string[]
): { sql: string; params: unknown[] }[] {
  const records = data[key]
  if (!Array.isArray(records)) return []
  return (records as Record<string, unknown>[]).map(r => ({
    sql: `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params: cols.map(c => (r[c] !== undefined ? r[c] : c === 'remark' ? '' : null)),
  }))
}

// 导入逻辑
async function importData(data: Record<string, unknown>): Promise<ImportResult> {
  const result: ImportResult = {
    groups: 0, students: 0, dailyStatuses: 0,
    deductionRecords: 0, manualAdjustRecords: 0,
    dutyRecords: 0, coinGroups: 0,
    lunchRestRecords: 0, dailyPracticeRecords: 0, practiceSignins: 0,
    attendanceRecords: 0, homeworkRecords: 0,
    errors: [],
  }
  const now = Date.now()

  try {
    // ============ Version 4: 精简备份格式（小组+学生核心信息） ============
    if (data.version === 4) {
      // 小组：INSERT OR IGNORE + UPDATE，合并导入时不丢失积分等数据
      if (Array.isArray(data.groups)) {
        const ops: { sql: string; params: unknown[] }[] = []
        for (const g of (data.groups as Record<string, unknown>[])) {
          ops.push({
            sql: `INSERT OR IGNORE INTO groups (id, name, leader_name, color, sort_order, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            params: [g.id, g.name, g.leader_name || '', g.color || 'bg-blue-500', g.sort_order ?? 0, now, now],
          })
          ops.push({
            sql: `UPDATE groups SET name = ?, leader_name = ?, color = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
            params: [g.name, g.leader_name || '', g.color || 'bg-blue-500', g.sort_order ?? 0, now, g.id],
          })
        }
        if (ops.length > 0) { await executeTransaction(ops); result.groups = (data.groups as any[]).length }
      }

      // 学生：INSERT OR IGNORE + UPDATE，合并导入时不丢失 manual_offset 等数据
      if (Array.isArray(data.students)) {
        const ops: { sql: string; params: unknown[] }[] = []
        for (const s of (data.students as Record<string, unknown>[])) {
          ops.push({
            sql: `INSERT OR IGNORE INTO students (id, name, group_id, practice_label, lunch_label, lunch_longterm, seat_order, sort_order, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [s.id, s.name, s.group_id || '', s.practice_label || '', s.lunch_label || '',
              s.lunch_longterm ? 1 : 0, s.seat_order ?? -1, s.sort_order ?? 0, now, now],
          })
          ops.push({
            sql: `UPDATE students SET name = ?, group_id = ?, practice_label = ?, lunch_label = ?, lunch_longterm = ?, seat_order = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
            params: [s.name, s.group_id || '', s.practice_label || '', s.lunch_label || '',
              s.lunch_longterm ? 1 : 0, s.seat_order ?? -1, s.sort_order ?? 0, now, s.id],
          })
        }
        if (ops.length > 0) { await executeTransaction(ops); result.students = (data.students as any[]).length }
      }

      return result
    }

    // ============ Version 3: 全量备份格式 ============
    if (data.version === 3) {
      // 小组
      if (Array.isArray(data.groups)) {
        const ops = (data.groups as Record<string, unknown>[]).map(g => ({
          sql: `INSERT OR REPLACE INTO groups (id, name, study_score, total_score, snapshot_diff, color, icon, leader_name, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [g.id, g.name, Number(g.study_score ?? 0), Number(g.total_score ?? 0), Number(g.snapshot_diff ?? 0),
            g.color || 'bg-blue-500', g.icon || 'fa-users', g.leader_name || '', Number(g.sort_order ?? 0),
            g.created_at ?? now, g.updated_at ?? now],
        }))
        if (ops.length > 0) { await executeTransaction(ops); result.groups = ops.length }
      }

      // 学生
      if (Array.isArray(data.students)) {
        const ops = (data.students as Record<string, unknown>[]).map(s => ({
          sql: `INSERT OR REPLACE INTO students (id, name, group_id, manual_offset, sort_order, practice_label, lunch_label, lunch_longterm, seat_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [s.id, s.name, s.group_id || '', Number(s.manual_offset ?? 0), Number(s.sort_order ?? 0),
            s.practice_label || '', s.lunch_label || '', s.lunch_longterm ? 1 : 0, Number(s.seat_order ?? -1),
            s.created_at ?? now, s.updated_at ?? now],
        }))
        if (ops.length > 0) { await executeTransaction(ops); result.students = ops.length }
      }

      // 每日状态
      const dsOps = importSimpleTable(data, 'daily_statuses', 'daily_statuses',
        ['id', 'student_id', 'date', 'daily_practice', 'attendance', 'homework', 'lunch_rest', 'created_at', 'updated_at'])
      if (dsOps.length > 0) { await executeTransaction(dsOps); result.dailyStatuses = dsOps.length }

      // 扣分记录
      const drOps = importSimpleTable(data, 'deduction_records', 'deduction_records',
        ['id', 'student_id', 'student_name', 'points', 'reason', 'date', 'timestamp'])
      if (drOps.length > 0) { await executeTransaction(drOps); result.deductionRecords = drOps.length }

      // 手动调整
      const maOps = importSimpleTable(data, 'manual_adjust_records', 'manual_adjust_records',
        ['id', 'student_id', 'student_name', 'delta', 'reason', 'timestamp'])
      if (maOps.length > 0) { await executeTransaction(maOps); result.manualAdjustRecords = maOps.length }

      // 值日记录 + 值日学生
      if (Array.isArray(data.duty_records)) {
        const ops: { sql: string; params: unknown[] }[] = []
        for (const r of (data.duty_records as Record<string, unknown>[])) {
          ops.push({
            sql: `INSERT OR REPLACE INTO duty_records (id, date, sign_in_window_start, sign_in_window_end, sign_out_window_start, sign_out_window_end, countdown_started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [r.id, r.date, r.sign_in_window_start ?? null, r.sign_in_window_end ?? null,
              r.sign_out_window_start ?? null, r.sign_out_window_end ?? null, r.countdown_started_at ?? null, r.created_at ?? now],
          })
        }
        if (Array.isArray(data.duty_students)) {
          for (const ds of (data.duty_students as Record<string, unknown>[])) {
            ops.push({
              sql: `INSERT OR REPLACE INTO duty_students (id, duty_record_id, student_id, student_name, sign_in_time, sign_out_time, penalty_applied) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              params: [ds.id, ds.duty_record_id, ds.student_id, ds.student_name,
                ds.sign_in_time ?? null, ds.sign_out_time ?? null, ds.penalty_applied ?? 0],
            })
          }
        }
        if (ops.length > 0) { await executeTransaction(ops); result.dutyRecords = data.duty_records.length }
      }

      // 宝龙币
      if (Array.isArray(data.coin_groups)) {
        const ops: { sql: string; params: unknown[] }[] = []
        for (const cg of (data.coin_groups as Record<string, unknown>[])) {
          ops.push({
            sql: `INSERT OR REPLACE INTO coin_groups (id, name, group_id, coins, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
            params: [cg.id, cg.name, cg.group_id ?? null, Number(cg.coins ?? 0), cg.created_at ?? now, cg.updated_at ?? now],
          })
        }
        if (Array.isArray(data.coin_history)) {
          for (const h of (data.coin_history as Record<string, unknown>[])) {
            ops.push({
              sql: `INSERT OR REPLACE INTO coin_history (id, coin_group_id, delta, reason, timestamp) VALUES (?, ?, ?, ?, ?)`,
              params: [h.id, h.coin_group_id, Number(h.delta ?? 0), h.reason, h.timestamp ?? now],
            })
          }
        }
        if (ops.length > 0) { await executeTransaction(ops); result.coinGroups = (data.coin_groups as any[]).length }
      }

      // 午餐午休
      const lrOps = importSimpleTable(data, 'lunch_rest_records', 'lunch_rest_records',
        ['id', 'student_id', 'date', 'status', 'remark', 'updated_at'])
      if (lrOps.length > 0) { await executeTransaction(lrOps); result.lunchRestRecords = lrOps.length }

      // 每日一练
      const dpOps = importSimpleTable(data, 'daily_practice_records', 'daily_practice_records',
        ['id', 'student_id', 'date', 'status', 'signed_at', 'updated_at'])
      if (dpOps.length > 0) { await executeTransaction(dpOps); result.dailyPracticeRecords = dpOps.length }

      // 每日一练签到
      const psOps = importSimpleTable(data, 'practice_signins', 'practice_signins',
        ['id', 'student_id', 'date', 'label', 'sign_in_order', 'signed_at'])
      if (psOps.length > 0) { await executeTransaction(psOps); result.practiceSignins = psOps.length }

      // 每日一练加分
      if (Array.isArray(data.practice_score_awards)) {
        const ops = importSimpleTable(data, 'practice_score_awards', 'practice_score_awards',
          ['id', 'student_id', 'group_id', 'date', 'label', 'score_delta', 'created_at'])
        if (ops.length > 0) await executeTransaction(ops)
      }

      // 考勤记录
      if (Array.isArray(data.attendance_records)) {
        const ops = importSimpleTable(data, 'attendance_records', 'attendance_records',
          ['id', 'student_id', 'date', 'status', 'remark', 'updated_at'])
        if (ops.length > 0) { await executeTransaction(ops); result.attendanceRecords = ops.length }
      }

      // 考勤时段
      if (Array.isArray(data.attendance_windows)) {
        const ops = importSimpleTable(data, 'attendance_windows', 'attendance_windows',
          ['id', 'date', 'label', 'window_start', 'window_end', 'status', 'created_at', 'updated_at'])
        if (ops.length > 0) await executeTransaction(ops)
      }
      if (Array.isArray(data.attendance_window_records)) {
        const ops = importSimpleTable(data, 'attendance_window_records', 'attendance_window_records',
          ['id', 'window_id', 'student_id', 'status', 'updated_at'])
        if (ops.length > 0) await executeTransaction(ops)
      }

      // 作业
      if (Array.isArray(data.homework)) {
        const ops = importSimpleTable(data, 'homework', 'homework',
          ['id', 'title', 'description', 'assign_date', 'due_date', 'created_at', 'updated_at'])
        if (ops.length > 0) await executeTransaction(ops)
      }
      if (Array.isArray(data.homework_submissions)) {
        const ops = importSimpleTable(data, 'homework_submissions', 'homework_submissions',
          ['id', 'homework_id', 'student_id', 'status', 'updated_at'])
        if (ops.length > 0) await executeTransaction(ops)
      }
      if (Array.isArray(data.homework_records)) {
        const ops = importSimpleTable(data, 'homework_records', 'homework_records',
          ['id', 'student_id', 'date', 'subject', 'status', 'updated_at'])
        if (ops.length > 0) { await executeTransaction(ops); result.homeworkRecords = ops.length }
      }
      if (Array.isArray(data.homework_daily)) {
        const ops = importSimpleTable(data, 'homework_daily', 'homework_daily',
          ['id', 'date', 'subjects', 'created_at'])
        if (ops.length > 0) await executeTransaction(ops)
      }

      // 数学作业
      if (Array.isArray(data.math_homework_grades)) {
        const ops = importSimpleTable(data, 'math_homework_grades', 'math_homework_grades',
          ['id', 'student_id', 'date', 'reason', 'created_at'])
        if (ops.length > 0) await executeTransaction(ops)
      }

      // 积分相关
      if (Array.isArray(data.group_score_history)) {
        const ops = importSimpleTable(data, 'group_score_history', 'group_score_history',
          ['id', 'group_id', 'delta', 'reason', 'operator', 'created_at'])
        if (ops.length > 0) await executeTransaction(ops)
      }
      if (Array.isArray(data.score_snapshots)) {
        const ops = importSimpleTable(data, 'score_snapshots', 'score_snapshots',
          ['id', 'group_id', 'score_before', 'score_after', 'diff', 'created_at'])
        if (ops.length > 0) await executeTransaction(ops)
      }
      if (Array.isArray(data.score_category_settings)) {
        const ops = importSimpleTable(data, 'score_category_settings', 'score_category_settings',
          ['category', 'enabled', 'points'])
        if (ops.length > 0) await executeTransaction(ops)
      }

      return result
    }

    // ============ 旧格式 (Web 版 localStorage) ============
    // 导入小组
    if (Array.isArray(data.groups_v2)) {
      const groups = data.groups_v2 as Record<string, unknown>[]
      const ops: { sql: string; params: unknown[] }[] = []
      for (const g of groups) {
        const id = g.id as string || uuid()
        const studyScore = Number(g.studyScore || g.study_score || 0)
        const totalScore = Number(g.totalScore || g.total_score || 0)
        ops.push({
          sql: `INSERT OR REPLACE INTO groups (id, name, study_score, total_score, snapshot_diff, color, icon, leader_name, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [id, g.name, studyScore, totalScore, 0, g.color || 'bg-blue-500', g.icon || 'fa-users',
            g.leader_name || g.leaderName || '', 0, now, now],
        })
      }
      if (ops.length > 0) {
        await executeTransaction(ops)
        result.groups = ops.length
      }
    }

    // 导入学生（旧格式）
    if (Array.isArray(data.individual_students)) {
      const students = data.individual_students as Record<string, unknown>[]
      const ops: { sql: string; params: unknown[] }[] = []
      for (const s of students) {
        ops.push({
          sql: `INSERT OR REPLACE INTO students (id, name, group_id, manual_offset, sort_order, practice_label, lunch_label, lunch_longterm, seat_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            s.id, s.name, s.groupId || s.group_id || '',
            Number(s.manualOffset || s.manual_offset || 0), 0,
            s.practiceLabel || s.practice_label || '',
            s.lunchLabel || s.lunch_label || '',
            s.lunchLongterm || s.lunch_longterm ? 1 : 0,
            Number(s.seat_order ?? s.seatOrder ?? -1),
            now, now,
          ],
        })
      }
      if (ops.length > 0) {
        await executeTransaction(ops)
        result.students = ops.length
      }
    }

    // 导入每日状态
    if (Array.isArray(data.individual_daily_statuses)) {
      const statuses = data.individual_daily_statuses as Record<string, unknown>[]
      const ops: { sql: string; params: unknown[] }[] = []
      for (const st of statuses) {
        ops.push({
          sql: `INSERT OR REPLACE INTO daily_statuses (id, student_id, date, daily_practice, attendance, homework, lunch_rest, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            st.id || uuid(), st.studentId || st.student_id, st.date,
            st.dailyPractice || st.daily_practice || 'unsigned',
            st.attendance || 'unsigned',
            st.homework || 'complete',
            st.lunchRest || st.lunch_rest || 'normal',
            now, now,
          ],
        })
      }
      if (ops.length > 0) {
        await executeTransaction(ops)
        result.dailyStatuses = ops.length
      }
    }

    // 导入扣分记录
    if (Array.isArray(data.individual_deduction_records)) {
      const records = data.individual_deduction_records as Record<string, unknown>[]
      const ops: { sql: string; params: unknown[] }[] = []
      for (const r of records) {
        ops.push({
          sql: `INSERT OR REPLACE INTO deduction_records (id, student_id, student_name, points, reason, date, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [r.id, r.studentId || r.student_id, r.studentName || r.student_name,
            Number(r.points), r.reason, r.date, r.timestamp || now],
        })
      }
      if (ops.length > 0) {
        await executeTransaction(ops)
        result.deductionRecords = ops.length
      }
    }

    // 导入手动调整记录
    if (Array.isArray(data.individual_manual_adjust_records)) {
      const records = data.individual_manual_adjust_records as Record<string, unknown>[]
      const ops: { sql: string; params: unknown[] }[] = []
      for (const r of records) {
        ops.push({
          sql: `INSERT OR REPLACE INTO manual_adjust_records (id, student_id, student_name, delta, reason, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)`,
          params: [r.id, r.studentId || r.student_id, r.studentName || r.student_name,
            Number(r.delta || 0), r.reason, r.timestamp || now],
        })
      }
      if (ops.length > 0) {
        await executeTransaction(ops)
        result.manualAdjustRecords = ops.length
      }
    }

    // 导入值日记录
    if (Array.isArray(data.duty_records)) {
      const records = data.duty_records as Record<string, unknown>[]
      const ops: { sql: string; params: unknown[] }[] = []
      for (const r of records) {
        ops.push({
          sql: `INSERT OR REPLACE INTO duty_records (id, date, created_at) VALUES (?, ?, ?)`,
          params: [r.id, r.date, now],
        })
        const students = r.students as Record<string, unknown>[]
        if (Array.isArray(students)) {
          for (const ds of students) {
            ops.push({
              sql: `INSERT OR REPLACE INTO duty_students (id, duty_record_id, student_id, student_name, sign_in_time, sign_out_time, penalty_applied)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
              params: [ds.id || uuid(), r.id, ds.studentId || ds.student_id, ds.studentName || ds.student_name,
                ds.signInTime || ds.sign_in_time || null, ds.signOutTime || ds.sign_out_time || null,
                ds.penaltyApplied || ds.penalty_applied || 0],
            })
          }
        }
      }
      if (ops.length > 0) {
        await executeTransaction(ops)
        result.dutyRecords = records.length
      }
    }

    // 导入宝龙币
    if (Array.isArray(data.coinGroups)) {
      const coinGroups = data.coinGroups as Record<string, unknown>[]
      const ops: { sql: string; params: unknown[] }[] = []
      for (const cg of coinGroups) {
        ops.push({
          sql: `INSERT OR REPLACE INTO coin_groups (id, name, coins, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
          params: [cg.id, cg.name, Number(cg.coins || 0), now, now],
        })
        const history = cg.history as Record<string, unknown>[]
        if (Array.isArray(history)) {
          for (const h of history) {
            ops.push({
              sql: `INSERT OR REPLACE INTO coin_history (id, coin_group_id, delta, reason, timestamp) VALUES (?, ?, ?, ?, ?)`,
              params: [h.id || uuid(), cg.id, Number(h.delta || 0), h.reason, h.timestamp || now],
            })
          }
        }
      }
      if (ops.length > 0) {
        await executeTransaction(ops)
        result.coinGroups = ops.length
      }
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err))
  }

  return result
}
