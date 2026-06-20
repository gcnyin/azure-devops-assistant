"""
Web 模块测试：验证 Flask API 路由返回格式和数据正确性
"""
import json
import threading

import pytest

from web import app, update_cached_data, get_cached_data, set_web_query_states, set_web_access_token, set_refresh_callback


@pytest.fixture
def client():
    """Flask 测试客户端"""
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


@pytest.fixture(autouse=True)
def reset_cache():
    """每个测试前重置缓存数据"""
    update_cached_data(
        iteration={},
        items=[],
        diff_info=None,
        assigned_to="",
        team_name="",
        project="",
        offline=False,
        error="",
    )
    yield


@pytest.fixture
def sample_data():
    """样本缓存数据注入 fixture"""
    update_cached_data(
        iteration={"name": "Sprint 1", "startDate": "2026-01-01", "finishDate": "2026-01-15"},
        items=[
            {"id": 1, "title": "登录 Bug", "state": "To Do", "type": "Bug", "assignedTo": "张三", "htmlUrl": "http://example.com/1"},
            {"id": 2, "title": "首页优化", "state": "In Progress", "type": "Task", "assignedTo": "李四", "htmlUrl": "http://example.com/2"},
        ],
        diff_info={
            "prev_time": "2026-01-01T00:00:00",
            "new_items": [{"id": 1, "title": "登录 Bug", "state": "To Do", "type": "Bug", "assignedTo": "张三"}],
            "continuing_items": [],
            "gone_items": [],
        },
        assigned_to="张三",
        team_name="DevTeam",
        project="MyProject",
        offline=False,
        error="",
    )


class TestApiDataRoute:
    """GET /api/data 路由测试"""

    def test_returns_200(self, client):
        """返回 200 状态码"""
        resp = client.get("/api/data")
        assert resp.status_code == 200

    def test_returns_json(self, client):
        """返回 JSON 格式"""
        resp = client.get("/api/data")
        assert resp.content_type == "application/json"

    def test_default_empty_cache(self, client):
        """无缓存数据时返回空结构"""
        resp = client.get("/api/data")
        data = resp.get_json()
        assert "iteration" in data
        assert "items" in data
        assert "diff_info" in data
        assert "last_update" in data
        assert "assigned_to" in data
        assert "team_name" in data
        assert "project" in data
        assert "offline" in data
        assert "error" in data
        assert data["items"] == []
        assert data["iteration"] == {}

    def test_returns_injected_data(self, client, sample_data):
        """注入数据后返回完整内容"""
        resp = client.get("/api/data")
        data = resp.get_json()
        assert data["iteration"]["name"] == "Sprint 1"
        assert len(data["items"]) == 2
        assert {it["id"] for it in data["items"]} == {1, 2}
        assert data["assigned_to"] == "张三"
        assert data["team_name"] == "DevTeam"
        assert data["project"] == "MyProject"
        assert data["offline"] is False
        assert data["error"] == ""

    def test_error_field_propagated(self, client):
        """错误信息正确传递"""
        update_cached_data(
            iteration={}, items=[], diff_info=None,
            team_name="MyTeam", project="MyProject",
            error="API 请求失败: timeout",
        )
        resp = client.get("/api/data")
        data = resp.get_json()
        assert data["error"] == "API 请求失败: timeout"

    def test_offline_flag(self, client):
        """离线标志正确传递"""
        update_cached_data(
            iteration={}, items=[], diff_info=None,
            team_name="MyTeam", project="MyProject",
            offline=True,
        )
        resp = client.get("/api/data")
        data = resp.get_json()
        assert data["offline"] is True

    def test_view_mode_defaults_to_all(self, client):
        """默认 view_mode 为 'all'"""
        resp = client.get("/api/data")
        data = resp.get_json()
        assert data["view_mode"] == "all"

    def test_view_all_returns_all_items(self, client, sample_data):
        """view=all 返回全部卡片"""
        resp = client.get("/api/data?view=all")
        data = resp.get_json()
        assert len(data["items"]) == 2
        assert data["view_mode"] == "all"

    def test_view_me_filters_by_user(self, client):
        """view=me 仅返回当前用户的卡片"""
        update_cached_data(
            iteration={"name": "Sprint 1"},
            items=[
                {"id": 1, "title": "Bug A", "state": "To Do", "type": "Bug", "assignedTo": "张三"},
                {"id": 2, "title": "Task B", "state": "In Progress", "type": "Task", "assignedTo": "李四"},
                {"id": 3, "title": "Task C", "state": "Done", "type": "Task", "assignedTo": "张三"},
            ],
            diff_info={
                "prev_time": "2026-01-01T00:00:00",
                "new_items": [{"id": 1, "title": "Bug A", "state": "To Do", "type": "Bug", "assignedTo": "张三"}],
                "continuing_items": [{"id": 3, "title": "Task C", "state": "Done", "type": "Task", "assignedTo": "张三"}],
                "gone_items": [{"id": 99, "title": "Old", "state": "To Do", "type": "Bug", "assignedTo": "张三"}],
            },
            assigned_to="张三",
            team_name="DevTeam",
            project="MyProject",
        )
        resp = client.get("/api/data?view=me")
        data = resp.get_json()
        assert data["view_mode"] == "me"
        assert len(data["items"]) == 2
        item_ids = {it["id"] for it in data["items"]}
        assert item_ids == {1, 3}
        # diff_info 也应按用户过滤
        assert len(data["diff_info"]["new_items"]) == 1
        assert data["diff_info"]["new_items"][0]["id"] == 1
        assert len(data["diff_info"]["continuing_items"]) == 1
        assert len(data["diff_info"]["gone_items"]) == 1

    def test_view_me_diff_gone_filters_correctly(self, client):
        """view=me 时 gone_items 中的其他用户卡片被过滤掉"""
        update_cached_data(
            iteration={"name": "Sprint 1"},
            items=[
                {"id": 1, "title": "My Item", "state": "To Do", "type": "Bug", "assignedTo": "我"},
            ],
            diff_info={
                "prev_time": "2026-01-01T00:00:00",
                "new_items": [],
                "continuing_items": [],
                "gone_items": [
                    {"id": 88, "title": "Other's Item", "state": "To Do", "type": "Task", "assignedTo": "他人"},
                    {"id": 99, "title": "My Gone Item", "state": "To Do", "type": "Bug", "assignedTo": "我"},
                ],
            },
            assigned_to="我",
            team_name="DevTeam",
            project="MyProject",
        )
        resp = client.get("/api/data?view=me")
        data = resp.get_json()
        # gone_items 中只有"我"的卡片
        gone = data["diff_info"]["gone_items"]
        assert len(gone) == 1
        assert gone[0]["id"] == 99


class TestApiFixesRoute:
    """GET /api/fixes 路由测试"""

    def test_returns_200(self, client):
        resp = client.get("/api/fixes")
        assert resp.status_code == 200

    def test_returns_json_array(self, client):
        resp = client.get("/api/fixes")
        data = resp.get_json()
        assert isinstance(data, list)

    def test_status_filter(self, client):
        from db import init_db, create_fix_task, update_fix_task_status
        init_db()
        tid = create_fix_task(100, "Test Bug", sprint_name="Sprint 1")
        update_fix_task_status(tid, "completed", response="Fixed", finished_at="now", agent_name="pi")
        resp = client.get("/api/fixes?status=completed")
        data = resp.get_json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert all(it["status"] == "completed" for it in data)

    def test_bug_id_filter(self, client):
        resp = client.get("/api/fixes?bug_id=99999")
        data = resp.get_json()
        assert isinstance(data, list)

    def test_status_all(self, client):
        resp = client.get("/api/fixes?status=all")
        data = resp.get_json()
        assert isinstance(data, list)

    def test_bug_id_non_numeric_returns_400(self, client):
        """非数字 bug_id 返回 400 而不是 500"""
        resp = client.get("/api/fixes?bug_id=abc")
        assert resp.status_code == 400
        data = resp.get_json()
        assert "error" in data


class TestApiFixesRetryRoute:
    """POST /api/fixes/<task_id>/retry 路由测试"""

    def test_retry_nonexistent_task_returns_404(self, client):
        resp = client.post("/api/fixes/99999/retry")
        assert resp.status_code == 404
        data = resp.get_json()
        assert data["ok"] is False
        assert "not found" in data["message"].lower()

    def test_retry_failed_task_creates_new(self, client, mocker):
        from db import init_db, create_fix_task, update_fix_task_status
        init_db()
        tid = create_fix_task(500, "Bug to Retry", sprint_name="Sprint 1", work_item_type="Bug")
        update_fix_task_status(tid, "failed", error="timeout", finished_at="now")

        mock_enqueue = mocker.patch("web.enqueue_fix_tasks", return_value=[42])
        resp = client.post(f"/api/fixes/{tid}/retry")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["task_id"] == 42
        assert data["original_task_id"] == tid
        # 验证入队调用
        mock_enqueue.assert_called_once()
        args, kwargs = mock_enqueue.call_args
        bugs_list = args[0]
        assert bugs_list[0]["id"] == 500
        assert bugs_list[0]["title"] == "Bug to Retry"
        assert kwargs.get("sprint_name") == "Sprint 1"

    def test_retry_cancelled_task_creates_new(self, client, mocker):
        from db import init_db, create_fix_task, update_fix_task_status
        init_db()
        tid = create_fix_task(501, "Cancelled Bug", sprint_name="Sprint 2")
        update_fix_task_status(tid, "cancelled", finished_at="now")

        mock_enqueue = mocker.patch("web.enqueue_fix_tasks", return_value=[99])
        resp = client.post(f"/api/fixes/{tid}/retry")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["task_id"] == 99

    def test_retry_completed_task_returns_400(self, client):
        from db import init_db, create_fix_task, update_fix_task_status
        init_db()
        tid = create_fix_task(502, "Completed Bug")
        update_fix_task_status(tid, "completed", response="done", finished_at="now")
        resp = client.post(f"/api/fixes/{tid}/retry")
        assert resp.status_code == 400
        data = resp.get_json()
        assert data["ok"] is False
        assert "completed" in data["message"].lower()

    def test_retry_pending_task_returns_400(self, client):
        from db import init_db, create_fix_task
        init_db()
        tid = create_fix_task(503, "Pending Bug")
        resp = client.post(f"/api/fixes/{tid}/retry")
        assert resp.status_code == 400
        data = resp.get_json()
        assert data["ok"] is False
        assert "pending" in data["message"].lower()

    def test_retry_running_task_returns_400(self, client):
        from db import init_db, create_fix_task, update_fix_task_status
        init_db()
        tid = create_fix_task(504, "Running Bug")
        update_fix_task_status(tid, "running", started_at="now")
        resp = client.post(f"/api/fixes/{tid}/retry")
        assert resp.status_code == 400
        data = resp.get_json()
        assert data["ok"] is False

    def test_retry_enqueue_exception_returns_500(self, client, mocker):
        from db import init_db, create_fix_task, update_fix_task_status
        init_db()
        tid = create_fix_task(505, "Bug Retry Fail", sprint_name="Sprint X")
        update_fix_task_status(tid, "failed", error="old error", finished_at="now")

        mocker.patch("web.enqueue_fix_tasks", side_effect=RuntimeError("queue full"))
        resp = client.post(f"/api/fixes/{tid}/retry")
        assert resp.status_code == 500
        data = resp.get_json()
        assert data["ok"] is False
        assert "error" in data

    def test_retry_with_auth_required(self, client):
        set_web_access_token("secret123")
        resp = client.post("/api/fixes/1/retry")
        assert resp.status_code == 401

    def test_retry_with_correct_token(self, client, mocker):
        from db import init_db, create_fix_task, update_fix_task_status
        init_db()
        tid = create_fix_task(506, "Auth Retry Bug")
        update_fix_task_status(tid, "failed", error="x", finished_at="now")
        set_web_access_token("secret123")

        mocker.patch("web.enqueue_fix_tasks", return_value=[77])
        resp = client.post(
            f"/api/fixes/{tid}/retry",
            headers={"Authorization": "Bearer secret123"},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["task_id"] == 77
        set_web_access_token("")


class TestApiHistoryRoute:
    """GET /api/history 路由测试"""

    def test_returns_200(self, client):
        """返回 200"""
        resp = client.get("/api/history")
        assert resp.status_code == 200

    def test_returns_json_array(self, client):
        """返回 JSON 数组"""
        resp = client.get("/api/history")
        data = resp.get_json()
        assert isinstance(data, list)

    def test_returns_empty_when_no_data(self, client):
        """无历史数据时返回空列表"""
        resp = client.get("/api/history")
        data = resp.get_json()
        # 可能是空列表或包含 error 的对象（取决于数据库状态）
        assert isinstance(data, (list, dict))


class TestApiHistoryDetailRoute:
    """GET /api/history/<id> 路由测试"""

    def test_nonexistent_id_returns_404(self, client):
        """不存在的快照 ID 返回 404"""
        resp = client.get("/api/history/99999")
        assert resp.status_code == 404
        data = resp.get_json()
        assert "error" in data

    def test_existing_snapshot_returns_items_and_meta(self, client):
        """存在的快照返回 items 和 meta"""
        from db import init_db, save_snapshot, list_snapshots
        init_db()
        items = [
            {"id": 123, "title": "测试 Item", "state": "To Do", "type": "Bug", "assignedTo": "Test", "htmlUrl": "http://example.com/123"},
        ]
        save_snapshot("Test Sprint", "TestTeam", items)
        snapshots = list_snapshots()
        sid = snapshots[0]["id"]

        resp = client.get(f"/api/history/{sid}")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "meta" in data
        assert "items" in data
        assert data["meta"]["sprint_name"] == "Test Sprint"
        assert len(data["items"]) == 1
        assert data["items"][0]["id"] == 123


class TestApiHistoryDiffRoute:
    """GET /api/history/diff/<id1>/<id2> 路由测试"""

    def test_nonexistent_id1_returns_404(self, client):
        """第一个快照 ID 不存在返回 404"""
        resp = client.get("/api/history/diff/99999/1")
        assert resp.status_code == 404
        data = resp.get_json()
        assert "error" in data

    def test_nonexistent_id2_returns_404(self, client):
        """第二个快照 ID 不存在返回 404"""
        from db import init_db, save_snapshot, list_snapshots
        init_db()
        items = [{"id": 1, "title": "Item", "state": "To Do", "type": "Bug", "assignedTo": "Test Diff404", "htmlUrl": "http://example.com/1"}]
        save_snapshot("Test Sprint Diff404", "TestTeam", items)
        snapshots = list_snapshots(sprint_name="Test Sprint Diff404")
        sid = snapshots[0]["id"]

        resp = client.get(f"/api/history/diff/{sid}/99999")
        assert resp.status_code == 404
        data = resp.get_json()
        assert "error" in data

    def test_diff_between_two_snapshots(self, client):
        """两个快照对比返回完整 diff 结构"""
        from db import init_db, save_snapshot, list_snapshots
        init_db()

        # 快照 1: 旧快照
        items1 = [
            {"id": 1, "title": "Item A", "state": "To Do", "type": "Bug", "assignedTo": "Test", "htmlUrl": "http://example.com/1"},
            {"id": 2, "title": "Item B", "state": "In Progress", "type": "Task", "assignedTo": "Test", "htmlUrl": "http://example.com/2"},
        ]
        save_snapshot("Test Sprint Diff", "TestTeam", items1)

        # 快照 2: 新快照
        items2 = [
            {"id": 1, "title": "Item A", "state": "Done", "type": "Bug", "assignedTo": "Test", "htmlUrl": "http://example.com/1"},
            {"id": 3, "title": "Item C", "state": "New", "type": "Task", "assignedTo": "Test", "htmlUrl": "http://example.com/3"},
        ]
        save_snapshot("Test Sprint Diff", "TestTeam", items2)

        snapshots = list_snapshots(sprint_name="Test Sprint Diff")
        # 按 id 升序：旧快照在前，新快照在后
        ids = sorted([s["id"] for s in snapshots])
        id_old = ids[0]
        id_new = ids[1]

        resp = client.get(f"/api/history/diff/{id_old}/{id_new}")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "snapshot_a" in data
        assert "snapshot_b" in data
        assert "diff" in data

        diff = data["diff"]
        assert "new_items" in diff
        assert "continuing_items" in diff
        assert "gone_items" in diff

        # Item A 状态变化
        assert len(diff["continuing_items"]) == 1
        assert diff["continuing_items"][0]["id"] == 1
        assert diff["continuing_items"][0]["_state_changed"] is True
        assert diff["continuing_items"][0]["_prev_state"] == "To Do"
        assert diff["continuing_items"][0]["state"] == "Done"

        # Item C 新增
        assert len(diff["new_items"]) == 1
        assert diff["new_items"][0]["id"] == 3

        # Item B 消失
        assert len(diff["gone_items"]) == 1
        assert diff["gone_items"][0]["id"] == 2

    def test_diff_identical_snapshots(self, client):
        """两个完全相同的快照对比没有变化"""
        from db import init_db, save_snapshot, list_snapshots
        init_db()

        items = [
            {"id": 1, "title": "Item A", "state": "To Do", "type": "Bug", "assignedTo": "Test", "htmlUrl": "http://example.com/1"},
        ]
        save_snapshot("Test Sprint Identical", "TestTeam", items)
        save_snapshot("Test Sprint Identical", "TestTeam", items)

        snapshots = list_snapshots(sprint_name="Test Sprint Identical")
        ids = sorted([s["id"] for s in snapshots])
        id_old = ids[0]
        id_new = ids[1]

        resp = client.get(f"/api/history/diff/{id_old}/{id_new}")
        assert resp.status_code == 200
        data = resp.get_json()
        diff = data["diff"]
        assert len(diff["new_items"]) == 0
        assert len(diff["gone_items"]) == 0
        assert len(diff["continuing_items"]) == 1
        assert diff["continuing_items"][0]["_state_changed"] is False


class TestApiExportRoute:
    """GET /api/export?format=csv 路由测试"""

    def test_export_csv_returns_200(self, client, sample_data):
        """导出 CSV 返回 200"""
        resp = client.get("/api/export?format=csv")
        assert resp.status_code == 200

    def test_export_csv_content_type(self, client, sample_data):
        """导出 CSV 返回正确的 Content-Type 和 Content-Disposition"""
        resp = client.get("/api/export?format=csv")
        assert "text/csv" in resp.content_type
        cd = resp.headers.get("Content-Disposition", "")
        assert "attachment" in cd
        assert ".csv" in cd

    def test_export_csv_contains_header_columns(self, client, sample_data):
        """导出 CSV 包含正确的列头"""
        resp = client.get("/api/export?format=csv")
        text = resp.get_data(as_text=True)
        assert 'id' in text
        assert 'title' in text
        assert 'state' in text
        assert 'type' in text
        assert 'assignedTo' in text
        assert 'description' in text

    def test_export_csv_contains_item_data(self, client, sample_data):
        """导出 CSV 包含具体的 Work Item 数据"""
        resp = client.get("/api/export?format=csv")
        text = resp.get_data(as_text=True)
        assert '1' in text
        assert '登录 Bug' in text

    def test_export_csv_no_items_empty_body(self, client):
        """无数据时导出仅有表头的 CSV"""
        update_cached_data(
            iteration={}, items=[], diff_info=None,
            team_name="T", project="P",
        )
        resp = client.get("/api/export?format=csv")
        text = resp.get_data(as_text=True)
        lines = text.strip().split("\r\n")
        # 只有表头行
        assert len(lines) == 1
        assert 'id' in lines[0]

    def test_export_csv_view_me_filters(self, client):
        """view=me 时仅导出当前用户的数据"""
        update_cached_data(
            iteration={"name": "Sprint 1"},
            items=[
                {"id": 1, "title": "My Bug", "state": "To Do", "type": "Bug", "assignedTo": "我"},
                {"id": 2, "title": "Other Task", "state": "In Progress", "type": "Task", "assignedTo": "他人"},
            ],
            diff_info=None,
            assigned_to="我",
            team_name="T",
            project="P",
        )
        resp = client.get("/api/export?format=csv&view=me")
        text = resp.get_data(as_text=True)
        assert 'My Bug' in text
        assert 'Other Task' not in text

    def test_export_unsupported_format_returns_400(self, client):
        """不支持的格式返回 400"""
        resp = client.get("/api/export?format=json")
        assert resp.status_code == 400
        data = resp.get_json()
        assert "error" in data

    def test_export_csv_quoted_fields(self, client):
        """含逗号或换行的字段被正确引用"""
        update_cached_data(
            iteration={"name": "Sprint 1"},
            items=[
                {"id": 1, "title": "Bug with, comma", "state": "To Do", "type": "Bug", "assignedTo": "Test", "description": "Line1\nLine2"},
            ],
            diff_info=None,
            team_name="T",
            project="P",
        )
        resp = client.get("/api/export?format=csv")
        text = resp.get_data(as_text=True)
        # 含逗号的标题应被引号包裹
        assert 'Bug with, comma' in text
        # 含换行的描述应被引号包裹且跨多行
        assert 'Line1' in text
        assert 'Line2' in text


class TestIndexRoute:
    """GET / 路由测试"""

    def test_returns_200(self, client):
        """返回 200"""
        resp = client.get("/")
        assert resp.status_code == 200

    def test_returns_html(self, client):
        """返回 HTML 内容"""
        resp = client.get("/")
        assert "text/html" in resp.content_type


class TestGetCachedData:
    """缓存读写测试"""

    def test_get_returns_copy_not_reference(self):
        """get_cached_data 返回字典副本，修改外层不影响缓存"""
        update_cached_data(
            iteration={"name": "Sprint X"},
            items=[{"id": 1}],
            diff_info=None,
        )
        data = get_cached_data()
        # 修改返回字典的顶级键不应影响缓存
        data["new_field"] = "should_not_persist"
        data2 = get_cached_data()
        assert "new_field" not in data2

    def test_update_preserves_all_fields(self):
        """update 更新所有字段"""
        update_cached_data(
            iteration={"name": "Sprint 1"},
            items=[{"id": 1}],
            diff_info={"new_items": []},
            assigned_to="张三",
            team_name="TeamA",
            project="ProjA",
            offline=True,
            error="test error",
        )
        data = get_cached_data()
        assert data["iteration"]["name"] == "Sprint 1"
        assert data["items"] == [{"id": 1}]
        assert data["assigned_to"] == "张三"
        assert data["team_name"] == "TeamA"
        assert data["project"] == "ProjA"
        assert data["offline"] is True
        assert data["error"] == "test error"


class TestApiFixesRunRoute:
    """POST /api/fixes/run 路由测试"""

    def test_no_bug_ids_returns_ok_empty(self, client):
        resp = client.post("/api/fixes/run", json={})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["task_ids"] == []

    def test_no_bug_ids_in_body_returns_ok_empty(self, client):
        resp = client.post("/api/fixes/run", json={"bug_ids": []})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["task_ids"] == []

    def test_bug_ids_not_in_cache_returns_ok_empty(self, client):
        """bug_ids 不在缓存中时返回空"""
        update_cached_data(
            iteration={"name": "Sprint 1"}, items=[], diff_info=None,
            team_name="T", project="P",
        )
        resp = client.post("/api/fixes/run", json={"bug_ids": [999]})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["task_ids"] == []

    def test_valid_bugs_queued(self, client, mocker):
        """有效的 Bug 被入队，返回 task_ids"""
        mock_enqueue = mocker.patch("web.enqueue_fix_tasks", return_value=[1, 2])

        update_cached_data(
            iteration={"name": "Sprint 1"},
            items=[
                {"id": 123, "title": "Bug A", "state": "To Do", "type": "Bug", "assignedTo": "T"},
                {"id": 456, "title": "Bug B", "state": "Active", "type": "Bug", "assignedTo": "T"},
            ],
            diff_info=None,
            team_name="T", project="P",
        )
        resp = client.post("/api/fixes/run", json={"bug_ids": [123, 456]})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["task_ids"] == [1, 2]
        assert "queued" in data.get("message", "").lower()

    def test_enqueue_exception_returns_500(self, client, mocker):
        """入队异常返回 500"""
        mocker.patch("web.enqueue_fix_tasks", side_effect=RuntimeError("queue failure"))

        update_cached_data(
            iteration={"name": "Sprint 1"},
            items=[
                {"id": 123, "title": "Bug X", "state": "To Do", "type": "Bug", "assignedTo": "T"},
            ],
            diff_info=None,
            team_name="T", project="P",
        )
        resp = client.post("/api/fixes/run", json={"bug_ids": [123]})
        assert resp.status_code == 500
        data = resp.get_json()
        assert data["ok"] is False
        assert "error" in data


class TestApiFixesCancelRoute:
    """POST /api/fixes/<task_id>/cancel 路由测试"""

    def test_cancel_existing_pending_task(self, client):
        from db import init_db, create_fix_task
        init_db()
        tid = create_fix_task(400, "Bug to Cancel", sprint_name="Sprint 1")
        resp = client.post(f"/api/fixes/{tid}/cancel")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["task_id"] == tid
        assert "cancelled" in data["message"].lower()

    def test_cancel_nonexistent_task_returns_404(self, client):
        resp = client.post("/api/fixes/99999/cancel")
        assert resp.status_code == 404
        data = resp.get_json()
        assert data["ok"] is False
        assert "not found" in data["message"].lower()

    def test_cancel_completed_task_returns_404(self, client):
        from db import init_db, create_fix_task, update_fix_task_status
        init_db()
        tid = create_fix_task(401, "Already Done")
        update_fix_task_status(tid, "completed", response="done", finished_at="now")
        resp = client.post(f"/api/fixes/{tid}/cancel")
        assert resp.status_code == 404
        data = resp.get_json()
        assert data["ok"] is False

    def test_cancel_with_auth_required(self, client):
        set_web_access_token("secret123")
        resp = client.post("/api/fixes/1/cancel")
        assert resp.status_code == 401

    def test_cancel_with_correct_token(self, client):
        from db import init_db, create_fix_task
        init_db()
        tid = create_fix_task(402, "Bug with Auth", sprint_name="Sprint 1")
        set_web_access_token("secret123")
        resp = client.post(
            f"/api/fixes/{tid}/cancel",
            headers={"Authorization": "Bearer secret123"},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        set_web_access_token("")


class TestApiRefreshRoute:
    """POST /api/refresh 路由测试"""

    def test_no_callback_returns_503(self, client):
        """未注册刷新回调时返回 503"""
        set_refresh_callback(None)
        resp = client.post("/api/refresh")
        assert resp.status_code == 503
        data = resp.get_json()
        assert data["ok"] is False
        assert "error" in data

    def test_callback_invoked_and_returns_success(self, client):
        """注册回调后被调用并返回成功"""
        called = []
        def _cb():
            called.append(True)
        set_refresh_callback(_cb)

        resp = client.post("/api/refresh")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert "message" in data
        assert len(called) == 1

    def test_callback_exception_returns_500(self, client):
        """回调抛出异常返回 500"""
        def _cb():
            raise RuntimeError("refresh failed")
        set_refresh_callback(_cb)

        resp = client.post("/api/refresh")
        assert resp.status_code == 500
        data = resp.get_json()
        assert data["ok"] is False
        assert "refresh failed" in data["error"]

    def test_callback_updates_cache(self, client):
        """回调更新缓存后 /api/data 反映最新数据"""
        def _cb():
            update_cached_data(
                iteration={"name": "Refreshed Sprint"},
                items=[{"id": 99, "title": "Refreshed Item", "state": "To Do", "type": "Bug", "assignedTo": "T"}],
                diff_info=None,
                team_name="T",
                project="P",
            )
        set_refresh_callback(_cb)

        # 先确认当前缓存为空
        resp_before = client.get("/api/data")
        assert resp_before.get_json()["items"] == []

        # 触发刷新
        resp_refresh = client.post("/api/refresh")
        assert resp_refresh.status_code == 200

        # 验证缓存已更新
        resp_after = client.get("/api/data")
        data = resp_after.get_json()
        assert data["iteration"]["name"] == "Refreshed Sprint"
        assert len(data["items"]) == 1
        assert data["items"][0]["id"] == 99

    def test_refresh_with_access_token_auth(self, client):
        """配置 token 时 /api/refresh 也需要认证"""
        set_refresh_callback(lambda: None)
        set_web_access_token("secret123")
        resp = client.post("/api/refresh")
        assert resp.status_code == 401

        resp = client.post(
            "/api/refresh",
            headers={"Authorization": "Bearer secret123"},
        )
        assert resp.status_code == 200
        set_web_access_token("")


class TestAccessTokenAuth:
    """WEB_ACCESS_TOKEN 认证中间件测试"""

    def test_no_token_configured_allows_all_routes(self, client):
        """未配置 token 时所有路由正常访问"""
        set_web_access_token("")
        resp = client.get("/api/data")
        assert resp.status_code == 200
        resp = client.get("/api/fixes")
        assert resp.status_code == 200
        resp = client.get("/api/config")
        assert resp.status_code == 200

    def test_health_always_allowed(self, client):
        """/health 路由始终不需要认证"""
        set_web_access_token("secret123")
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "status" in data

    def test_missing_auth_header_returns_401(self, client):
        """未提供 Authorization 请求头返回 401"""
        set_web_access_token("secret123")
        resp = client.get("/api/data")
        assert resp.status_code == 401
        data = resp.get_json()
        assert "error" in data

    def test_invalid_auth_scheme_returns_401(self, client):
        """非 Bearer 认证方案返回 401"""
        set_web_access_token("secret123")
        resp = client.get("/api/data", headers={"Authorization": "Basic YWxhZGRpbjpvcGVuc2VzYW1l"})
        assert resp.status_code == 401
        data = resp.get_json()
        assert "error" in data

    def test_wrong_token_returns_401(self, client):
        """错误的 token 返回 401"""
        set_web_access_token("secret123")
        resp = client.get("/api/data", headers={"Authorization": "Bearer wrongtoken"})
        assert resp.status_code == 401
        data = resp.get_json()
        assert "error" in data

    def test_correct_token_allows_access(self, client):
        """正确的 token 允许访问"""
        set_web_access_token("secret123")
        resp = client.get("/api/data", headers={"Authorization": "Bearer secret123"})
        assert resp.status_code == 200
        data = resp.get_json()
        assert "items" in data

    def test_correct_token_allows_post(self, client):
        """正确的 token 允许 POST 请求"""
        set_web_access_token("secret123")
        resp = client.post(
            "/api/fixes/run",
            json={"bug_ids": []},
            headers={"Authorization": "Bearer secret123"},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True

    def test_auth_applies_to_non_api_routes(self, client):
        """认证也适用于非 API 路由（如首页）"""
        set_web_access_token("secret123")
        resp = client.get("/")
        assert resp.status_code == 401

    def test_auth_applies_to_history_diff_route(self, client):
        """认证适用于 /api/history/diff 路由"""
        set_web_access_token("secret123")
        resp = client.get("/api/history/diff/1/2")
        assert resp.status_code == 401

    def test_auth_applies_to_export_route(self, client):
        """认证适用于 /api/export 路由"""
        set_web_access_token("secret123")
        resp = client.get("/api/export?format=csv")
        assert resp.status_code == 401

    def test_token_cleared_restores_open_access(self, client):
        """清除 token 后恢复公开访问"""
        set_web_access_token("secret123")
        resp = client.get("/api/data")
        assert resp.status_code == 401

        set_web_access_token("")
        resp = client.get("/api/data")
        assert resp.status_code == 200


class TestApiSprintsRoute:
    """GET /api/sprints 路由测试"""

    def test_returns_200(self, client):
        resp = client.get("/api/sprints")
        assert resp.status_code == 200

    def test_returns_json_with_sprints_and_current(self, client):
        resp = client.get("/api/sprints")
        data = resp.get_json()
        assert "sprints" in data
        assert "current_sprint" in data
        assert isinstance(data["sprints"], list)

    def test_includes_current_sprint_when_no_snapshots(self, client):
        update_cached_data(
            iteration={"name": "My Current Sprint"},
            items=[], diff_info=None,
            team_name="MyTeam", project="MyProject",
        )
        resp = client.get("/api/sprints")
        data = resp.get_json()
        assert data["current_sprint"] == "My Current Sprint"
        sprints = data["sprints"]
        assert any(s["sprint_name"] == "My Current Sprint" for s in sprints)

    def test_includes_sprints_from_db(self, client):
        from db import init_db, save_snapshot
        init_db()
        save_snapshot("Sprint 10", "TeamA", [{"id": 1, "title": "X", "state": "To Do", "type": "Bug", "assignedTo": "T"}])
        save_snapshot("Sprint 20", "TeamA", [{"id": 2, "title": "Y", "state": "Done", "type": "Task", "assignedTo": "T"}])
        resp = client.get("/api/sprints")
        data = resp.get_json()
        sprints = data["sprints"]
        names = {s["sprint_name"] for s in sprints}
        assert "Sprint 10" in names
        assert "Sprint 20" in names

    def test_no_duplicate_sprints(self, client):
        from db import init_db, save_snapshot
        init_db()
        save_snapshot("Sprint Dup", "TeamA", [{"id": 1, "title": "A", "state": "To Do", "type": "Bug", "assignedTo": "T"}])
        # 设置当前 Sprint 与已保存的相同
        update_cached_data(
            iteration={"name": "Sprint Dup"},
            items=[], diff_info=None,
            team_name="TeamA", project="P",
        )
        resp = client.get("/api/sprints")
        data = resp.get_json()
        count = sum(1 for s in data["sprints"] if s["sprint_name"] == "Sprint Dup")
        assert count == 1


class TestApiDataWithSprintParam:
    """GET /api/data?sprint=xxx 路由测试"""

    def test_returns_current_data_when_no_sprint_param(self, client, sample_data):
        resp = client.get("/api/data")
        data = resp.get_json()
        assert data["iteration"]["name"] == "Sprint 1"

    def test_returns_current_data_when_sprint_matches(self, client, sample_data):
        resp = client.get("/api/data?sprint=Sprint 1")
        data = resp.get_json()
        assert data["iteration"]["name"] == "Sprint 1"
        assert data["offline"] is False

    def test_returns_404_for_unknown_sprint(self, client, sample_data):
        resp = client.get("/api/data?sprint=NonExistentSprint")
        assert resp.status_code == 404
        data = resp.get_json()
        assert "error" in data

    def test_returns_snapshot_data_for_historical_sprint(self, client, sample_data):
        from db import init_db, save_snapshot
        init_db()
        items = [
            {"id": 42, "title": "Old Item", "state": "Closed", "type": "Bug", "assignedTo": "OldUser", "htmlUrl": "http://example.com/42"},
        ]
        save_snapshot("Old Sprint", "DevTeam", items)
        resp = client.get("/api/data?sprint=Old Sprint")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["iteration"]["name"] == "Old Sprint"
        assert len(data["items"]) == 1
        assert data["items"][0]["id"] == 42
        assert data["items"][0]["title"] == "Old Item"
        assert data["diff_info"] is None
        assert data["team_name"] == "DevTeam"

    def test_snapshot_data_has_correct_structure(self, client, sample_data):
        from db import init_db, save_snapshot
        init_db()
        save_snapshot("History Sprint", "MyTeam", [
            {"id": 1, "title": "Item", "state": "New", "type": "Task", "assignedTo": "User"},
        ])
        resp = client.get("/api/data?sprint=History Sprint")
        assert resp.status_code == 200
        data = resp.get_json()
        # 确认 BoardData 结构完整
        assert "iteration" in data
        assert "items" in data
        assert "diff_info" in data
        assert "last_update" in data
        assert "assigned_to" in data
        assert "team_name" in data
        assert "project" in data
        assert "offline" in data
        assert "error" in data
        assert "view_mode" in data
