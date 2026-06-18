# AI 任务列表
生成时间: 2026-06-18 19:43:03
运行次数: 1
最后运行: 2026-06-18 19:42:50
全局轮次: 1

共 4 个任务

## 待执行

- [ ] **#2** [medium] [delete/simplify] 统一 ai_fix.py 中 _parse_analysis_result 和 _parse_fix_result 为单一函数
  文件: ai_fix.py。这两个函数（第180行和第196行附近）逻辑完全相同：正则提取 ---MARKER--- JSON 块、去除 markdown 代码围栏、json.loads 解析、logger 记录。唯一差异是 marker 字符串和日志信息。合并为 `_parse_result_block(output, marker)` 可消除约20行重复代码，后续修改只需改一处。

- [ ] **#3** [medium] [delete/simplify] 统一 web.py 中 _build_board_from_snapshot 和 _build_board_live 的返回结构构造
  文件: web.py。两个函数返回完全相同的 BoardData 字典结构（iteration/items/diff_info/last_update/assigned_to/team_name/project/offline/error/view_mode），仅数据来源不同（SQLite vs Azure DevOps API）。可提取 `_make_board_data(...)` 工厂函数消除结构重复，未来 BoardData 字段变更只需改一处。

- [ ] **#4** [low] [delete/simplify] 审计根目录 package.json 是否仍被需要
  文件: /package.json。仅含 `@earendil-works/pi-coding-agent` 依赖，与 frontend/package.json 完全独立。若仅用于 pi agent 自身版本固定则保留并加注释；若为残留配置则删除。

## 已完成

- [x] **#1** 删除 tests/test_ai_fix.py 中测试不存在函数 _which 的 TestWhich 类 (Round 1, 2026-06-18 19:43)
