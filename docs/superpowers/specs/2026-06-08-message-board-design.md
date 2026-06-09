# 留言板功能设计

2026-06-08

## 概述

学生在课堂上把想说的话告诉老师 → 老师在浏览器端输入（学生姓名+留言内容+标签） → 发送到教室电脑大屏展示。教室端只读，防止学生乱写。

## 数据模型

新增 `message_board` 表：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| student_name | TEXT | 学生姓名 |
| content | TEXT | 留言内容 |
| tag | TEXT | 标签：建议/感谢/心愿/其他 |
| expires_at | INTEGER NULL | 过期时间戳，NULL=长期 |
| created_at | INTEGER | 创建时间戳 |

## 教室端（Electron 系统）

- 侧边栏新增"留言板"导航项（MessageSquare 图标）
- 页面以**卡片墙**布局展示（flex-wrap, 2-3列）
- 每张卡片：标签彩色徽章 + 学生姓名 + 留言内容 + 时间
- 标签配色：建议=blue, 感谢=green, 心愿=pink, 其他=stone
- **只读** — 无输入框、无删除按钮
- 已过期的卡片显示为半透明 + "已过期"标签

## 教师端（浏览器访问）

- 同一页面顶部显示"写留言"表单
- 表单字段：学生姓名 input、留言内容 textarea、标签选择、过期时间（可选）
- 表单仅通过 `isLanHttpMode()` 判断为浏览器模式时显示
- 每条留言卡片右上角有 X 删除按钮（仅教师可见）
- 表单和删除按钮的可见性由同一条件控制

## API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/messages` | POST | 发送留言 {student_name, content, tag, expires_at?} |
| `/api/messages` | GET | 获取未过期留言列表 |
| `/api/messages/:id` | DELETE | 删除留言 |

## 实现清单

1. 数据库：migrations.ts 添加 `message_board` 表
2. 数据层：`src/lib/message-board.ts` — CRUD 函数
3. LAN Server：`electron/lan-server.ts` 注册 `/api/messages` 路由
4. 页面：`src/pages/MessageBoardPage.tsx` — 卡片墙 + 教师表单
5. 导航：`MainLayout.tsx` 添加侧边栏入口
6. 路由：`App.tsx` 注册路由
