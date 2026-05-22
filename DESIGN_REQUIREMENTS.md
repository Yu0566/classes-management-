# 班级小组积分管理系统 — 桌面端设计需求文档

## 1. 项目概述

### 1.1 项目背景
当前系统以 Web 应用形式运行，各功能模块（作业管理、每日考勤、午餐午休考勤、每日一练签到）通过 iframe 嵌入第三方扣子应用实现，存在以下痛点：
- 各模块分散在不同应用中，数据不互通，需手动同步
- iframe 嵌入受限（弹窗被拦截、sandbox 权限问题）
- 浏览器环境下数据仅存于 localStorage，无法多设备共享且存在丢失风险
- 值日签退等实时场景下，页面关闭即数据丢失

### 1.2 项目目标
开发一款桌面端一体化班级管理软件，将以下功能集中整合：
- **小组积分管理**（核心功能）
- **个人积分 & 每日登记**
- **值日管理**（签到/签退窗口）
- **作业管理**（原外部模块）
- **每日考勤**（原外部模块）
- **午餐午休考勤**（原外部模块）
- **每日一练签到**（原外部模块）
- **宝龙币管理**

### 1.3 目标用户
- 初中班级教师（班主任 / 任课老师）
- 学生（签退、签到场景下使用）

---

## 2. 技术方案建议

### 2.1 推荐技术栈
| 层级 | 技术 | 说明 |
|------|------|------|
| 框架 | **Electron** | 跨平台桌面应用，支持 Windows/macOS/Linux |
| 前端 | **React 18 + TypeScript** | 复用现有前端逻辑和组件结构 |
| UI 库 | **Tailwind CSS + shadcn/ui** | 复用现有样式体系 |
| 数据库 | **SQLite（better-sqlite3）** | 本地持久化，替代 localStorage，支持事务 |
| 构建 | **Electron Builder** | 打包分发 |
| 动画 | **framer-motion** | 复用现有动画 |
| 图表 | **recharts** | 复用现有图表组件 |

### 2.2 核心架构变更
| 现状（Web） | 目标（桌面端） |
|-------------|---------------|
| localStorage 存储（5MB 限制） | SQLite 本地数据库（无容量限制） |
| iframe 嵌入外部模块 | 原生集成所有模块，数据统一管理 |
| 防抖保存 + beforeunload | 事务写入，数据完整性由数据库保证 |
| 扣子应用 REST API 拉取数据 | 本地直接操作，无需网络同步 |
| 浏览器窗口（可被关闭） | 桌面窗口（支持最小化到托盘、关闭确认） |

---

## 3. 功能模块详细设计

### 3.1 小组积分管理

#### 3.1.1 数据结构
```
Group {
  id: string               // 唯一标识
  name: string             // 小组名称
  studyScore: number       // 学习积分
  totalScore: number       // 总积分
  snapshotDiff: number     // 快照差异（一键算分用）
  students: string[]       // 学生ID列表
  color: string            // 标识色（Tailwind class）
  icon: string             // 图标（FontAwesome class）
  sortOrder: number        // 排序权重
}
```

#### 3.1.2 功能清单
- **小组 CRUD**：添加、编辑名称/颜色/图标、删除（删除时处理关联学生）
- **积分操作**：加分、减分（范围 -10000 ~ 10000），附带原因备注
- **一键算分**：计算当前积分与快照的差异，一键将差值加到学习积分上
- **积分快照**：记录每次算分前后的积分值，支持回溯
- **排名展示**：按学习积分/总积分排序，支持动画排名变化
- **操作历史**：记录每次积分变动，限制 30 条展示，含时间/小组/分值/原因
- **学生换组**：将学生从一个小组移动到另一个小组，积分跟随迁移

#### 3.1.3 业务规则
- 积分范围：-10000 ~ 10000
- 操作历史限制展示 30 条
- 快照差异在算分后清零
- 小组删除时需确认，关联学生需先迁移或删除

---

### 3.2 个人积分管理

#### 3.2.1 数据结构
```
Student {
  id: string               // 唯一标识
  name: string             // 学生姓名
  groupId: string          // 所属小组
  manualOffset: number     // 手动积分偏移（值日扣分等）
  sortOrder: number        // 排序权重
}

DailyStatus {
  studentId: string        // 学生ID
  date: string             // YYYY-MM-DD
  dailyPractice: "signed" | "unsigned" | "not_applicable"
  attendance: "normal" | "late" | "absent" | "leave"
  homework: "complete" | "incomplete" | "not_submitted"
  lunchRest: "normal" | "violation" | "absent"
}

DeductionRecord {
  id: string
  studentId: string
  studentName: string
  points: number           // 正数，表示扣除的积分数
  reason: string
  date: string
  timestamp: number
}

ManualAdjustRecord {
  id: string
  studentId: string
  studentName: string
  delta: number            // 可正可负
  reason: string
  timestamp: number
}
```

#### 3.2.2 积分计算公式
```
个人积分 = 每日一练积分 + 考勤积分 + 作业积分 + 午餐午休积分 + manualOffset

各项规则：
- 每日一练：已签 +0，未签 -1，不参与 +0
- 考勤：正常 +0，迟到 -1，缺勤 -2，请假 +0
- 作业：已交齐 +0，未交齐 -1，未交 -1
- 午餐午休：正常 +0，违纪 -1，缺席 -1
- manualOffset：值日未签退 -1，手动调整等
```

#### 3.2.3 功能清单
- **每日登记**：按日期展示所有学生的四项状态（每日一练/考勤/作业/午餐午休），点击切换状态
- **积分一览**：汇总每个学生的总积分及各项明细
- **扣分记录**：展示所有扣分明细，支持按学生/日期筛选
- **手动调整**：对个别学生进行手动积分加减，需填写原因
- **批量操作**：支持批量设置某项状态（如全班考勤默认正常）

#### 3.2.4 业务规则
- 扣分记录限制 500 条
- 每日状态默认值：每日一练=未签，考勤=正常，作业=已交齐，午餐午休=正常
- 积分计算为累加逻辑，历史数据变更自动重算

---

### 3.3 值日管理

#### 3.3.1 数据结构
```
DutyStudentRecord {
  studentId: string
  studentName: string
  signInTime: number | null
  signOutTime: number | null
  penaltyApplied: boolean  // 是否已执行未签退扣分
}

DutyRecord {
  id: string
  date: string             // YYYY-MM-DD
  students: DutyStudentRecord[]
  signInWindowStart: number | null
  signInWindowEnd: number | null
  signOutWindowStart: number | null
  signOutWindowEnd: number | null
  countdownStartedAt: number | null
}
```

#### 3.3.2 功能清单
- **值日名单管理**：选择日期，指定值日学生名单
- **签到窗口**：教师开启签到窗口，学生在窗口内点击签到
- **5分钟倒计时**：签到结束后自动开始5分钟倒计时
- **签退窗口**：倒计时结束后自动开启5分钟签退窗口
- **自动扣分**：签退窗口结束后，未签退的学生自动扣1分（写入 manualOffset + 记录扣分明细）
- **状态实时展示**：已签到/未签到、已签退/未签退状态实时更新

#### 3.3.3 业务规则
- 签到窗口持续时间由教师控制
- 5分钟倒计时不可跳过
- 签退窗口固定5分钟
- 未签退扣分：-1分/人，自动执行不可撤销
- 窗口期间关闭程序需弹窗确认
- 数据即时写入数据库，不依赖防抖

---

### 3.4 作业管理

#### 3.4.1 数据结构
```
Homework {
  id: string               // 作业ID
  title: string            // 作业标题
  description: string      // 作业描述
  assignDate: string       // 布置日期 YYYY-MM-DD
  dueDate: string          // 截止日期 YYYY-MM-DD
}

HomeworkSubmission {
  id: string
  homeworkId: string       // 关联作业ID
  studentId: string        // 学生ID
  status: "complete" | "incomplete" | "not_submitted"
  updatedAt: number        // 更新时间戳
}
```

#### 3.4.2 功能清单
- **作业发布**：创建作业，设置标题、描述、截止日期
- **提交状态管理**：逐个或批量设置学生的作业提交状态
- **状态同步**：作业提交状态自动同步到个人积分的每日登记中
- **统计视图**：查看各作业的完成率、未交名单

#### 3.4.3 业务规则
- 作业状态三选一：已交齐 / 未交齐 / 未交
- 未交齐和未交均扣1分
- 作业状态变更后实时更新对应日期的个人积分

---

### 3.5 每日考勤

#### 3.5.1 数据结构
```
AttendanceRecord {
  id: string
  studentId: string
  date: string             // YYYY-MM-DD
  status: "normal" | "late" | "absent" | "leave"
  remark: string           // 备注（如请假原因）
  updatedAt: number
}
```

#### 3.5.2 功能清单
- **考勤登记**：按日期记录每个学生的考勤状态
- **快速操作**：默认全部正常，点击修改个别异常状态
- **请假管理**：记录请假原因
- **统计视图**：出勤率、迟到率、缺勤率

#### 3.5.3 业务规则
- 考勤状态：正常(0分) / 迟到(-1分) / 缺勤(-2分) / 请假(0分)
- 考勤状态同步到个人积分的每日登记中
- 支持按周/月查看考勤汇总

---

### 3.6 午餐午休考勤

#### 3.6.1 数据结构
```
LunchRestRecord {
  id: string
  studentId: string
  date: string             // YYYY-MM-DD
  status: "normal" | "violation" | "absent"
  remark: string
  updatedAt: number
}
```

#### 3.6.2 功能清单
- **午休登记**：按日期记录每个学生的午餐午休状态
- **违纪记录**：记录午休违纪行为（说话、走动等）
- **统计视图**：午休违纪率

#### 3.6.3 业务规则
- 午餐午休状态：正常(0分) / 违纪(-1分) / 缺席(-1分)
- 状态同步到个人积分的每日登记中

---

### 3.7 每日一练签到

#### 3.7.1 数据结构
```
DailyPracticeRecord {
  id: string
  studentId: string
  date: string             // YYYY-MM-DD
  status: "signed" | "unsigned" | "not_applicable"
  signedAt: number | null  // 签到时间戳
  updatedAt: number
}
```

#### 3.7.2 功能清单
- **签到窗口**：教师开启签到窗口，学生在窗口内签到
- **批量签到**：支持全班一键签到
- **不参与标记**：请假等不参与每日一练的学生可标记
- **统计视图**：每日签到率

#### 3.7.3 业务规则
- 签到状态：已签(0分) / 未签(-1分) / 不参与(0分)
- 状态同步到个人积分的每日登记中

---

### 3.8 宝龙币管理

#### 3.8.1 数据结构
```
CoinGroup {
  id: string
  name: string
  coins: number            // 宝龙币余额
  history: {
    id: string
    delta: number
    reason: string
    timestamp: number
  }[]
}
```

#### 3.8.2 功能清单
- **宝龙币发放/扣除**：按小组操作
- **历史记录**：记录每次变动
- **余额展示**：各小组当前余额

---

## 4. 数据库设计

### 4.1 SQLite 表结构

```sql
-- 小组
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  study_score INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0,
  snapshot_diff INTEGER DEFAULT 0,
  color TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);

-- 学生
CREATE TABLE students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_id TEXT NOT NULL,
  manual_offset INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER,
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

-- 小组积分操作历史
CREATE TABLE group_score_history (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT,
  operator TEXT,
  created_at INTEGER,
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

-- 积分快照记录
CREATE TABLE score_snapshots (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  score_before INTEGER,
  score_after INTEGER,
  diff INTEGER,
  created_at INTEGER,
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

-- 每日状态
CREATE TABLE daily_statuses (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  date TEXT NOT NULL,
  daily_practice TEXT DEFAULT 'unsigned',   -- signed/unsigned/not_applicable
  attendance TEXT DEFAULT 'normal',          -- normal/late/absent/leave
  homework TEXT DEFAULT 'complete',          -- complete/incomplete/not_submitted
  lunch_rest TEXT DEFAULT 'normal',          -- normal/violation/absent
  created_at INTEGER,
  updated_at INTEGER,
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE(student_id, date)
);

-- 扣分记录
CREATE TABLE deduction_records (
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
CREATE TABLE manual_adjust_records (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (student_id) REFERENCES students(id)
);

-- 值日记录
CREATE TABLE duty_records (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  sign_in_window_start INTEGER,
  sign_in_window_end INTEGER,
  sign_out_window_start INTEGER,
  sign_out_window_end INTEGER,
  countdown_started_at INTEGER,
  created_at INTEGER
);

-- 值日学生记录
CREATE TABLE duty_students (
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
CREATE TABLE homework (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assign_date TEXT NOT NULL,
  due_date TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

-- 作业提交状态
CREATE TABLE homework_submissions (
  id TEXT PRIMARY KEY,
  homework_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  status TEXT DEFAULT 'not_submitted',  -- complete/incomplete/not_submitted
  updated_at INTEGER,
  FOREIGN KEY (homework_id) REFERENCES homework(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE(homework_id, student_id)
);

-- 每日考勤
CREATE TABLE attendance_records (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT DEFAULT 'normal',  -- normal/late/absent/leave
  remark TEXT,
  updated_at INTEGER,
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE(student_id, date)
);

-- 午餐午休
CREATE TABLE lunch_rest_records (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT DEFAULT 'normal',  -- normal/violation/absent
  remark TEXT,
  updated_at INTEGER,
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE(student_id, date)
);

-- 每日一练
CREATE TABLE daily_practice_records (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT DEFAULT 'unsigned',  -- signed/unsigned/not_applicable
  signed_at INTEGER,
  updated_at INTEGER,
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE(student_id, date)
);

-- 宝龙币
CREATE TABLE coin_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  coins INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);

-- 宝龙币历史
CREATE TABLE coin_history (
  id TEXT PRIMARY KEY,
  coin_group_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (coin_group_id) REFERENCES coin_groups(id)
);
```

### 4.2 索引建议
```sql
CREATE INDEX idx_students_group ON students(group_id);
CREATE INDEX idx_daily_statuses_date ON daily_statuses(date);
CREATE INDEX idx_daily_statuses_student_date ON daily_statuses(student_id, date);
CREATE INDEX idx_deduction_records_student ON deduction_records(student_id);
CREATE INDEX idx_deduction_records_date ON deduction_records(date);
CREATE INDEX idx_duty_records_date ON duty_records(date);
CREATE INDEX idx_duty_students_record ON duty_students(duty_record_id);
CREATE INDEX idx_homework_submissions_homework ON homework_submissions(homework_id);
CREATE INDEX idx_attendance_records_date ON attendance_records(date);
CREATE INDEX idx_lunch_rest_records_date ON lunch_rest_records(date);
CREATE INDEX idx_daily_practice_records_date ON daily_practice_records(date);
```

### 4.3 数据迁移方案
从现有 Web 版 localStorage 导入数据：
1. 提供数据导出功能（在 Web 端导出为 JSON）
2. 桌面端提供数据导入向导
3. 导入时校验数据格式，支持冲突处理策略（覆盖/跳过/合并）

需要导出的 localStorage 键：
- `groups_v2` — 小组数据
- `individual_students` — 学生名单
- `individual_daily_statuses` — 每日状态
- `individual_deduction_records` — 扣分记录
- `individual_manual_adjust_records` — 手动调整记录
- `duty_records` — 值日记录
- `coinGroups` — 宝龙币数据
- `external_modules` — 外部模块配置（仅参考，不再需要）

---

## 5. 桌面端特有设计

### 5.1 窗口管理
- **主窗口**：1280×800 默认尺寸，支持缩放
- **全屏模式**：教师展示排名时使用
- **最小化到托盘**：值日签退窗口期间可最小化，后台继续计时
- **关闭确认**：值日签退窗口期间关闭时弹窗提醒"签退窗口尚未结束，关闭将影响数据完整性"

### 5.2 数据安全
- **自动备份**：每日自动备份数据库文件到 `backups/` 目录，保留最近 30 天
- **手动备份**：支持一键导出数据库副本
- **数据恢复**：从备份文件恢复数据
- **导出功能**：支持导出为 Excel/CSV 格式（积分表、考勤表等）

### 5.3 快捷操作
- **全局快捷键**：
  - `Ctrl+N`：新建小组/添加学生
  - `Ctrl+S`：保存/快照
  - `Ctrl+Z`：撤销上一步操作
  - `Ctrl+F`：搜索学生
  - `F11`：全屏切换
- **批量操作**：
  - 批量加分（选中多个学生/小组同时操作）
  - 批量签到（全班一键签到）
  - 批量设置考勤（默认全部正常，点击修改个别异常）

### 5.4 通知系统
- 值日签退窗口即将关闭时，系统通知栏弹窗提醒

### 5.5 打印功能
- 支持打印排名表
- 支持打印考勤表
- 支持打印积分汇总表

---

## 6. 页面/视图设计

### 6.1 导航结构
```
左侧边栏（可折叠）：
├── 📊 仪表盘（首页概览）
├── ⭐ 积分管理
│   ├── 小组积分
│   ├── 一键算分
│   └── 操作历史
├── 👤 个人积分
│   ├── 每日登记
│   ├── 积分一览
│   └── 扣分记录
├── 🧹 值日管理
├── 📝 作业管理
│   ├── 作业列表
│   └── 提交状态
├── 📋 每日考勤
├── 🍱 午餐午休
├── ✍️ 每日一练
├── 🪙 宝龙币管理
└── ⚙️ 系统设置
    ├── 数据管理（导入/导出/备份/恢复）
    ├── 外观设置（主题/字体大小）
    └── 关于
```

### 6.2 仪表盘（首页）
- 今日考勤概况（出勤/迟到/缺勤/请假人数）
- 今日作业完成率
- 小组积分排名 Top 3
- 待处理事项（未签退、未交作业等）

---

## 7. 非功能需求

### 7.1 性能
- 界面操作响应时间 < 200ms
- 数据库查询响应时间 < 50ms
- 支持至少 200 名学生的数据量
- 启动时间 < 3 秒

### 7.2 兼容性
- Windows 10/11（主要目标）
- macOS 12+（次要目标）
- Linux（可选）

### 7.3 可靠性
- 数据库事务保证，断电/崩溃不丢失数据
- 自动备份机制
- 异常自动恢复

### 7.4 安全性
- 本地数据加密存储（可选）
- 密码保护管理操作（可选，防止学生自行修改积分）
- 数据库文件权限控制

### 7.5 可扩展性
- 预留局域网多端同步接口（未来版本）
- 预留家校互通接口（未来版本）
- 插件化架构，便于添加新功能模块

---

## 8. 与现 Web 版的差异对照

| 特性 | Web 版（现有） | 桌面端（目标） |
|------|---------------|---------------|
| 数据存储 | localStorage（5MB限制） | SQLite（无限制） |
| 数据安全 | 防抖+beforeunload | 事务写入+自动备份 |
| 外部模块 | iframe 嵌入扣子应用 | 原生集成，数据统一 |
| 作业管理 | 第三方应用，API受限 | 本地原生管理 |
| 考勤管理 | 第三方应用，需同步 | 本地原生管理 |
| 午餐午休 | 第三方应用，需同步 | 本地原生管理 |
| 每日一练 | 第三方应用，需同步 | 本地原生管理 |
| 数据同步 | REST API 拉取 | 不需要（本地一体） |
| 弹窗限制 | sandbox 限制 | 无限制 |
| 页面关闭风险 | 数据可能丢失 | 关闭确认+后台运行 |
| 跨设备 | 不支持 | 支持（通过数据库文件） |
| 打印 | 浏览器打印 | 原生打印 |
| 通知 | 无 | 系统通知 |
| 全屏 | 浏览器全屏 | 原生全屏 |

---

## 9. 开发优先级建议

### P0 — 核心功能（第一版必须完成）
1. 桌面端框架搭建（Electron + React + SQLite）
2. 小组积分管理（加分/减分/排名/快照）
3. 学生管理（增删改查/换组）
4. 个人积分与每日登记（四项状态管理+积分计算）
5. 数据持久化（SQLite 事务写入）
6. 数据导入（从 Web 版 localStorage JSON 导入）

### P1 — 重要功能（第二版完成）
7. 值日管理（签到窗口/签退窗口/自动扣分）
8. 作业管理（原生集成）
9. 每日考勤（原生集成）
10. 午餐午休考勤（原生集成）
11. 每日一练签到（原生集成）

### P2 — 增强功能（后续版本）
12. 宝龙币管理
13. 仪表盘首页
14. 自动备份与恢复
15. 打印功能
16. 系统通知
17. 密码保护
18. 数据导出（Excel/CSV）

---

## 10. 现有数据结构参考（从代码中提取）

### 10.1 小组（Group）
```typescript
interface Group {
  id: string;
  name: string;
  studyScore: number;       // 学习积分
  totalScore: number;       // 总积分
  snapshotDiff: number;     // 快照差异
  students: string[];       // 学生ID列表
  color: string;            // 标识色（Tailwind class）
  icon: string;             // 图标（FontAwesome class）
}
```

### 10.2 学生（Student）
```typescript
interface Student {
  id: string;
  name: string;
  groupId: string;
  manualOffset: number;     // 手动积分偏移
}
```

### 10.3 每日状态（DailyStatus）
```typescript
interface DailyStatus {
  studentId: string;
  date: string;             // YYYY-MM-DD
  dailyPractice: "signed" | "unsigned" | "not_applicable";
  attendance: "normal" | "late" | "absent" | "leave";
  homework: "complete" | "incomplete" | "not_submitted";
  lunchRest: "normal" | "violation" | "absent";
}
```

### 10.4 扣分记录（DeductionRecord）
```typescript
interface DeductionRecord {
  id: string;
  studentId: string;
  studentName: string;
  points: number;           // 正数
  reason: string;
  date: string;
  timestamp: number;
}
```

### 10.5 手动调整记录（ManualAdjustRecord）
```typescript
interface ManualAdjustRecord {
  id: string;
  studentId: string;
  studentName: string;
  delta: number;
  reason: string;
  timestamp: number;
}
```

### 10.6 值日记录（DutyRecord）
```typescript
interface DutyStudentRecord {
  studentId: string;
  studentName: string;
  signInTime: number | null;
  signOutTime: number | null;
  penaltyApplied: boolean;
}
interface DutyRecord {
  id: string;
  date: string;
  students: DutyStudentRecord[];
  signInWindowStart: number | null;
  signInWindowEnd: number | null;
  signOutWindowStart: number | null;
  signOutWindowEnd: number | null;
  countdownStartedAt: number | null;
}
```

---

## 11. 已知问题与规避

以下为 Web 版中遇到的问题，桌面端应从架构层面规避：

| Web 版问题 | 根因 | 桌面端规避方案 |
|------------|------|---------------|
| 签退窗口10秒后重置 | setInterval 闭包捕获旧 state | SQLite 事务 + 直接读取数据库 |
| 倒计时卡顿 | Context value 每秒变化导致全组件树重渲染 | 本地状态 + 数据库触发 |
| 未签退扣分不生效 | setState updater 内副作用 | 数据库事务，扣分独立于 UI 状态 |
| 批量扣分丢失 | React 批处理下循环调用 setState | 数据库批量 INSERT 事务 |
| 页面关闭数据丢失 | 防抖延迟 + beforeunload 不可靠 | 事务写入（每步操作即写即存） |
| iframe 弹窗被拦截 | sandbox 限制 | 原生组件，无限制 |
| 作业状态同步失败 | API 字段映射不准确 | 本地操作，直接读写数据库 |
| localStorage 容量不足 | 5MB 限制 | SQLite 无此限制 |
