# Azure DevOps Sprint Board Monitor

定时从 Azure DevOps 获取当前 Sprint 中的 Work Items，在 Web 界面展示，支持增量对比、个人视图、AI 修复建议和通知系统。

## 功能

- **Sprint 看板** -- 实时展示当前 Sprint 的 Work Items，带状态颜色标签和增量标记
- **增量差异对比** -- 每次拉取与上次快照对比，标记新增、状态变化、消失的卡片
- **个人/全量视图** -- 切换查看个人卡片或全团队卡片
- **AI 修复建议** -- 发现新 Bug 时自动调用 AI agent 生成修复方案
- **历史快照** -- 浏览历史快照列表、对比两个快照差异、查看快照详情
- **SQLite 持久化** -- 每次快照存入本地数据库，支持历史回溯
- **CSV 导出** -- 一键导出当前 Sprint 数据为 CSV
- **桌面通知** -- 检测到变化时发送系统桌面通知
- **Webhook 通知** -- 支持 Slack / Teams 兼容的 Webhook 通知
- **离线模式** -- API 不可用时自动回退到本地数据库中的最后一次快照
- **定时刷新** -- 可配置间隔，后台持续监控

## 技术栈

- **后端**: Python 3.10+ / Flask
- **前端**: React 19 / TypeScript / Vite / shadcn/ui / TanStack Query / TanStack Table
- **样式**: Tailwind CSS v4 + Raycast 暗色设计系统
- **数据库**: SQLite
- **通知**: notify-send (Linux) / osascript (macOS) / PowerShell Toast (Windows)

## 架构

```
main.py            入口，命令行解析、调度循环
azure_devops.py    Azure DevOps REST API 客户端
config.py          配置管理（.env 加载）
db.py              SQLite 持久化
ai_fix.py          AI 修复建议
renderer.py        状态颜色常量
notifier.py        通知模块
web.py             Flask API 服务器
frontend/          React SPA 前端
  src/
    components/    UI 组件 (BoardView, FixesView, HistoryView, DiffView, SnapshotDetail...)
    hooks/         数据获取 hooks (TanStack Query)
    lib/           工具函数
    types/         TypeScript 类型定义
    routes/        路由层
static/            Vite 构建产物（自动生成）
```

## 快速开始

### 1. 安装 Python 依赖

```bash
pip install -r requirements.txt
```

### 2. 构建前端

```bash
cd frontend
npm ci
npm run build
cd ..
```

### 3. 配置

```bash
cp .env.example .env
```

编辑 `.env`：

```ini
AZURE_DEVOPS_ORG=mycompany
AZURE_DEVOPS_PROJECT=MyProject
AZURE_DEVOPS_TEAM=
AZURE_DEVOPS_PAT=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

QUERY_STATES=To Do,In Progress,Active,New,Committed
CHECK_INTERVAL_MINUTES=30

# AI 修复建议（可选）
WORK_DIR=/path/to/your/code/repo

# 通知（可选）
# NOTIFY_DESKTOP=true
# NOTIFY_WEBHOOK_URL=https://hooks.slack.com/services/xxx
```

### 4. 启动

```bash
# 使用一键脚本（自动构建前端 + 启动后端）
./build.sh

# 或手动启动
python main.py

# 自定义端口
python main.py -w 3000

# 允许外部访问
python main.py --public

# 启用 AI 修复建议
python main.py --ai-fix
```

## 前端开发

```bash
cd frontend
npm ci
npm run dev          # Vite dev server (proxy API to localhost:8080)
npm run build        # 生产构建
npm run test         # 运行测试
npm run test:watch   # 测试监听模式
```

Vite dev server 自动代理 `/api/*` 到 `http://localhost:8080`，确保 Flask 后端已启动。

## 增量差异说明

每次拉取会与上次快照对比：

| 标记 | 含义 |
|------|------|
| `+` 新增 | 上次快照中没有的卡片 |
| `~` 变化 | 状态发生变化的卡片 |
| `-` 消失 | 上次有但本次没有的卡片 |

## 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `AZURE_DEVOPS_ORG` | 是 | — | Azure DevOps 组织名 |
| `AZURE_DEVOPS_PROJECT` | 是 | — | 项目名 |
| `AZURE_DEVOPS_PAT` | 是 | — | Personal Access Token |
| `AZURE_DEVOPS_TEAM` | 否 | 自动发现 | 团队名 |
| `QUERY_STATES` | 否 | `To Do,In Progress,Active,New,Committed` | 查询状态列表 |
| `CHECK_INTERVAL_MINUTES` | 否 | `30` | 刷新间隔（分钟） |
| `WORK_DIR` | 否 | 当前目录 | AI 修复工作目录 |
| `NOTIFY_DESKTOP` | 否 | `false` | 桌面通知 |
| `NOTIFY_WEBHOOK_URL` | 否 | — | Slack/Teams Webhook URL |
| `LOG_DIR` | 否 | `logs/` | 日志目录 |
