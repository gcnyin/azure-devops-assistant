# AI 任务列表
生成时间: 2026-06-18 19:50:07
运行次数: 1
最后运行: 2026-06-18 19:49:08
全局轮次: 1

共 2 个任务

## 待执行

- [ ] **#2** [low] [delete/simplify] Remove completed migration DROP TABLE ai_fixes in db.init_db()
  db.py init_db() line 37 executes DROP TABLE IF EXISTS ai_fixes on every startup. This migration was completed in the schema redesign, the table no longer exists since the first run. The statement is harmless (IF EXISTS) but it is dead code. Delete one line. Why now: it runs at every startup for no purpose, trivial cleanup.

## 已完成

- [x] **#1** Extract sprint-summary query from web.py to db.py (Round 1, 2026-06-18 19:50)
