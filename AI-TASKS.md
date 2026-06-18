# AI 任务列表
生成时间: 2026-06-18 19:40:08
运行次数: 1
最后运行: 2026-06-18 19:39:30
全局轮次: 2

共 4 个任务

## 待执行

- [ ] **#3** [high] [delete/simplify] Remove dead function notify_fix_tasks_completed and its unused import
  notifier.py: notify_fix_tasks_completed() (line 169) is never called. web.py: its import at line 22 is unused. Dead code - remove both.

- [ ] **#4** [medium] [refactor] Consolidate ai_fix.py db imports to module level (remove lazy import)
  ai_fix.py: _worker_loop() does a lazy import db inside function body (line 64) while module-level already imports from db. Move STATUS_CANCELLED and CANCELLABLE_STATUSES to module-level imports, remove the lazy import. Reduces import noise and makes dependency graph explicit.

## 已完成

- [x] **#2** Remove ai_fix.py _connect_to_db() duplication, reuse db._connect() (Round 2, 2026-06-18 19:40)

- [x] **#1** Remove _which() pure delegation wrapper, use shutil.which directly (Round 1, 2026-06-18 19:39)
