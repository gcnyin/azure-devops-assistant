# AI 任务列表
生成时间: 2026-06-16 01:55:23
运行次数: 1
最后运行: 2026-06-16 01:54:47
全局轮次: 2

共 13 个任务

## 待执行

- [ ] **#3** [high] [功能开发类] WEB_ACCESS_TOKEN 认证中间件未实现
  config.py 和 .env.example 中定义了 WEB_ACCESS_TOKEN 配置项，README 也提到可用于保护 API，但 web.py 完全没有实现认证中间件。所有 API 路由（除 /health）都是公开的，生产环境部署存在安全风险。需在 web.py 中添加 Flask before_request 钩子，对非 /health 路由检查 Authorization: Bearer <token> 请求头。

- [ ] **#4** [high] [功能开发类] AI 修复任务缺少取消/终止机制
  AI 修复任务入队后无法取消。如果用户触发了一个错误的修复、或 agent 陷入死循环、或超时前想中止，目前没有任何方式终止。需要在 fix_tasks 表中支持 cancelled 状态，在 api/fixes 路由添加 PATCH 或 DELETE 端点来取消任务，并在 _worker_loop 中检查任务状态跳过大循环。这对实际使用体验有实质提升。

- [ ] **#5** [high] [功能开发类] Web UI 缺少手动刷新按钮
  当前 Web UI 只能被动等待定时刷新（默认 30 分钟一次）。用户在 Sprint Planning 等需要即时看到最新数据时，无法手动触发刷新。应在 BoardView 组件顶部添加一个「刷新」按钮，调用新增的 POST /api/refresh 端点触发一次立即拉取，并在完成后通过 TanStack Query 的 invalidate 更新前端数据。

- [ ] **#6** [high] [功能开发类] 看板视图缺少 Sprint 进度/燃尽图可视化
  当前 BoardRoute 只展示工作项列表和 Open/Done 统计数字，缺乏 Sprint 进度的可视化。Sprint 看板的用户最关心的是 Sprint 还剩多少工作没完成。建议在 BoardView 顶部 StatsRow 下方增加简单的进度条（已完成数 / 总数），以及一个按天统计的燃尽趋势迷你图（基于历史快照中的 done 数量）。这能让用户快速评估 Sprint 健康状况。

- [ ] **#7** [medium] [修复类] AI fix 入队时存储的 prompt 与实际执行不一致
  enqueue_fix_tasks() 调用 build_prompt(bug)（不传 repos 参数）生成单阶段 prompt 存入 fix_tasks 表。但 _process_one() 实际执行时使用两阶段流程：先 build_analysis_prompt 再 build_prompt(bug, target_repos, branch_name)。这意味着数据库中存储的 prompt 字段是误导性的（与用户看到的实际输出不符）。应在 enqueue_fix_tasks 中存储分析阶段 prompt，或标记 prompt 为 pending 待生成，避免数据不一致。

- [ ] **#8** [medium] [功能开发类] 支持从 Web UI 批量选择 Bug 触发 AI 修复
  当前 BoardView 中每个 Bug 有一个 Fix 按钮，但只能逐个触发。实际场景中用户通常需要批量选择多个 Bug 一起修复。应在 WorkItemsTable 中加入 checkbox 列（仅 Bug 类型行显示），在选中多个 Bug 后显示「批量修复」工具栏按钮，调用现有的 POST /api/fixes/run 接口（该接口已支持 bug_ids 数组）。

- [ ] **#9** [medium] [功能开发类] 历史快照对比支持跨 Sprint Diff
  当前 HistoryView 中「Diff prev」按钮自动连接同一 Sprint 的相邻快照，但用户可能需要跨 Sprint 对比（如 Sprint 25 vs Sprint 26 看工作项增减）。应允许手动对比模式支持选择任意两个快照，目前 compare mode 已存在但仅限当前列表中的快照对。需要在 DiffView 中添加 Sprint 名称切换选择器。

- [ ] **#10** [medium] [架构/质量类] web.py 缓存架构不支持多进程部署
  当前全局缓存 _cached_data 是进程内内存字典，仅适用于单进程（waitress threads=4 的场景）。如果将来需要水平扩展（gunicorn 多 worker），缓存将不同步。建议将缓存迁移到共享存储（SQLite 或 Redis），或将 schedule 调度与 Web 服务分离为独立进程，Web 层从数据库读取。这为未来扩展奠定基础。

- [ ] **#11** [medium] [功能开发类] 增加 Sprint 选择器支持多 Sprint 历史浏览
  当前 Web UI 只展示当前活跃 Sprint 的数据。当一个 Sprint 结束后切换到新 Sprint，用户无法再查看旧 Sprint 的看板（只能通过 History 查看快照）。应在 Header 的 Sprint 标签处改为下拉选择器，允许选择历史 Sprint 并展示对应快照数据。

- [ ] **#12** [low] [功能开发类] API 增加 Work Item 评论/状态更新能力
  当前系统是只读的——可以查看 Work Items 但不能在系统中直接修改状态或添加评论。如果用户需要通过本工具快速更新卡片（如标记为 Done 或添加备注），需要跳转到 Azure DevOps 页面。可考虑通过 Azure DevOps REST API PATCH 方法支持有限的状态更新和评论功能，但这需要评估权限需求。如果暂时不做，至少可以在 DetailModal 中增加一个显眼的「打开 Azure DevOps 编辑」链接。

- [ ] **#13** [low] [质量保障类] 前端缺少组件和 hooks 的单元测试
  项目有 2476 行 Python 后端测试覆盖（db, web, ai_fix, azure_devops, config, notifier, utils），但前端 React 组件、hooks（useApi, useFilteredItems）没有任何测试。虽然 TanStack Query 的 queryFn 逻辑相对简单，但 useFilteredItems 有较复杂的过滤逻辑（状态、差异类型、搜索），值得编写单元测试确保过滤正确性。使用 vitest + @testing-library/react。

## 已完成

- [x] **#1** test_server.py 引用不存在的 save_ai_fix 函数 (Round 1, 2026-06-16 01:55)

- [x] **#2** Dockerfile COPY 引用不存在的 templates/ 目录 (Round 2, 2026-06-16 01:55)
