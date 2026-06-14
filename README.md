# Azure DevOps Sprint 看板监控

定时从 Azure DevOps 获取当前 Sprint 中处于 **To Do**、**In Progress** 等未完成状态的 Work Items，在终端展示或通过 Web 页面查看。

## 功能

- 🔍 自动识别当前 Sprint（Iteration）
- 📋 列出所有未完成的 Work Items（支持自定义状态筛选）
- 🎨 终端彩色表格展示（基于 Rich）
- ⏰ 可定时刷新（基于 schedule）
- 🌐 可选 Web 页面查看

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
AZURE_DEVOPS_TEAM=MyTeam
AZURE_DEVOPS_PAT=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

QUERY_STATES=To Do,In Progress,Active,New,Committed
CHECK_INTERVAL_MINUTES=30
```

> **获取 PAT（Personal Access Token）**：
> 1. 登录 Azure DevOps
> 2. 右上角头像 → **Personal access tokens**
> 3. 新建 Token，勾选 `Work Items (Read)` 权限
> 4. 复制生成的 Token 填入 `.env`

### 3. 使用

```bash
# 单次查询
python main.py --once

# 定时监控（每 30 分钟刷新一次）
python main.py

# 自定义刷新间隔
python main.py --interval 5

# 启动 Web 服务
python main.py --web        # 默认 http://localhost:8080
python main.py --web 3000   # 自定义端口
```

## 效果展示

```
📋 MyProject — Sprint 42  (2026-06-01 → 2026-06-14)

┌───┬────────┬──────────────────────────────────┬──────────┬──────────────┬────────────────┐
│ # │   ID   │ Title                            │ Type     │ State        │ Assigned To    │
├───┼────────┼──────────────────────────────────┼──────────┼──────────────┼────────────────┤
│ 1 │ 12345  │ 登录页面重构                      │ Task     │ To Do        │ Unassigned     │
│ 2 │ 12346  │ API 接口联调                      │ Task     │ In Progress  │ 张三           │
│ 3 │ 12347  │ 数据库迁移脚本                    │ Bug      │ Active       │ 李四           │
└───┴────────┴──────────────────────────────────┴──────────┴──────────────┴────────────────┘
                                      共 3 项待办  |  To Do: 1  In Progress: 1  Active: 1
```

## 状态说明

不同过程模板的状态名称不同，默认查询以下状态：

| 模板  | To Do 等价状态       | In Progress 等价状态 |
|-------|---------------------|---------------------|
| Scrum | To Do               | In Progress, Doing  |
| Agile | New, Active         | Committed           |
| CMMI  | Proposed            | Active              |

可在 `.env` 的 `QUERY_STATES` 中自定义。
