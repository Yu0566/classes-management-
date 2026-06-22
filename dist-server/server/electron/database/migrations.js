"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEMA_VERSION = void 0;
exports.runMigrations = runMigrations;
exports.SCHEMA_VERSION = 1;
function runMigrations(db) {
    db.exec(`
    -- 元数据表（schema version 等）
    CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- 小组
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      study_score INTEGER DEFAULT 0,
      total_score INTEGER DEFAULT 0,
      snapshot_diff INTEGER DEFAULT 0,
      color TEXT DEFAULT 'bg-blue-500',
      icon TEXT DEFAULT 'fa-users',
      leader_name TEXT DEFAULT '',
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
      daily_practice TEXT DEFAULT '',
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

    -- 留堂/罚抄记录
    CREATE TABLE IF NOT EXISTS detention_records (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      countdown_started_at INTEGER,
      sign_in_window_start INTEGER,
      sign_in_window_end INTEGER,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    -- 留堂/罚抄学生记录
    CREATE TABLE IF NOT EXISTS detention_students (
      id TEXT PRIMARY KEY,
      detention_record_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      sign_in_time INTEGER,
      penalty_applied INTEGER DEFAULT 0,
      FOREIGN KEY (detention_record_id) REFERENCES detention_records(id),
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

    -- 考勤时段（支持一天多个时段）
    CREATE TABLE IF NOT EXISTS attendance_windows (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      label TEXT DEFAULT '',
      window_start TEXT,
      window_end TEXT,
      status TEXT DEFAULT 'idle',
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    -- 考勤时段内每个学生的签到状态
    CREATE TABLE IF NOT EXISTS attendance_window_records (
      id TEXT PRIMARY KEY,
      window_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      status TEXT DEFAULT 'unsigned',
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (window_id) REFERENCES attendance_windows(id),
      UNIQUE(window_id, student_id)
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
      group_id TEXT,
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

    -- 每日作业科目
    CREATE TABLE IF NOT EXISTS homework_daily (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      subjects TEXT NOT NULL DEFAULT '["语文","数学","英语"]',
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    -- 作业未交记录（仅记录非"交齐"状态）
    CREATE TABLE IF NOT EXISTS homework_records (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      date TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'incomplete',
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (student_id) REFERENCES students(id),
      UNIQUE(student_id, date, subject)
    );

    -- 每日一练签到记录（新系统：名单制+双标签）
    CREATE TABLE IF NOT EXISTS practice_signins (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      date TEXT NOT NULL,
      label TEXT NOT NULL,
      sign_in_order INTEGER NOT NULL,
      signed_at INTEGER NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id),
      UNIQUE(student_id, date, label)
    );

    -- 积分扣分项开关（每日一练/考勤/作业，默认关闭）
    CREATE TABLE IF NOT EXISTS score_category_settings (
      category TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 1
    );

    -- 数学作业等级记录（有记录=不合格，删除=合格）
    CREATE TABLE IF NOT EXISTS math_homework_grades (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      date TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id),
      UNIQUE(student_id, date)
    );

    -- 每日一练加分记录（每个组每个标签每天最多+1）
    CREATE TABLE IF NOT EXISTS practice_score_awards (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      date TEXT NOT NULL,
      label TEXT NOT NULL,
      score_delta INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (group_id) REFERENCES groups(id),
      UNIQUE(group_id, date, label)
    );

    -- 班级轮值安排
    CREATE TABLE IF NOT EXISTS duty_roster (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('monitor', 'captain', 'vice_captain', 'duty_monitor', 'rotation')),
      weekday INTEGER,
      position INTEGER,
      weekday_group TEXT,
      photo TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );
  `);
    // 创建索引
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_students_group ON students(group_id);
    CREATE INDEX IF NOT EXISTS idx_daily_statuses_date ON daily_statuses(date);
    CREATE INDEX IF NOT EXISTS idx_daily_statuses_student_date ON daily_statuses(student_id, date);
    CREATE INDEX IF NOT EXISTS idx_deduction_records_student ON deduction_records(student_id);
    CREATE INDEX IF NOT EXISTS idx_deduction_records_date ON deduction_records(date);
    CREATE INDEX IF NOT EXISTS idx_duty_records_date ON duty_records(date);
    CREATE INDEX IF NOT EXISTS idx_duty_students_record ON duty_students(duty_record_id);
    CREATE INDEX IF NOT EXISTS idx_detention_records_date ON detention_records(date);
    CREATE INDEX IF NOT EXISTS idx_detention_students_record ON detention_students(detention_record_id);
    CREATE INDEX IF NOT EXISTS idx_homework_submissions_homework ON homework_submissions(homework_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(date);
    CREATE INDEX IF NOT EXISTS idx_lunch_rest_records_date ON lunch_rest_records(date);
    CREATE INDEX IF NOT EXISTS idx_daily_practice_records_date ON daily_practice_records(date);
    CREATE INDEX IF NOT EXISTS idx_homework_records_date ON homework_records(date);
    CREATE INDEX IF NOT EXISTS idx_homework_records_student ON homework_records(student_id);
    CREATE INDEX IF NOT EXISTS idx_practice_signins_date_label ON practice_signins(date, label);
    CREATE INDEX IF NOT EXISTS idx_math_hw_grades_date ON math_homework_grades(date);
    CREATE INDEX IF NOT EXISTS idx_practice_score_awards_date_label ON practice_score_awards(date, label);
    CREATE INDEX IF NOT EXISTS idx_duty_roster_role ON duty_roster(role);
    CREATE INDEX IF NOT EXISTS idx_duty_roster_weekday ON duty_roster(weekday);
  `);
    // 兼容已有数据库：尝试添加 leader_name 列
    try {
        db.exec("ALTER TABLE groups ADD COLUMN leader_name TEXT DEFAULT ''");
    }
    catch (_) { /* 列已存在 */ }
    // 兼容已有数据库：尝试添加 practice_label 列
    try {
        db.exec("ALTER TABLE students ADD COLUMN practice_label TEXT DEFAULT ''");
    }
    catch (_) { /* 列已存在 */ }
    // 兼容已有数据库：尝试添加 lunch_label 列
    try {
        db.exec("ALTER TABLE students ADD COLUMN lunch_label TEXT DEFAULT ''");
    }
    catch (_) { /* 列已存在 */ }
    // 兼容已有数据库：尝试添加 lunch_longterm 列（长期请假标记）
    try {
        db.exec("ALTER TABLE students ADD COLUMN lunch_longterm INTEGER DEFAULT 0");
    }
    catch (_) { /* 列已存在 */ }
    // 兼容已有数据库：尝试添加 group_id 列到 coin_groups
    try {
        db.exec("ALTER TABLE coin_groups ADD COLUMN group_id TEXT");
    }
    catch (_) { /* 列已存在 */ }
    // 防止 coin_groups 同一 group_id 出现重复记录
    try {
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_groups_group_id ON coin_groups(group_id) WHERE group_id IS NOT NULL");
    }
    catch (_) { /* ignore */ }
    // 兼容已有数据库：尝试添加 seat_order 列（座位编排）
    try {
        db.exec("ALTER TABLE students ADD COLUMN seat_order INTEGER DEFAULT -1");
    }
    catch (_) { /* 列已存在 */ }
    // 兼容已有数据库：尝试添加 points 列到 score_category_settings（扣分分值，默认1）
    try {
        db.exec("ALTER TABLE score_category_settings ADD COLUMN points INTEGER DEFAULT 1");
    }
    catch (_) { /* 列已存在 */ }
    // 清理 duty_students 重复数据 + 添加唯一约束（防止同一学生在同一天值日名单中出现多次）
    try {
        db.exec("DELETE FROM duty_students WHERE rowid NOT IN (SELECT MIN(rowid) FROM duty_students GROUP BY duty_record_id, student_id)");
    }
    catch (_) { /* ignore */ }
    try {
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_duty_students_unique ON duty_students(duty_record_id, student_id)");
    }
    catch (_) { /* 唯一索引已存在 */ }
    // 通知历史记录
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS notification_history (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      mode TEXT DEFAULT 'fullscreen',
      duration INTEGER DEFAULT 30,
      image TEXT,
      urgency TEXT DEFAULT '普通',
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    )`);
    }
    catch (_) { /* 表已存在 */ }
    try {
        db.exec("ALTER TABLE notification_history ADD COLUMN urgency TEXT DEFAULT '普通'");
    }
    catch (_) { /* 列已存在 */ }
    try {
        db.exec("ALTER TABLE notification_history ADD COLUMN confirm_mode TEXT DEFAULT 'none'");
    }
    catch (_) { /* 列已存在 */ }
    try {
        db.exec("ALTER TABLE notification_history ADD COLUMN confirm_students TEXT DEFAULT '[]'");
    }
    catch (_) { /* 列已存在 */ }
    // 通知确认记录
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS notification_reads (
      id TEXT PRIMARY KEY,
      notification_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      read_at INTEGER NOT NULL,
      FOREIGN KEY (notification_id) REFERENCES notification_history(id) ON DELETE CASCADE
    )`);
    }
    catch (_) { /* 表已存在 */ }
    try {
        db.exec("CREATE INDEX IF NOT EXISTS idx_notification_reads_nid ON notification_reads(notification_id)");
    }
    catch (_) { /* ignore */ }
    // 清理：无 practice_label 的学生不参与每日一练，不应被扣分
    try {
        db.exec("UPDATE daily_statuses SET daily_practice = '' WHERE daily_practice = 'unsigned' AND student_id IN (SELECT id FROM students WHERE COALESCE(practice_label, '') = '')");
    }
    catch (_) { /* ignore */ }
    // 留言板
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS message_board (
      id TEXT PRIMARY KEY,
      student_name TEXT NOT NULL,
      content TEXT NOT NULL,
      tag TEXT DEFAULT '其他',
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      image TEXT
    )`);
    }
    catch (_) { /* 表已存在 */ }
    try {
        db.exec("ALTER TABLE message_board ADD COLUMN image TEXT");
    }
    catch (_) { /* 列已存在 */ }
    try {
        db.exec("CREATE INDEX IF NOT EXISTS idx_message_board_created ON message_board(created_at)");
    }
    catch (_) { /* ignore */ }
    // 更新 schema version
    db.run(`INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', ?)`, [String(exports.SCHEMA_VERSION)]);
    console.log('数据库迁移完成');
}
