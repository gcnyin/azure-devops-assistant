"""
数据库模块测试：验证 SQLite CRUD 操作和差异对比逻辑
"""
import json

import pytest


# 测试用的 Work Item 数据模板
def _make_item(item_id, title="Test", state="To Do", item_type="Bug", assigned_to="张三"):
    return {
        "id": item_id,
        "title": title,
        "state": state,
        "type": item_type,
        "assignedTo": assigned_to,
        "url": f"https://dev.azure.com/org/proj/_apis/wit/workItems/{item_id}",
        "description": "",
        "htmlUrl": f"https://dev.azure.com/org/proj/_workitems/edit/{item_id}",
    }


class TestDiffItems:
    """差异对比逻辑测试"""

    def test_all_new_items(self):
        """上次无数据，所有当前项都是新增"""
        from db import diff_items
        current = [_make_item(1), _make_item(2), _make_item(3)]
        previous = {}
        new_items, continuing, gone = diff_items(current, previous)
        assert len(new_items) == 3
        assert len(continuing) == 0
        assert len(gone) == 0
        assert {it["id"] for it in new_items} == {1, 2, 3}

    def test_all_gone_items(self):
        """当前无数据，所有上次项都是消失"""
        from db import diff_items
        current = []
        previous = {
            1: _make_item(1),
            2: _make_item(2),
        }
        new_items, continuing, gone = diff_items(current, previous)
        assert len(new_items) == 0
        assert len(continuing) == 0
        assert len(gone) == 2

    def test_mixed_changes(self):
        """混合场景：新增 + 持续 + 消失"""
        from db import diff_items
        current = [
            _make_item(1, state="In Progress"),  # 状态变化
            _make_item(2, state="To Do"),        # 状态不变
            _make_item(3, state="New"),           # 新增
        ]
        previous = {
            1: _make_item(1, state="To Do"),
            2: _make_item(2, state="To Do"),
            4: _make_item(4, state="Done"),  # 消失
        }
        new_items, continuing, gone = diff_items(current, previous)

        assert len(new_items) == 1
        assert new_items[0]["id"] == 3

        assert len(continuing) == 2
        # 状态变化的在前（sort_by state_changed=0 优先）
        assert continuing[0]["id"] == 1
        assert continuing[0]["_state_changed"] is True
        assert continuing[0]["_prev_state"] == "To Do"
        assert continuing[1]["id"] == 2
        assert continuing[1]["_state_changed"] is False

        assert len(gone) == 1
        assert gone[0]["id"] == 4

    def test_state_change_detection(self):
        """正确检测状态变化"""
        from db import diff_items
        current = [_make_item(1, state="Done")]
        previous = {1: _make_item(1, state="In Progress")}
        new_items, continuing, gone = diff_items(current, previous)
        assert len(continuing) == 1
        assert continuing[0]["_state_changed"] is True
        assert continuing[0]["_prev_state"] == "In Progress"
        assert continuing[0]["state"] == "Done"

    def test_no_state_change(self):
        """状态未变时不标记变化"""
        from db import diff_items
        current = [_make_item(1, state="In Progress")]
        previous = {1: _make_item(1, state="In Progress")}
        new_items, continuing, gone = diff_items(current, previous)
        assert len(continuing) == 1
        assert continuing[0]["_state_changed"] is False

    def test_new_items_sorted_by_state_then_type(self):
        """新增项按 state 然后 type 排序"""
        from db import diff_items
        current = [
            _make_item(1, state="New", item_type="Bug"),
            _make_item(2, state="Active", item_type="Task"),
            _make_item(3, state="New", item_type="Task"),
            _make_item(4, state="Active", item_type="Bug"),
        ]
        previous = {}
        new_items, _, _ = diff_items(current, previous)
        # 预期排序: Active/Bug, Active/Task, New/Bug, New/Task
        assert [(it["state"], it["type"]) for it in new_items] == [
            ("Active", "Bug"),
            ("Active", "Task"),
            ("New", "Bug"),
            ("New", "Task"),
        ]

    def test_continuing_items_state_changed_first(self):
        """持续项中，状态变化的排在前面"""
        from db import diff_items
        current = [
            _make_item(1, state="In Progress"),
            _make_item(2, state="To Do"),
        ]
        previous = {
            1: _make_item(1, state="To Do"),
            2: _make_item(2, state="To Do"),
        }
        _, continuing, _ = diff_items(current, previous)
        # 状态变化的 (id=1) 应排在前面
        assert continuing[0]["id"] == 1
        assert continuing[1]["id"] == 2


class TestDbCRUD:
    """数据库 CRUD 操作测试（使用临时数据库文件）"""

    @pytest.fixture(autouse=True)
    def setup_db(self, temp_db_dir, monkeypatch):
        """重定向 DB_PATH 到临时目录并初始化数据库"""
        import db
        monkeypatch.setattr(db, "DB_PATH", temp_db_dir / "test_sprint.db")
        db.init_db()
        self.db = db
        self.temp_dir = temp_db_dir

    def test_init_db_creates_tables(self):
        """init_db 创建 sprint_snapshot 和 fix_tasks 表"""
        tables = self._get_table_names()
        assert "sprint_snapshot" in tables
        assert "fix_tasks" in tables

    def test_save_and_load_snapshot(self):
        """保存快照后能正确加载"""
        items = [_make_item(1), _make_item(2)]
        self.db.save_snapshot("Sprint 1", "TeamA", items)
        loaded, fetched_at = self.db.load_previous_items("Sprint 1", "TeamA")
        assert len(loaded) == 2
        assert loaded[1]["title"] == "Test"
        assert loaded[2]["title"] == "Test"
        assert fetched_at is not None

    def test_load_previous_items_returns_latest(self):
        """加载上次快照应返回最近一条"""
        items_v1 = [_make_item(1)]
        items_v2 = [_make_item(1), _make_item(2)]
        self.db.save_snapshot("Sprint 1", "TeamA", items_v1)
        self.db.save_snapshot("Sprint 1", "TeamA", items_v2)
        loaded, _ = self.db.load_previous_items("Sprint 1", "TeamA")
        assert len(loaded) == 2  # 应加载最新（v2）

    def test_load_previous_items_no_sprint(self):
        """不存在的 Sprint 返回空字典"""
        loaded, fetched_at = self.db.load_previous_items("不存在", "TeamA")
        assert loaded == {}
        assert fetched_at is None

    def test_snapshot_cleanup_keeps_10(self):
        """保存超过 10 条时，旧记录被清理"""
        for i in range(15):
            self.db.save_snapshot("Sprint 1", "TeamA", [_make_item(i)])
        conn = self.db._connect()
        count = conn.execute(
            "SELECT COUNT(*) FROM sprint_snapshot WHERE sprint_name=? AND team_name=?",
            ("Sprint 1", "TeamA"),
        ).fetchone()[0]
        conn.close()
        assert count <= 10

    def test_create_and_get_fix_tasks(self):
        """创建和获取修复任务"""
        tid = self.db.create_fix_task(123, "Bug Title", sprint_name="Sprint 1")
        assert tid > 0
        tasks = self.db.get_fix_tasks()
        matched = [t for t in tasks if t["bug_id"] == 123]
        assert len(matched) >= 1
        assert matched[0]["status"] == "pending"
        assert matched[0]["sprint_name"] == "Sprint 1"

    def test_update_fix_task_status(self):
        """更新任务状态"""
        tid = self.db.create_fix_task(456, "Another Bug")
        self.db.update_fix_task_status(tid, "completed", response="Fixed!", finished_at="now", agent_name="pi")
        tasks = self.db.get_fix_tasks(bug_id=456)
        assert len(tasks) >= 1
        matched = [t for t in tasks if t["id"] == tid]
        assert len(matched) == 1
        assert matched[0]["status"] == "completed"
        assert matched[0]["response"] == "Fixed!"
        assert matched[0]["agent_name"] == "pi"
        assert matched[0]["finished_at"] is not None

    def test_get_fix_tasks_status_filter(self):
        """按状态过滤任务"""
        t1 = self.db.create_fix_task(1, "Bug 1")
        t2 = self.db.create_fix_task(2, "Bug 2")
        self.db.update_fix_task_status(t1, "completed", response="done", finished_at="now")
        completed = self.db.get_fix_tasks(status="completed")
        assert all(t["status"] == "completed" for t in completed)
        pending = self.db.get_fix_tasks(status="pending")
        assert all(t["status"] == "pending" for t in pending)

    def test_get_fix_tasks_multi_status(self):
        """多状态过滤"""
        t1 = self.db.create_fix_task(1, "Bug 1")
        self.db.update_fix_task_status(t1, "failed", error="timeout", finished_at="now")
        tasks = self.db.get_fix_tasks(status=["pending", "failed"])
        assert all(t["status"] in ("pending", "failed") for t in tasks)

    def test_get_bug_fix_status_map(self):
        """获取每个 bug 的最新状态映射"""
        tid = self.db.create_fix_task(100, "Bug X")
        self.db.update_fix_task_status(tid, "running", started_at="now")
        status_map = self.db.get_bug_fix_status_map()
        assert 100 in status_map
        assert status_map[100]["status"] == "running"
        assert status_map[100]["task_id"] == tid

    def test_same_bug_multiple_tasks(self):
        """同一 bug 可创建多个任务记录"""
        tid1 = self.db.create_fix_task(200, "Bug", sprint_name="S1")
        self.db.update_fix_task_status(tid1, "completed", response="v1", finished_at="now")
        tid2 = self.db.create_fix_task(200, "Bug", sprint_name="S2")
        self.db.update_fix_task_status(tid2, "running", started_at="now")
        tasks = self.db.get_fix_tasks(bug_id=200)
        assert len(tasks) >= 2
        # 最新状态映射应指向 running（最后创建的）
        status_map = self.db.get_bug_fix_status_map()
        assert status_map[200]["status"] == "running"

    def test_list_snapshots_filtered(self):
        """按 sprint_name 过滤列出快照"""
        self.db.save_snapshot("Sprint 1", "TeamA", [_make_item(1)])
        self.db.save_snapshot("Sprint 2", "TeamA", [_make_item(2)])
        results = self.db.list_snapshots(sprint_name="Sprint 1")
        assert len(results) >= 1
        assert all(r["sprint_name"] == "Sprint 1" for r in results)

    def test_list_snapshots_by_team(self):
        """按 team_name 过滤列出快照"""
        self.db.save_snapshot("Sprint 1", "TeamA", [_make_item(1)])
        self.db.save_snapshot("Sprint 1", "TeamB", [_make_item(2)])
        results = self.db.list_snapshots(team_name="TeamA")
        assert all(r["team_name"] == "TeamA" for r in results)

    def test_load_snapshot_by_id_exists(self):
        """通过 ID 加载存在的快照"""
        items = [_make_item(1), _make_item(2, item_type="Task")]
        self.db.save_snapshot("Sprint 1", "TeamA", items)
        # 获取最新快照的 ID
        snapshots = self.db.list_snapshots()
        sid = snapshots[0]["id"]
        result = self.db.load_snapshot_by_id(sid)
        assert result is not None
        loaded_items, meta = result
        assert len(loaded_items) == 2
        assert meta["sprint_name"] == "Sprint 1"
        assert meta["team_name"] == "TeamA"

    def test_load_snapshot_by_id_not_exists(self):
        """通过不存在的 ID 加载返回 None"""
        result = self.db.load_snapshot_by_id(99999)
        assert result is None

    def _get_table_names(self):
        conn = self.db._connect()
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        conn.close()
        return {r["name"] for r in tables}
