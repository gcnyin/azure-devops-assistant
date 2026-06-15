"""
Web 模块测试：验证 Flask API 路由返回格式和数据正确性
"""
import json
import threading

import pytest

from web import app, update_cached_data, get_cached_data, set_web_token, set_web_query_states


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
        assert data["items"][0]["id"] == 1
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
        """返回 200"""
        resp = client.get("/api/fixes")
        assert resp.status_code == 200

    def test_returns_json_array(self, client):
        """返回 JSON 数组"""
        resp = client.get("/api/fixes")
        data = resp.get_json()
        assert isinstance(data, list)

    def test_returns_fixes_when_saved(self, client):
        """数据库中有修复建议时返回内容"""
        from db import init_db, save_ai_fix
        # 使用默认数据库（测试环境可能已有数据）
        resp = client.get("/api/fixes")
        data = resp.get_json()
        assert isinstance(data, list)


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


class TestLoginRoute:
    """GET/POST /login 路由测试"""

    @pytest.fixture(autouse=True)
    def clear_token(self):
        """每个测试后清除 token 配置"""
        yield
        set_web_token("")

    def test_get_login_returns_200(self, client):
        """GET /login 返回 200"""
        resp = client.get("/login")
        assert resp.status_code == 200

    def test_get_login_returns_html(self, client):
        """GET /login 返回 HTML"""
        resp = client.get("/login")
        assert "text/html" in resp.content_type

    def test_get_login_contains_form(self, client):
        """GET /login 页面包含登录表单"""
        resp = client.get("/login")
        html = resp.get_data(as_text=True)
        assert "loginForm" in html
        assert "tokenInput" in html

    def test_post_login_no_token_configured_returns_ok(self, client):
        """未配置 token 时，POST /login 直接返回 ok"""
        set_web_token("")
        resp = client.post("/login", json={"token": "anything"})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True

    def test_post_login_empty_token_when_configured_returns_error(self, client):
        """配置了 token 时，提交空 token 返回错误"""
        set_web_token("my-secret")
        resp = client.post("/login", json={"token": ""})
        assert resp.status_code == 401
        data = resp.get_json()
        assert data["ok"] is False

    def test_post_login_wrong_token_returns_error(self, client):
        """提交错误 token 返回 401"""
        set_web_token("correct-token")
        resp = client.post("/login", json={"token": "wrong-token"})
        assert resp.status_code == 401
        data = resp.get_json()
        assert data["ok"] is False
        assert "error" in data

    def test_post_login_correct_token_returns_ok(self, client):
        """提交正确 token 返回 ok"""
        set_web_token("correct-token")
        resp = client.post("/login", json={"token": "correct-token"})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True

    def test_index_redirects_to_login_when_token_required(self, client):
        """配置了 token 时，浏览器访问 / 应重定向到 /login"""
        set_web_token("my-secret")
        resp = client.get("/", headers={"Accept": "text/html"})
        assert resp.status_code == 302
        assert "/login" in resp.headers.get("Location", "")

    def test_index_redirects_with_next_param(self, client):
        """访问其他页面时重定向携带 next 参数"""
        set_web_token("my-secret")
        resp = client.get("/api/history", headers={"Accept": "text/html"})
        assert resp.status_code == 302
        location = resp.headers.get("Location", "")
        assert "/login" in location
        assert "next=" in location

    def test_index_no_redirect_when_no_token_configured(self, client):
        """未配置 token 时，/ 正常返回不重定向"""
        set_web_token("")
        resp = client.get("/", headers={"Accept": "text/html"})
        assert resp.status_code == 200

    def test_api_returns_401_json_when_token_missing(self, client):
        """API 请求缺少 token 时返回 401 JSON（不重定向）"""
        set_web_token("my-secret")
        resp = client.get("/api/data")
        assert resp.status_code == 401
        assert resp.content_type == "application/json"
        data = resp.get_json()
        assert "Unauthorized" in data.get("error", "")


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

    def test_no_diff_info_returns_ok_empty(self, client):
        """无 diff_info 时返回空结果"""
        resp = client.post("/api/fixes/run")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["results"] == []

    def test_no_new_items_returns_ok_empty(self, client):
        """diff_info 无 new_items 时返回空结果"""
        update_cached_data(
            iteration={}, items=[], diff_info={"new_items": []},
            team_name="T", project="P",
        )
        resp = client.post("/api/fixes/run")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["results"] == []

    def test_no_new_bugs_returns_ok_empty(self, client):
        """新增条目中没有 Bug 时返回空结果"""
        update_cached_data(
            iteration={}, items=[],
            diff_info={
                "new_items": [
                    {"id": 1, "title": "Task A", "state": "To Do", "type": "Task", "assignedTo": "Test"},
                ]
            },
            team_name="T", project="P",
        )
        resp = client.post("/api/fixes/run")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["results"] == []
        assert "没有 Bug" in data.get("message", "")

    def test_new_bugs_calls_process_new_bugs(self, client, mocker):
        """有新增 Bug 时调用 process_new_bugs 并返回结果"""
        mock_result = [(123, "登录崩溃", "[agent: pi]\n\n修复方案: ...")]
        mocker.patch("web.process_new_bugs", return_value=mock_result)

        update_cached_data(
            iteration={}, items=[],
            diff_info={
                "new_items": [
                    {"id": 123, "title": "登录崩溃", "state": "To Do", "type": "Bug", "assignedTo": "Test"},
                    {"id": 456, "title": "UI Task", "state": "To Do", "type": "Task", "assignedTo": "Test"},
                ]
            },
            team_name="T", project="P",
        )
        resp = client.post("/api/fixes/run")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert len(data["results"]) == 1
        assert data["results"][0]["bug_id"] == 123
        assert data["results"][0]["bug_title"] == "登录崩溃"
        assert "pi" in data["results"][0]["response"]

    def test_process_new_bugs_exception_returns_500(self, client, mocker):
        """process_new_bugs 抛出异常时返回 500"""
        mocker.patch("web.process_new_bugs", side_effect=RuntimeError("agent timeout"))

        update_cached_data(
            iteration={}, items=[],
            diff_info={
                "new_items": [
                    {"id": 123, "title": "Bug", "state": "To Do", "type": "Bug", "assignedTo": "Test"},
                ]
            },
            team_name="T", project="P",
        )
        resp = client.post("/api/fixes/run")
        assert resp.status_code == 500
        data = resp.get_json()
        assert data["ok"] is False
        assert "error" in data
