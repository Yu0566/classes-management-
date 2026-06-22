"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEMA_VERSION = void 0;
exports.runMigrations = runMigrations;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.SCHEMA_VERSION = 1;
function debugLog(msg) {
    try {
        const logPath = path_1.default.join(process.env.APPDATA || process.env.HOME || '.', 'class-management-dev', 'migration-debug.log');
        const dir = path_1.default.dirname(logPath);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
    }
    catch (_) { /* ignore */ }
}
function runMigrations(db) {
    debugLog('=== runMigrations START ===');
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
    // 累计学习积分（唯一用途：总积分相同时的决胜条件）
    try {
        db.exec("ALTER TABLE groups ADD COLUMN cumulative_study_score INTEGER DEFAULT 0");
    }
    catch (_) { /* 列已存在 */ }
    try {
        db.exec("UPDATE groups SET cumulative_study_score = study_score WHERE cumulative_study_score = 0 AND study_score != 0");
    }
    catch (_) { /* ignore */ }
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
    // duty_students 添加 source 列用于标注学生来历（自动/手动）
    try {
        db.exec("ALTER TABLE duty_students ADD COLUMN source TEXT DEFAULT ''");
    }
    catch (_) { /* 列已存在 */ }
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
    // 小组团建 — v2：每个组一条独立 record
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS reflection_records (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      group_id TEXT NOT NULL,
      group_name TEXT NOT NULL DEFAULT '',
      countdown_started_at INTEGER,
      sign_in_window_start INTEGER,
      sign_in_window_end INTEGER,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    )`);
    }
    catch (_) { /* 表已存在 */ }
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS reflection_students (
      id TEXT PRIMARY KEY,
      reflection_record_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      sign_in_time INTEGER,
      penalty_applied INTEGER DEFAULT 0,
      group_id TEXT,
      FOREIGN KEY (reflection_record_id) REFERENCES reflection_records(id)
    )`);
    }
    catch (_) { /* 表已存在 */ }
    try {
        db.exec("CREATE INDEX IF NOT EXISTS idx_reflection_students_record ON reflection_students(reflection_record_id)");
    }
    catch (_) { /* ignore */ }
    // 清理 reflection 重复数据 + 唯一约束
    // 注意：必须先删 students（外键引用 records），再删 records
    try {
        debugLog('reflection dedup starting...');
        // 先删掉属于重复 record 的 students（否则外键约束会阻止删除 record）
        db.exec("DELETE FROM reflection_students WHERE reflection_record_id IN (SELECT id FROM reflection_records WHERE id NOT IN (SELECT MIN(id) FROM reflection_records GROUP BY date, group_id))");
        // 再删重复 record
        db.exec("DELETE FROM reflection_records WHERE id NOT IN (SELECT MIN(id) FROM reflection_records GROUP BY date, group_id)");
        // 清理孤儿学生
        db.exec("DELETE FROM reflection_students WHERE reflection_record_id NOT IN (SELECT id FROM reflection_records)");
        // 清理 reflection_students 重复
        db.exec("DELETE FROM reflection_students WHERE id NOT IN (SELECT MIN(id) FROM reflection_students GROUP BY reflection_record_id, student_id)");
        debugLog('reflection dedup done, now creating indexes...');
    }
    catch (e) {
        debugLog(`reflection dedup ERROR: ${e?.message || e}`);
    }
    try {
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_reflection_records_date_group ON reflection_records(date, group_id)");
        debugLog('idx_reflection_records_date_group created OK');
    }
    catch (e) {
        debugLog(`idx_reflection_records_date_group FAILED: ${e?.message || e}`);
    }
    try {
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_reflection_students_unique ON reflection_students(reflection_record_id, student_id)");
        debugLog('idx_reflection_students_unique created OK');
    }
    catch (e) {
        debugLog(`idx_reflection_students_unique FAILED: ${e?.message || e}`);
    }
    // 罚抄管理
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS copy_punishment_weeks (
      id TEXT PRIMARY KEY,
      start_date TEXT NOT NULL,
      end_date TEXT,
      status TEXT DEFAULT 'active',
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    )`);
    }
    catch (_) { /* 表已存在 */ }
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS copy_punishment_students (
      id TEXT PRIMARY KEY,
      week_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      deduction_count INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      completed_at INTEGER,
      FOREIGN KEY (week_id) REFERENCES copy_punishment_weeks(id)
    )`);
    }
    catch (_) { /* 表已存在 */ }
    try {
        db.exec("CREATE INDEX IF NOT EXISTS idx_copy_punishment_week ON copy_punishment_students(week_id)");
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
      image TEXT,
      font_color TEXT,
      font_size TEXT
    )`);
    }
    catch (_) { /* 表已存在 */ }
    try {
        db.exec("ALTER TABLE message_board ADD COLUMN image TEXT");
    }
    catch (_) { /* 列已存在 */ }
    try {
        db.exec("ALTER TABLE message_board ADD COLUMN font_color TEXT");
    }
    catch (_) { /* 列已存在 */ }
    try {
        db.exec("ALTER TABLE message_board ADD COLUMN font_size TEXT");
    }
    catch (_) { /* 列已存在 */ }
    try {
        db.exec("CREATE INDEX IF NOT EXISTS idx_message_board_created ON message_board(created_at)");
    }
    catch (_) { /* ignore */ }
    // 小组植树
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS group_trees (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL UNIQUE,
      level INTEGER DEFAULT 0,
      growth INTEGER DEFAULT 0,
      fruits INTEGER DEFAULT 0,
      fruits_redeemed INTEGER DEFAULT 0,
      fruits_t1 INTEGER DEFAULT 0,
      fruits_t2 INTEGER DEFAULT 0,
      fruits_t3 INTEGER DEFAULT 0,
      redeemed_t1 INTEGER DEFAULT 0,
      redeemed_t2 INTEGER DEFAULT 0,
      redeemed_t3 INTEGER DEFAULT 0,
      gold_progress INTEGER DEFAULT 0,
      decorations TEXT DEFAULT '{}',
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (group_id) REFERENCES groups(id)
    )`);
    }
    catch (_) { /* 表已存在 */ }
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS tree_actions (
      id TEXT PRIMARY KEY,
      tree_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      cost INTEGER NOT NULL,
      growth_value INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (tree_id) REFERENCES group_trees(id)
    )`);
    }
    catch (_) { /* 表已存在 */ }
    try {
        db.exec("CREATE INDEX IF NOT EXISTS idx_tree_actions_tree ON tree_actions(tree_id)");
    }
    catch (_) { /* ignore */ }
    // 果实分级（铜/银/金）— 为已存在的 group_trees 表添加新列
    const fruitCols = ['fruits_t1', 'fruits_t2', 'fruits_t3', 'redeemed_t1', 'redeemed_t2', 'redeemed_t3', 'gold_progress'];
    for (const col of fruitCols) {
        try {
            db.exec(`ALTER TABLE group_trees ADD COLUMN ${col} INTEGER DEFAULT 0`);
            debugLog(`ALTER TABLE group_trees ADD COLUMN ${col} — OK`);
        }
        catch (e) {
            debugLog(`ALTER TABLE group_trees ADD COLUMN ${col} — ${e?.message || e}`);
        }
    }
    // 验证列是否存在
    try {
        const info = db.exec("PRAGMA table_info(group_trees)");
        const cols = info[0]?.values?.map((r) => r[1]) || [];
        debugLog(`group_trees columns: ${cols.join(', ')}`);
        if (!cols.includes('gold_progress')) {
            debugLog('WARNING: gold_progress column missing after ALTER TABLE! Rebuilding table...');
            db.exec('PRAGMA foreign_keys = OFF');
            db.exec(`
        CREATE TABLE group_trees_new (
          id TEXT PRIMARY KEY,
          group_id TEXT NOT NULL UNIQUE,
          level INTEGER DEFAULT 0,
          growth INTEGER DEFAULT 0,
          fruits INTEGER DEFAULT 0,
          fruits_redeemed INTEGER DEFAULT 0,
          fruits_t1 INTEGER DEFAULT 0,
          fruits_t2 INTEGER DEFAULT 0,
          fruits_t3 INTEGER DEFAULT 0,
          redeemed_t1 INTEGER DEFAULT 0,
          redeemed_t2 INTEGER DEFAULT 0,
          redeemed_t3 INTEGER DEFAULT 0,
          gold_progress INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
          updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
          FOREIGN KEY (group_id) REFERENCES groups(id)
        )
      `);
            db.exec(`INSERT INTO group_trees_new (id, group_id, level, growth, fruits, fruits_redeemed, created_at, updated_at)
               SELECT id, group_id, level, growth, fruits, fruits_redeemed, created_at, updated_at FROM group_trees`);
            db.exec(`DROP TABLE group_trees`);
            db.exec(`ALTER TABLE group_trees_new RENAME TO group_trees`);
            db.exec('PRAGMA foreign_keys = ON');
            debugLog('Rebuilt group_trees with new columns via temp table — OK');
        }
    }
    catch (e) {
        debugLog(`PRAGMA table_info check failed: ${e?.message || e}`);
    }
    // 迁移旧数据：将旧 fruits/fruits_redeemed 视为铜果
    try {
        db.exec(`UPDATE group_trees SET fruits_t1 = fruits, redeemed_t1 = fruits_redeemed WHERE fruits_t1 = 0 AND fruits > 0`);
    }
    catch (_) { /* ignore */ }
    // 树木装饰（个性化）
    try {
        db.exec(`ALTER TABLE group_trees ADD COLUMN decorations TEXT DEFAULT '{}'`);
    }
    catch (_) { /* 已存在 */ }
    // 种树花费累计（用于排名时补偿，排名 = total_score + tree_spent）
    try {
        db.exec("ALTER TABLE groups ADD COLUMN tree_spent INTEGER DEFAULT 0");
    }
    catch (_) { /* 列已存在 */ }
    try {
        db.exec(`UPDATE groups SET tree_spent = COALESCE(
      (SELECT ABS(SUM(delta)) FROM group_score_history
       WHERE group_id = groups.id AND reason LIKE '植树%' AND delta < 0), 0
    ) WHERE tree_spent = 0`);
    }
    catch (_) { /* ignore */ }
    // 语文课堂加分（独立积分系统）
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS chinese_class_history (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (group_id) REFERENCES groups(id)
    )`);
    }
    catch (_) { /* 表已存在 */ }
    try {
        db.exec("CREATE INDEX IF NOT EXISTS idx_chinese_class_group ON chinese_class_history(group_id)");
    }
    catch (_) { /* ignore */ }
    // 更新 schema version
    db.run(`INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', ?)`, [String(exports.SCHEMA_VERSION)]);
    console.log('数据库迁移完成');
    debugLog('=== runMigrations END ===');
}
//# sourceMappingURL=migrations.js.map