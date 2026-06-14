# Azure DevOps Sprint 看板监控

定时从 Azure DevOps 获取当前 Sprint 中的 Work Items，在终端和 Web 界面展示，支持增量对比、个人视图、AI 修复建议、通知系统和文件导出。

## 功能

- **自动识别当前 Sprint** -- 无需手动指定 Iteration，自动找覆盖今天日期的 Sprint
- **Team 自动发现** -- 未配置 Team 时，自动扫描项目下所有团队，选择 Sprint 覆盖今天的 Team
- **WIQL 灵活查询** -- 支持自定义状态筛选（Scrum / Agile / CMMI 多模板兼容）
- **增量差异对比** -- 每次拉取与上次快照对比，标记 **新增**、**状态变化**、**消失** 的卡片
- **默认个人视图** -- 默认自动识别当前用户，只保存和展示自己的卡片；`--all` 查看全部
- **AI 修复建议** -- `--ai-fix` 发现新 Bug 时自动调用 AI agent（pi / claude / opencode / codex）生成修复方案
- **详情展示** -- 自动打印 Work Item 的描述内容（去掉 HTML 标签）
- **SQLite 持久化** -- 每次快照存入本地数据库，支持历史回溯
- **多格式导出** -- 支持导出为 `.csv`、`.md`、`.txt`
- **Rich 终端渲染** -- 彩色表格展示，带增量标记（新增/状态变化）和状态分布统计
- **Web 看板** -- 内置 Flask Web 界面，浏览器中查看 Sprint 看板、AI 修复建议、历史快照
- **桌面通知** -- 检测到变化时发送系统桌面通知（Linux / macOS / Windows）
- **Webhook 通知** -- 支持 Slack / Teams 兼容的 Webhook 通知
- **离线模式** -- API 不可用时，自动回退到本地 SQLite 中的最后一次快照数据
- **定时刷新** -- 可配置间隔，后台持续监控
- **API 自动重试** -- 遇到 429/5xx 自动指数退避重试（最多 3 次）
- **日志系统** -- 详细的文件日志（自动轮转）和终端错误输出

## 架构

```
main.py           入口，命令行解析、调度循环、Web/终端双模式
azure_devops.py   Azure DevOps REST API 客户端（WIQL 查询、批量详情、Team 发现）
config.py         配置管理（.env 加载、默认值）
db.py             SQLite 持久化（快照存取、差异对比、历史浏览）
ai_fix.py         AI 修复建议（构造 prompt → 调 agent → 存结果）
renderer.py       Rich 终端渲染（表格、状态颜色、文件导出）
notifier.py       通知模块（桌面通知 + Slack/Teams Webhook）
web.py            Flask Web 服务器（API 路由、数据缓存）
utils.py          工具函数（端口自动发现、日志配置）
static/           Web 前端静态资源（app.js, style.css）
templates/        Jinja2 模板（index.html）
```

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置

复制 `.env.example` 为 `.env` 并填入真实信息：

```bash
cp .env.example .env
```

编辑 `.env`：

```ini
AZURE_DEVOPS_ORG=mycompany
AZURE_DEVOPS_PROJECT=MyProject
AZURE_DEVOPS_TEAM=                 # 留空自动发现；也可手动指定
AZURE_DEVOPS_PAT=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

QUERY_STATES=To Do,In Progress,Active,New,Committed
CHECK_INTERVAL_MINUTES=30

# AI 修复建议（可选，使用 --ai-fix 时需配置）
WORK_DIR=/path/to/your/code/repo

# 通知配置（可选）
# NOTIFY_DESKTOP=true              # 启用桌面通知（Linux: notify-send, macOS: osascript, Windows: toast）
# NOTIFY_WEBHOOK_URL=https://hooks.slack.com/services/xxx  # Slack/Teams Webhook URL

# 日志目录（可选，默认项目目录下 logs/）
# LOG_DIR=/var/log/sprint-monitor
```

> **获取 PAT（Personal Access Token）**：
> 1. 登录 Azure DevOps
> 2. 右上角头像 → **Personal access tokens**
> 3. 新建 Token，勾选 `Work Items (Read)` 权限
> 4. 复制生成的 Token 填入 `.env`

### 3. 使用

```bash
# 单次查询（默认只显示你自己的卡片）
python main.py --once

# 查看所有人的卡片
python main.py --once --all

# 定时监控（按配置间隔刷新，默认个人模式）
python main.py

# 定时监控 + 查看全部
python main.py --all

# 自定义刷新间隔（分钟）
python main.py --interval 5

# 查看指定用户的卡片
python main.py --once --me "张三"

# 仅显示变化（新增 + 状态变化 + 消失），无变化时只打一行
python main.py --once --changes-only
python main.py --changes-only          # 定时模式，安静监控

# 导出结果到文件
python main.py --once --output report.csv
python main.py --once --output sprint.md

# 输出文件名支持 {now} 占位符，自动替换为时间戳（适合定时存档）
python main.py --output "report_{now}.csv"

# 发现新 Bug 时调用 AI agent 生成修复建议
python main.py --once --ai-fix
python main.py --me --ai-fix

# 禁用 Web UI（终端模式）
python main.py --no-web

# 指定 Web UI 端口（默认 8080，被占用自动顺延）
python main.py -w 8090
```

## Web 看板

程序启动后自动在浏览器中提供 Web 看板界面，包含以下页面：

- **Sprint 看板** -- 实时展示当前 Sprint 的 Work Items，带状态颜色标签和增量标记
- **AI 修复建议** -- 浏览所有已生成的 AI 修复方案
- **历史快照** -- 查看历史快照列表和每次快照的 Work Items 详情

Web 看板使用 Flask 后端 + 原生 HTML/CSS/JS 前端，无需任何前端构建工具。

```bash
# 默认自动启动 Web UI（端口 8080，被占用自动顺延）
python main.py

# 禁用 Web UI
python main.py --no-web

# 指定端口
python main.py -w 3000
```

## 增量差异说明

每次拉取会与上次快照对比，展示三类变化：

| 标记 | 含义 |
|------|------|
| `[新增]` | 上次快照中没有的卡片 |
| `[变化]` | 状态发生变化的卡片（`In Progress -> Done`） |
| `消失` | 上次有但本次没有的卡片（已被移除或移动到其他 Iteration） |

快照数据存储在本地 `sprint_history.db`（SQLite），自动保留最近 10 次快照。

## 通知系统

检测到变化时可发送多种通知：

### 桌面通知

在 `.env` 中启用：

```ini
NOTIFY_DESKTOP=true
```

- **Linux**: 使用 `notify-send`（需安装 `libnotify`）
- **macOS**: 使用 `osascript` 内置通知
- **Windows**: 使用 PowerShell Toast 通知

### Webhook 通知（Slack / Teams）

在 `.env` 中配置：

```ini
NOTIFY_WEBHOOK_URL=https://hooks.slack.com/services/xxx
```

检测到 Sprint 卡牌变化时自动推送消息，以上下文格式显示新增、状态变化和消失的数量。

## 离线模式

当 Azure DevOps API 不可用时（网络中断、Token 过期等），程序自动回退到离线模式：

1. 从本地 SQLite 加载最近一次快照数据
2. 终端和 Web UI 清晰标注"离线模式"
3. AI 修复和通知功能自动跳过

无需任何额外配置，自动切换。

## AI 修复建议

`--ai-fix` 会在发现新 Bug 时自动调用可用的 AI agent：

1. 从 Work Item 提取 Bug ID、标题、描述
2. 构造结构化 prompt，要求 agent 在 `WORK_DIR` 中定位相关代码并给出修复方案
3. Agent 输出存入 `sprint_history.db` 的 `ai_fixes` 表

支持的 agent（按优先级）：

| Agent | CLI 命令 |
|-------|---------|
| pi    | `pi -p --approve` |
| Claude Code | `claude -p --add-dir` |
| OpenCode | `opencode run` |
| Codex | `codex exec` |

需要系统 PATH 中至少有一个可用的 agent，并在 `.env` 中配置 `WORK_DIR` 指向代码仓库路径。

## 状态说明

不同过程模板的状态名称不同，默认查询以下状态（可在 `.env` 的 `QUERY_STATES` 中自定义）：

| 模板  | To Do 等价状态       | In Progress 等价状态 |
|-------|---------------------|---------------------|
| Scrum | To Do               | In Progress, Doing  |
| Agile | New, Active         | Committed           |
| CMMI  | Proposed            | Active              |

## 环境变量完整列表

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `AZURE_DEVOPS_ORG` | 是 | — | Azure DevOps 组织名 |
| `AZURE_DEVOPS_PROJECT` | 是 | — | 项目名 |
| `AZURE_DEVOPS_PAT` | 是 | — | Personal Access Token |
| `AZURE_DEVOPS_TEAM` | 否 | 自动发现 | 团队名（留空自动匹配） |
| `QUERY_STATES` | 否 | `To Do,In Progress,Active,New,Committed` | 要查询的状态列表 |
| `CHECK_INTERVAL_MINUTES` | 否 | `30` | 定时刷新间隔（分钟） |
| `WORK_DIR` | 否 | 当前目录 | AI 修复时搜索代码的目录 |
| `NOTIFY_DESKTOP` | 否 | `false` | 启用桌面通知（`true`/`1`/`yes`） |
| `NOTIFY_WEBHOOK_URL` | 否 | — | Slack/Teams Webhook URL |
| `LOG_DIR` | 否 | 项目目录下 `logs/` | 日志文件目录（自动创建，自动轮转） |
