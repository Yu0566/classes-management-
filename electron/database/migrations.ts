import { Database as SqlJsDatabase } from 'sql.js'

export function runMigrations(db: SqlJsDatabase): void {
  db.exec(`
    -- 小组
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      study_score INTEGER DEFAULT 0,
      total_score INTEGER DEFAULT 0,
      snapshot_diff INTEGER DEFAULT 0,
      color TEXT DEFAULT 'bg-blue-500',
      icon TEXT DEFAULT 'fa-users',
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    -- 学生
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      group_id TEXT NOT NULL,
      manual_offset INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    -- 小组积分操作历史
    CREATE TABLE IF NOT EXISTS group_score_history (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT,
      operator TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    -- 积分快照记录
    CREATE TABLE IF NOT EXISTS score_snapshots (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      score_before INTEGER,
      score_after INTEGER,
      diff INTEGER,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    -- 每日状态
    CREATE TABLE IF NOT EXISTS daily_statuses (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      date TEXT NOT NULL,
      daily_practice TEXT DEFAULT 'unsigned',
      attendance TEXT DEFAULT 'normal',
      homework TEXT DEFAULT 'complete',
      lunch_rest TEXT DEFAULT 'normal',
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (student_id) REFERENCES students(id),
      UNIQUE(student_id, date)
    );

    -- 扣分记录
    CREATE TABLE IF NOT EXISTS deduction_records (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      points INTEGER NOT NULL,
      reason TEXT NOT NULL,
      date TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- 手动调整记录
    CREATE TABLE IF NOT EXISTS manual_adjust_records (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- 值日记录
    CREATE TABLE IF NOT EXISTS duty_records (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      sign_in_window_start INTEGER,
      sign_in_window_end INTEGER,
      sign_out_window_start INTEGER,
      sign_out_window_end INTEGER,
      countdown_started_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    -- 值日学生记录
    CREATE TABLE IF NOT EXISTS duty_students (
      id TEXT PRIMARY KEY,
      duty_record_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      sign_in_time INTEGER,
      sign_out_time INTEGER,
      penalty_applied INTEGER DEFAULT 0,
      FOREIGN KEY (duty_record_id) REFERENCES duty_records(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- 作业
    CREATE TABLE IF NOT EXISTS homework (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      assign_date TEXT NOT NULL,
      due_date TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    -- 作业提交状态
    CREATE TABLE IF NOT EXISTS homework_submissions (
      id TEXT PRIMARY KEY,
      homework_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      status TEXT DEFAULT 'not_submitted',
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (homework_id) REFERENCES homework(id),
      FOREIGN KEY (student_id) REFERENCES students(id),
      UNIQUE(homework_id, student_id)
    );

    -- 每日考勤
    CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT DEFAULT 'normal',
      remark TEXT,
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (student_id) REFERENCES students(id),
      UNIQUE(student_id, date)
    );

    -- 午餐午休
    CREATE TABLE IF NOT EXISTS lunch_rest_records (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT DEFAULT 'normal',
      remark TEXT,
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (student_id) REFERENCES students(id),
      UNIQUE(student_id, date)
    );

    -- 每日一练
    CREATE TABLE IF NOT EXISTS daily_practice_records (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT DEFAULT 'unsigned',
      signed_at INTEGER,
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (student_id) REFERENCES students(id),
      UNIQUE(student_id, date)
    );

    -- 宝龙币小组
    CREATE TABLE IF NOT EXISTS coin_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      coins INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    -- 宝龙币历史
    CREATE TABLE IF NOT EXISTS coin_history (
      id TEXT PRIMARY KEY,
      coin_group_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (coin_group_id) REFERENCES coin_groups(id)
    );
  `)

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_students_group ON students(group_id);
    CREATE INDEX IF NOT EXISTS idx_daily_statuses_date ON daily_statuses(date);
    CREATE INDEX IF NOT EXISTS idx_daily_statuses_student_date ON daily_statuses(student_id, date);
    CREATE INDEX IF NOT EXISTS idx_deduction_records_student ON deduction_records(student_id);
    CREATE INDEX IF NOT EXISTS idx_deduction_records_date ON deduction_records(date);
    CREATE INDEX IF NOT EXISTS idx_duty_records_date ON duty_records(date);
    CREATE INDEX IF NOT EXISTS idx_duty_students_record ON duty_students(duty_record_id);
    CREATE INDEX IF NOT EXISTS idx_homework_submissions_homework ON homework_submissions(homework_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(date);
    CREATE INDEX IF NOT EXISTS idx_lunch_rest_records_date ON lunch_rest_records(date);
    CREATE INDEX IF NOT EXISTS idx_daily_practice_records_date ON daily_practice_records(date);
  `)

  console.log('数据库迁移完成')
}
