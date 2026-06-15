"""
Azure DevOps 客户端测试：验证 HTML 清洗逻辑和 API 响应解析（通过 mock HTTP）
"""
from unittest.mock import Mock

import pytest
import requests

from azure_devops import _strip_html, AzureDevOpsClient
from config import Config


class TestStripHtml:
    """HTML 清洗逻辑测试"""

    def test_strip_simple_tags(self):
        """去除基础 HTML 标签"""
        html = "<p>这是一段文字</p>"
        assert _strip_html(html) == "这是一段文字"

    def test_strip_br_tags(self):
        """br 标签转换为换行符"""
        html = "第一行<br>第二行<br/>第三行"
        result = _strip_html(html)
        assert "第一行" in result
        assert "第二行" in result
        assert "第三行" in result

    def test_strip_div_tags(self):
        """div 标签转换为换行符"""
        html = "<div>区块一</div><div>区块二</div>"
        result = _strip_html(html)
        assert "区块一" in result
        assert "区块二" in result

    def test_strip_nested_tags(self):
        """嵌套标签正确剥离"""
        html = "<div><p><b>加粗文字</b></p></div>"
        assert _strip_html(html) == "加粗文字"

    def test_html_entities_decoded(self):
        """HTML 实体正确解码"""
        html = "&nbsp;空格 &amp; 和号 &lt; 小于 &gt; 大于 &quot;引号"
        expected = '空格 & 和号 < 小于 > 大于 "引号'
        assert _strip_html(html) == expected

    def test_merge_consecutive_newlines(self):
        """连续空行合并为最多两个换行"""
        html = "<p>A</p><br><br><div>B</div>"
        result = _strip_html(html)
        # 每对相邻元素之间产生一个 \n，去重后保留最多 \n\n
        assert result.count("\n\n") <= 1
        assert result.strip() != ""

    def test_empty_html(self):
        """空 HTML 返回空字符串"""
        assert _strip_html("") == ""

    def test_no_html_plain_text(self):
        """纯文本原样返回"""
        text = "这是一段纯文本，没有标签"
        assert _strip_html(text) == text

    def test_complex_nested_html(self):
        """复杂嵌套 HTML 正确清洗"""
        html = (
            "<div>"
            "<p>段落一</p>"
            "<br/>"
            "<p>段落二<br>包含换行</p>"
            "</div>"
        )
        result = _strip_html(html)
        assert "段落一" in result
        assert "段落二" in result
        assert "包含换行" in result


# ── Mock 辅助函数 ──

def _make_mock_response(status_code=200, json_data=None):
    """创建 mock HTTP 响应"""
    resp = Mock(spec=requests.Response)
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    resp.raise_for_status = Mock()
    return resp


def _make_test_config() -> Config:
    """创建测试用 Config 实例"""
    return Config(
        ORG="myorg",
        PROJECT="myproject",
        PAT="mypat",
        TEAM="MyTeam",
    )


def _make_test_client() -> AzureDevOpsClient:
    """创建带 mock session 的测试用 AzureDevOpsClient"""
    cfg = _make_test_config()
    client = AzureDevOpsClient(config=cfg)
    client._team = "MyTeam"
    client._session = Mock(spec=requests.Session)
    client._session.headers = {}
    return client


class TestGetCurrentIteration:
    """get_current_iteration 解析测试"""

    def test_parse_current_iteration(self):
        """正确解析当前 Sprint 信息"""
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        start = (now - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
        finish = (now + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")

        iteration_response = {
            "value": [
                {
                    "id": "guid-123",
                    "name": "Sprint 1",
                    "path": "MyProject\\Sprint 1",
                    "attributes": {
                        "startDate": start,
                        "finishDate": finish,
                    },
                }
            ]
        }

        client = _make_test_client()
        client._session.request = Mock(return_value=_make_mock_response(
            200, iteration_response
        ))

        result = client.get_current_iteration()
        assert result["id"] == "guid-123"
        assert result["name"] == "Sprint 1"
        assert "startDate" in result
        assert "finishDate" in result

    def test_no_iteration_covers_today(self):
        """没有 Sprint 覆盖今天时抛出 RuntimeError"""
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        # Sprint 日期不在今天范围内
        start = (now + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
        finish = (now + timedelta(days=60)).strftime("%Y-%m-%dT%H:%M:%SZ")

        iteration_response = {
            "value": [
                {
                    "id": "guid-999",
                    "name": "Future Sprint",
                    "path": "MyProject\\Future Sprint",
                    "attributes": {
                        "startDate": start,
                        "finishDate": finish,
                    },
                }
            ]
        }

        client = _make_test_client()
        client._session.request = Mock(return_value=_make_mock_response(
            200, iteration_response
        ))

        with pytest.raises(RuntimeError, match="Sprint 覆盖今天"):
            client.get_current_iteration()


class TestQueryWorkItems:
    """query_work_items 解析测试"""

    def test_query_returns_items(self):
        """WIQL 查询返回正确解析的 Work Items"""
        wiql_response = {
            "workItems": [
                {"id": 1, "url": "https://dev.azure.com/org/proj/_apis/wit/workItems/1"},
                {"id": 2, "url": "https://dev.azure.com/org/proj/_apis/wit/workItems/2"},
            ]
        }

        detail_response = {
            "value": [
                {
                    "id": 1,
                    "fields": {
                        "System.Title": "登录 Bug",
                        "System.State": "To Do",
                        "System.WorkItemType": "Bug",
                        "System.AssignedTo": {"displayName": "张三"},
                        "System.CreatedDate": "2026-06-01T00:00:00Z",
                        "System.Description": "<p>登录出错</p>",
                    },
                },
                {
                    "id": 2,
                    "fields": {
                        "System.Title": "首页优化",
                        "System.State": "Active",
                        "System.WorkItemType": "Task",
                        "System.AssignedTo": {"displayName": "李四"},
                        "System.CreatedDate": "2026-06-02T00:00:00Z",
                        "Microsoft.VSTS.TCM.ReproSteps": "步骤一<br>步骤二",
                    },
                },
            ]
        }

        # request 会被调用两次：WIQL POST + 批量 GET
        call_count = 0

        def side_effect(method, url, **kwargs):
            nonlocal call_count
            call_count += 1
            if method == "POST":
                return _make_mock_response(200, wiql_response)
            else:
                return _make_mock_response(200, detail_response)

        client = _make_test_client()
        client._session.request = Mock(side_effect=side_effect)

        items = client.query_work_items(
            iteration_path="MyProject\\Sprint 1",
            states=["To Do", "Active"],
        )

        assert len(items) == 2
        assert items[0]["id"] == 1
        assert items[0]["title"] == "登录 Bug"
        assert items[0]["state"] == "To Do"
        assert items[0]["type"] == "Bug"
        assert items[0]["assignedTo"] == "张三"
        # HTML 描述被清洗
        assert items[0]["description"] == "登录出错"

        assert items[1]["description"] == "步骤一\n步骤二"

    def test_query_no_items(self):
        """WIQL 返回空列表时 query 返回空列表"""
        wiql_response = {"workItems": []}

        client = _make_test_client()
        client._session.request = Mock(return_value=_make_mock_response(
            200, wiql_response
        ))

        items = client.query_work_items(
            iteration_path="MyProject\\Sprint 1",
        )
        assert items == []

    def test_query_unassigned_item(self):
        """未分配的 Work Item 显示为 Unassigned"""
        wiql_response = {
            "workItems": [
                {"id": 1, "url": "https://dev.azure.com/org/proj/_apis/wit/workItems/1"},
            ]
        }
        detail_response = {
            "value": [
                {
                    "id": 1,
                    "fields": {
                        "System.Title": "无人认领",
                        "System.State": "New",
                        "System.WorkItemType": "Bug",
                        "System.AssignedTo": None,
                        "System.CreatedDate": "2026-06-01T00:00:00Z",
                    },
                },
            ]
        }

        call_count = 0

        def side_effect(method, url, **kwargs):
            nonlocal call_count
            call_count += 1
            if method == "POST":
                return _make_mock_response(200, wiql_response)
            else:
                return _make_mock_response(200, detail_response)

        client = _make_test_client()
        client._session.request = Mock(side_effect=side_effect)

        items = client.query_work_items(
            iteration_path="MyProject\\Sprint 1",
        )
        assert items[0]["assignedTo"] == "Unassigned"


class TestGetMyDisplayName:
    """get_my_display_name 测试"""

    def test_profile_api_success(self):
        """Profile API 成功返回 displayName"""
        response = _make_mock_response(200, {"displayName": "测试用户"})
        client = _make_test_client()
        client._session.request = Mock(return_value=response)
        name = client.get_my_display_name()
        assert name == "测试用户"

    def test_profile_api_fallback_to_connection_data(self):
        """Profile API 失败时回退到 connectionData"""
        profile_resp = _make_mock_response(401, {})
        conn_resp = _make_mock_response(200, {
            "authenticatedUser": {"providerDisplayName": "回退用户"}
        })

        call_count = 0
        responses = [profile_resp, conn_resp]

        def side_effect(method, url, **kwargs):
            nonlocal call_count
            resp = responses[call_count]
            call_count += 1
            return resp

        client = _make_test_client()
        client._session.request = Mock(side_effect=side_effect)
        name = client.get_my_display_name()
        assert name == "回退用户"

    def test_both_methods_fail(self):
        """两种方法都失败时返回 None"""
        client = _make_test_client()
        client._session.request = Mock(return_value=_make_mock_response(500, {}))
        name = client.get_my_display_name()
        assert name is None
