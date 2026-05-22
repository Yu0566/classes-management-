# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

课堂管理系统 (Class Management System) v1.0 — 桌面端一体化班级管理应用。

## Tech Stack

- **框架**: Electron 30
- **前端**: React 18 + TypeScript 5
- **UI**: Tailwind CSS 3 + Lucide React (icons)
- **数据库**: sql.js (SQLite WASM)
- **动画**: framer-motion 11
- **图表**: recharts 2
- **构建**: Vite 5 + electron-builder
- **路由**: react-router-dom 6

## Architecture

```
electron/          # 主进程 (窗口管理、数据库、IPC)
src/
  components/      # 通用组件 (布局等)
  pages/           # 页面组件 (14个)
  lib/             # 数据访问层 (10个模块)
  types/           # TypeScript 类型定义
```

## 沟通规范

- 所有回复必须使用中文。
- 一个功能一个功能地实现，不要一次改太多。

## Commands

```bash
npm install                  # 安装依赖
npm run dev                  # Vite 开发服务器
npm run build                # 生产构建
npm run electron:dev         # 一键启动开发模式
npm run electron:build       # 打包桌面应用
```
