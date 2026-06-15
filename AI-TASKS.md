# AI 任务列表
生成时间: 2026-06-16 02:05:39
运行次数: 2
最后运行: 2026-06-16 01:58:12
全局轮次: 6

共 7 个任务

## 待执行

- [ ] **#13** [low] [质量保障类] 前端缺少组件和 hooks 的单元测试
  项目有 2476 行 Python 后端测试覆盖（db, web, ai_fix, azure_devops, config, notifier, utils），但前端 React 组件、hooks（useApi, useFilteredItems）没有任何测试。虽然 TanStack Query 的 queryFn 逻辑相对简单，但 useFilteredItems 有较复杂的过滤逻辑（状态、差异类型、搜索），值得编写单元测试确保过滤正确性。使用 vitest + @testing-library/react。

## 已完成

- [x] **#11** 增加 Sprint 选择器支持多 Sprint 历史浏览 (Round 6, 2026-06-16 02:05)

- [x] **#7** AI fix 入队时存储的 prompt 与实际执行不一致 (Round 5, 2026-06-16 02:03)

- [x] **#5** Web UI 缺少手动刷新按钮 (Round 4, 2026-06-16 02:01)

- [x] **#4** AI 修复任务缺少取消/终止机制 (Round 3, 2026-06-16 02:00)

- [x] **#1** test_server.py 引用不存在的 save_ai_fix 函数 (Round 1, 2026-06-16 01:55)

- [x] **#2** Dockerfile COPY 引用不存在的 templates/ 目录 (Round 2, 2026-06-16 01:55)
