# AI 任务列表
生成时间: 2026-06-16 02:03:23
运行次数: 2
最后运行: 2026-06-16 01:58:12
全局轮次: 5

共 7 个任务

## 待执行

- [ ] **#11** [medium] [功能开发类] 增加 Sprint 选择器支持多 Sprint 历史浏览
  当前 Web UI 只展示当前活跃 Sprint 的数据。当一个 Sprint 结束后切换到新 Sprint，用户无法再查看旧 Sprint 的看板（只能通过 History 查看快照）。应在 Header 的 Sprint 标签处改为下拉选择器，允许选择历史 Sprint 并展示对应快照数据。

- [ ] **#13** [low] [质量保障类] 前端缺少组件和 hooks 的单元测试
  项目有 2476 行 Python 后端测试覆盖（db, web, ai_fix, azure_devops, config, notifier, utils），但前端 React 组件、hooks（useApi, useFilteredItems）没有任何测试。虽然 TanStack Query 的 queryFn 逻辑相对简单，但 useFilteredItems 有较复杂的过滤逻辑（状态、差异类型、搜索），值得编写单元测试确保过滤正确性。使用 vitest + @testing-library/react。

## 已完成

- [x] **#7** AI fix 入队时存储的 prompt 与实际执行不一致 (Round 5, 2026-06-16 02:03)

- [x] **#5** Web UI 缺少手动刷新按钮 (Round 4, 2026-06-16 02:01)

- [x] **#4** AI 修复任务缺少取消/终止机制 (Round 3, 2026-06-16 02:00)

- [x] **#1** test_server.py 引用不存在的 save_ai_fix 函数 (Round 1, 2026-06-16 01:55)

- [x] **#2** Dockerfile COPY 引用不存在的 templates/ 目录 (Round 2, 2026-06-16 01:55)
