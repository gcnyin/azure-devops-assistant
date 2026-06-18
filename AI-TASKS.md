# AI 任务列表
生成时间: 2026-06-18 19:44:18
运行次数: 1
最后运行: 2026-06-18 19:42:50
全局轮次: 3

共 4 个任务

## 待执行

- [ ] **#4** [low] [delete/simplify] 审计根目录 package.json 是否仍被需要
  文件: /package.json。仅含 `@earendil-works/pi-coding-agent` 依赖，与 frontend/package.json 完全独立。若仅用于 pi agent 自身版本固定则保留并加注释；若为残留配置则删除。

## 已完成

- [x] **#3** 统一 web.py 中 _build_board_from_snapshot 和 _build_board_live 的返回结构构造 (Round 3, 2026-06-18 19:44)

- [x] **#1** 删除 tests/test_ai_fix.py 中测试不存在函数 _which 的 TestWhich 类 (Round 1, 2026-06-18 19:43)

- [x] **#2** 统一 ai_fix.py 中 _parse_analysis_result 和 _parse_fix_result 为单一函数 (Round 2, 2026-06-18 19:43)
