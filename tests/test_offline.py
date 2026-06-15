"""
离线回退逻辑测试：验证 load_offline_data 的统一路径
"""
import pytest

from tests.test_db import _make_item


class TestLoadOfflineData:
    """load_offline_data 离线数据加载测试"""

    @pytest.fixture(autouse=True)
    def setup(self, temp_db_dir, monkeypatch):
        """重定向 DB_PATH 到临时目录并初始化数据库"""
        import db
        import main
        monkeypatch.setattr(db, "DB_PATH", temp_db_dir / "test_offline.db")
        db.init_db()
        self.db = db
        # 覆盖 config 实例的 QUERY_STATES，确保 "Done" 不被视为未完成状态
        # 这样排序逻辑才能正确将 Done 排到末尾
        monkeypatch.setattr(main.config, "QUERY_STATES", ["New", "Active", "Committed", "In Progress", "To Do"])
        self.load_offline_data = main.load_offline_data

    def test_with_valid_sprint_name(self):
        """有 sprint_name 时通过 load_previous_items 加载并正确过滤排序"""
        items = [
            _make_item(1, state="Done", item_type="Bug"),
            _make_item(2, state="In Progress", item_type="Task"),
            _make_item(3, state="New", item_type="Bug", assigned_to="李四"),
        ]
        self.db.save_snapshot("Sprint 1", "TeamA", items)

        result = self.load_offline_data("Sprint 1", "TeamA", assigned_to=None, filter_by_user=False)
        assert result is not None
        iteration, loaded_items, diff_info = result
        assert iteration["name"] == "Sprint 1"
        assert len(loaded_items) == 3
        # 排序：未完成的排前面，已完成的排后面
        assert loaded_items[0]["state"] != "Done"
        assert loaded_items[-1]["state"] == "Done"
        assert diff_info["new_items"] == []
        assert diff_info["continuing_items"] == []
        assert diff_info["gone_items"] == []

    def test_with_assigned_to_filter(self):
        """assigned_to 过滤仅返回指定用户的卡片"""
        items = [
            _make_item(1, state="To Do", item_type="Bug", assigned_to="张三"),
            _make_item(2, state="To Do", item_type="Task", assigned_to="李四"),
        ]
        self.db.save_snapshot("Sprint 1", "TeamA", items)

        result = self.load_offline_data("Sprint 1", "TeamA", assigned_to="张三", filter_by_user=True)
        assert result is not None
        _, loaded_items, _ = result
        assert len(loaded_items) == 1
        assert loaded_items[0]["assignedTo"] == "张三"

    def test_without_sprint_name_fallback(self):
        """无 sprint_name 时降级到 list_snapshots + load_snapshot_by_id"""
        items = [
            _make_item(1, state="Active", item_type="Bug"),
            _make_item(2, state="Done", item_type="Task"),
        ]
        self.db.save_snapshot("Sprint 1", "TeamA", items)

        result = self.load_offline_data("", "TeamA", assigned_to=None, filter_by_user=False)
        assert result is not None
        iteration, loaded_items, diff_info = result
        assert iteration["name"] == "Sprint 1"
        assert len(loaded_items) == 2

    def test_without_sprint_name_no_snapshots(self):
        """无 sprint_name 且数据库无快照时返回 None"""
        result = self.load_offline_data("", "TeamA")
        assert result is None

    def test_with_sprint_name_no_data(self):
        """有 sprint_name 但无匹配数据时返回 None"""
        result = self.load_offline_data("不存在的Sprint", "TeamA")
        assert result is None

    def test_sorting_incomplete_first(self):
        """未完成的 Work Item 排在已完成之前"""
        items = [
            _make_item(1, state="Done", item_type="Bug"),
            _make_item(2, state="Done", item_type="Task"),
            _make_item(3, state="New", item_type="Bug"),
            _make_item(4, state="In Progress", item_type="Task"),
            _make_item(5, state="Active", item_type="Bug"),
        ]
        self.db.save_snapshot("Sprint 1", "TeamA", items)

        result = self.load_offline_data("Sprint 1", "TeamA", assigned_to=None, filter_by_user=False)
        assert result is not None
        _, loaded_items, _ = result
        # 前 3 个应该是未完成的 (New, Active, In Progress)
        for it in loaded_items[:3]:
            assert it["state"] != "Done"
        # 后 2 个应该是已完成的
        for it in loaded_items[3:]:
            assert it["state"] == "Done"
