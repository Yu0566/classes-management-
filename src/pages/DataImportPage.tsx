import { useState } from 'react'
import { Upload, CheckCircle, AlertTriangle, Database } from 'lucide-react'
import { executeTransaction } from '@/lib/db'
import { v4 as uuid } from 'uuid'

interface ImportResult {
  groups: number
  students: number
  dailyStatuses: number
  deductionRecords: number
  manualAdjustRecords: number
  dutyRecords: number
  coinGroups: number
  errors: string[]
}

export default function DataImportPage() {
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState<Record<string, number> | null>(null)

  const handleFileSelect = async () => {
    try {
      // 使用原生方式读取文件（通过input）
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return

        setImporting(true)
        try {
          const text = await file.text()
          const data = JSON.parse(text)

          // 预览数据量
          const preview_data: Record<string, number> = {}
          if (Array.isArray(data.groups_v2)) preview_data['小组'] = data.groups_v2.length
          if (Array.isArray(data.individual_students)) preview_data['学生'] = data.individual_students.length
          if (Array.isArray(data.individual_daily_statuses)) preview_data['每日状态'] = data.individual_daily_statuses.length
          if (Array.isArray(data.individual_deduction_records)) preview_data['扣分记录'] = data.individual_deduction_records.length
          if (Array.isArray(data.individual_manual_adjust_records)) preview_data['手动调整'] = data.individual_manual_adjust_records.length
          if (Array.isArray(data.duty_records)) preview_data['值日记录'] = data.duty_records.length
          if (Array.isArray(data.coinGroups)) preview_data['宝龙币'] = data.coinGroups.length
          setPreview(preview_data)

          // 开始导入
          const result = await importData(data)
          setResult(result)
        } catch (err) {
          setResult({
            groups: 0, students: 0, dailyStatuses: 0,
            deductionRecords: 0, manualAdjustRecords: 0,
            dutyRecords: 0, coinGroups: 0,
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

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">数据导入</h1>
        <p className="text-sm text-gray-500 mb-6">
          从 Web 版班级管理系统导出 JSON 文件，将数据迁移到桌面版
        </p>

        {/* 导入按钮 */}
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center mb-6">
          <Upload size={48} className="mx-auto mb-3 text-primary-400" />
          <p className="text-gray-600 mb-4">选择 Web 版导出的 JSON 文件</p>
          <button
            onClick={handleFileSelect}
            disabled={importing}
            className="px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 font-medium"
          >
            {importing ? '导入中...' : '选择文件并导入'}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            支持的 localStorage 键：groups_v2, individual_students 等
          </p>
        </div>

        {/* 预览 */}
        {preview && !result && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <h3 className="font-medium text-blue-800 mb-2 flex items-center gap-2">
              <Database size={16} /> 数据预览
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(preview).map(([key, count]) => (
                <div key={key} className="text-sm text-blue-700">
                  {key}：{count} 条
                </div>
              ))}
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
              {Object.values(result).every(v => typeof v === 'number' && v === 0) && !result.errors.length && (
                <p className="text-sm text-gray-400">未识别到有效数据</p>
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
              className="mt-4 px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 text-sm"
            >
              导入更多
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// 导入逻辑
async function importData(data: Record<string, unknown>): Promise<ImportResult> {
  const result: ImportResult = {
    groups: 0, students: 0, dailyStatuses: 0,
    deductionRecords: 0, manualAdjustRecords: 0,
    dutyRecords: 0, coinGroups: 0,
    errors: [],
  }
  const now = Date.now()

  try {
    // 导入小组
    if (Array.isArray(data.groups_v2)) {
      const groups = data.groups_v2 as Record<string, unknown>[]
      const ops: { sql: string; params: unknown[] }[] = []
      for (const g of groups) {
        const id = g.id as string || uuid()
        const studyScore = Number(g.studyScore || g.study_score || 0)
        const totalScore = Number(g.totalScore || g.total_score || 0)
        ops.push({
          sql: `INSERT OR REPLACE INTO groups (id, name, study_score, total_score, snapshot_diff, color, icon, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [id, g.name, studyScore, totalScore, 0, g.color || 'bg-blue-500', g.icon || 'fa-users', 0, now, now],
        })
      }
      if (ops.length > 0) {
        await executeTransaction(ops)
        result.groups = ops.length
      }
    }

    // 导入学生
    if (Array.isArray(data.individual_students)) {
      const students = data.individual_students as Record<string, unknown>[]
      const ops: { sql: string; params: unknown[] }[] = []
      for (const s of students) {
        ops.push({
          sql: `INSERT OR REPLACE INTO students (id, name, group_id, manual_offset, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [s.id, s.name, s.groupId || s.group_id || '', Number(s.manualOffset || s.manual_offset || 0), 0, now, now],
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
        // 导入值日学生
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
