"""
通知模块测试：验证桌面通知、Webhook 格式化与触发逻辑
"""
import pytest

from config import Config


# ── _send_desktop 测试 ──

class TestSendDesktop:
    """桌面通知跨平台兼容性测试"""

    def test_linux_notify_send_available(self, mocker):
        """Linux 平台且 notify-send 可用时，调用 notify-send"""
        mocker.patch("platform.system", return_value="Linux")
        mocker.patch("shutil.which", return_value="/usr/bin/notify-send")
        mock_run = mocker.patch("subprocess.run")

        from notifier import _send_desktop
        _send_desktop("Test Title", "Test Body")

        mock_run.assert_called_once()
        args = mock_run.call_args[0][0]
        assert args[0] == "notify-send"
        assert "Test Title" in args
        assert "Test Body" in args
        assert "--app-name=Azure DevOps Monitor" in args

    def test_linux_notify_send_not_available(self, mocker):
        """Linux 平台但 notify-send 不可用时，跳过通知"""
        mocker.patch("platform.system", return_value="Linux")
        mocker.patch("shutil.which", return_value=None)
        mock_run = mocker.patch("subprocess.run")

        from notifier import _send_desktop
        _send_desktop("Test Title", "Test Body")

        mock_run.assert_not_called()

    def test_macos_uses_osascript(self, mocker):
        """macOS 使用 osascript 发送通知"""
        mocker.patch("platform.system", return_value="Darwin")
        mocker.patch("shutil.which", return_value="/usr/bin/osascript")
        mock_run = mocker.patch("subprocess.run")

        from notifier import _send_desktop
        _send_desktop("Title", "Body content")

        mock_run.assert_called_once()
        args = mock_run.call_args[0][0]
        assert args[0] == "osascript"
        assert "-e" in args
        script_arg = args[args.index("-e") + 1]
        assert "display notification" in script_arg
        assert "Title" in script_arg
        assert "Body content" in script_arg

    def test_windows_uses_powershell(self, mocker):
        """Windows 使用 PowerShell 发送 toast 通知"""
        mocker.patch("platform.system", return_value="Windows")
        mock_run = mocker.patch("subprocess.run")

        from notifier import _send_desktop
        _send_desktop("Win Title", "Win Body")

        mock_run.assert_called_once()
        args = mock_run.call_args[0][0]
        assert "powershell" in args[0]

    def test_unknown_os_skips(self, mocker):
        """未知操作系统跳过桌面通知"""
        mocker.patch("platform.system", return_value="FreeBSD")
        mock_run = mocker.patch("subprocess.run")

        from notifier import _send_desktop
        _send_desktop("Title", "Body")

        mock_run.assert_not_called()

    def test_exception_handled_gracefully(self, mocker):
        """子进程异常时优雅降级"""
        mocker.patch("platform.system", return_value="Linux")
        mocker.patch("shutil.which", return_value="/usr/bin/notify-send")
        mock_run = mocker.patch("subprocess.run", side_effect=Exception("进程崩溃"))
        mock_logger = mocker.patch("notifier.logger.warning")

        from notifier import _send_desktop
        _send_desktop("Title", "Body")

        mock_logger.assert_called_once()
        assert "桌面通知发送失败" in mock_logger.call_args[0][0]


# ── _send_webhook 测试 ──

class TestSendWebhook:
    """Webhook 通知测试"""

    def test_successful_webhook(self, mocker):
        """成功发送 Webhook 通知"""
        mock_post = mocker.patch("requests.post")
        mock_resp = mocker.MagicMock()
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp
        mock_logger = mocker.patch("notifier.logger.info")

        from notifier import _send_webhook
        _send_webhook("https://hooks.example.com/webhook", {"text": "hello"})

        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args[1]
        assert call_kwargs["json"] == {"text": "hello"}
        assert call_kwargs["timeout"] == 10
        assert call_kwargs["headers"]["Content-Type"] == "application/json"
        mock_logger.assert_called_once()
        assert "已发送" in mock_logger.call_args[0][0]

    def test_webhook_http_error(self, mocker):
        """Webhook 返回非 2xx 状态码时记录警告"""
        mock_post = mocker.patch("requests.post")
        mock_resp = mocker.MagicMock()
        mock_resp.status_code = 400
        mock_resp.text = "Bad Request"
        mock_post.return_value = mock_resp
        mock_logger = mocker.patch("notifier.logger.warning")

        from notifier import _send_webhook
        _send_webhook("https://hooks.example.com/webhook", {"text": "hello"})

        mock_logger.assert_called_once()
        # logger.warning 使用 % 格式化，mock 直接接收原始参数
        assert mock_logger.call_args[0][0] == "Webhook 通知失败: HTTP %d, %s"
        assert mock_logger.call_args[0][1] == 400

    def test_webhook_exception_handled(self, mocker):
        """Webhook 请求异常时优雅降级"""
        mock_post = mocker.patch("requests.post", side_effect=Exception("网络错误"))
        mock_logger = mocker.patch("notifier.logger.warning")

        from notifier import _send_webhook
        _send_webhook("https://hooks.example.com/webhook", {"text": "hello"})

        mock_logger.assert_called_once()
        assert "Webhook 通知发送异常" in mock_logger.call_args[0][0]


# ── notify_pr_created 测试 ──

class TestNotifyPrCreated:
    """PR 创建通知测试"""

    def test_desktop_only(self, mocker):
        """仅桌面通知时发送桌面，不发送 Webhook"""
        mock_desktop = mocker.patch("notifier._send_desktop")
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_pr_created

        cfg = _make_config(NOTIFY_DESKTOP=True, NOTIFY_WEBHOOK_URL="")
        notify_pr_created({"title": "登录Bug", "id": 42}, "my-repo",
                         "https://dev.azure.com/org/_git/my-repo/pullrequest/1",
                         42, cfg)

        mock_desktop.assert_called_once()
        title, body = mock_desktop.call_args[0][0], mock_desktop.call_args[0][1]
        assert "AB#42" in title
        assert "my-repo" in body
        assert "登录Bug" in body
        assert "dev.azure.com" in body
        mock_webhook.assert_not_called()

    def test_webhook_only(self, mocker):
        """仅 Webhook 时发送 Webhook，不发送桌面"""
        mock_desktop = mocker.patch("notifier._send_desktop")
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_pr_created

        cfg = _make_config(NOTIFY_DESKTOP=False, NOTIFY_WEBHOOK_URL="https://hooks.example.com/webhook")
        notify_pr_created({"title": "修复权限", "id": 99}, "auth-svc",
                         "https://dev.azure.com/org/_git/auth-svc/pullrequest/7",
                         99, cfg)

        mock_desktop.assert_not_called()
        mock_webhook.assert_called_once()
        payload = mock_webhook.call_args[0][1]
        att = payload["attachments"][0]
        assert att["color"] == "#6366f1"
        assert "AB#99" in att["title"]
        assert "修复权限" in att["text"]
        assert "auth-svc" in att["text"]
        assert "|修复权限" in att["text"]  # Slack link format
        assert att["fields"][0]["value"] == "auth-svc"

    def test_both_enabled(self, mocker):
        """桌面和 Webhook 都启用时两者都发送"""
        mock_desktop = mocker.patch("notifier._send_desktop")
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_pr_created

        cfg = _make_config(NOTIFY_DESKTOP=True, NOTIFY_WEBHOOK_URL="https://hooks.example.com/webhook")
        notify_pr_created({"title": "全渠道通知", "id": 1}, "core",
                         "https://dev.azure.com/org/_git/core/pullrequest/1",
                         1, cfg)

        mock_desktop.assert_called_once()
        mock_webhook.assert_called_once()

    def test_neither_enabled_no_notification(self, mocker):
        """桌面和 Webhook 都未启用时不发送通知"""
        mock_desktop = mocker.patch("notifier._send_desktop")
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_pr_created

        cfg = _make_config(NOTIFY_DESKTOP=False, NOTIFY_WEBHOOK_URL="")
        notify_pr_created({"title": "静默", "id": 0}, "silent",
                         "https://dev.azure.com/org/_git/silent/pullrequest/0",
                         0, cfg)

        mock_desktop.assert_not_called()
        mock_webhook.assert_not_called()

    def test_default_config_when_none_passed(self, mocker):
        """未传 config 时内部创建 Config 实例（不崩溃）"""
        mock_desktop = mocker.patch("notifier._send_desktop")
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_pr_created

        # 未传 config，内部 Config() 会读取环境变量
        notify_pr_created({"title": "默认配置", "id": 7}, "default-repo",
                         "https://dev.azure.com/org/_git/default-repo/pullrequest/7",
                         7)

        # 环境变量中 NOTIFY_DESKTOP/NOTIFY_WEBHOOK_URL 未设置，所以不发
        mock_desktop.assert_not_called()
        mock_webhook.assert_not_called()


# ── notify_changes 测试 ──


def _make_iteration(name="Sprint 1", start="2026-01-01", finish="2026-01-15"):
    return {
        "name": name,
        "startDate": f"{start}T00:00:00Z",
        "finishDate": f"{finish}T00:00:00Z",
    }


def _make_item(item_id, title="Test", state="To Do", item_type="Bug", html_url=None):
    item = {
        "id": item_id,
        "title": title,
        "state": state,
        "type": item_type,
    }
    if html_url is not None:
        item["htmlUrl"] = html_url
    else:
        item["htmlUrl"] = f"https://dev.azure.com/testorg/testproject/_workitems/edit/{item_id}"
    return item


def _make_config(**kwargs):
    """创建测试用 Config"""
    return Config(
        ORG="testorg",
        PROJECT="testproject",
        PAT="testpat",
        **kwargs,
    )


class TestNotifyChanges:
    """notify_changes 集成逻辑测试"""

    def test_no_changes_no_notification(self, mocker):
        """无变化时不发送任何通知"""
        mock_desktop = mocker.patch("notifier._send_desktop")
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_changes

        diff_info = {
            "new_items": [],
            "continuing_items": [],
            "gone_items": [],
        }
        cfg = _make_config(NOTIFY_DESKTOP=True, NOTIFY_WEBHOOK_URL="https://hooks.example.com/webhook")
        notify_changes(diff_info, _make_iteration(), cfg)

        mock_desktop.assert_not_called()
        mock_webhook.assert_not_called()

    def test_only_new_items(self, mocker):
        """仅新增项时触发通知"""
        mock_desktop = mocker.patch("notifier._send_desktop")
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_changes

        diff_info = {
            "new_items": [_make_item(1, title="登录Bug"), _make_item(2, title="首页优化")],
            "continuing_items": [],
            "gone_items": [],
        }
        cfg = _make_config(NOTIFY_DESKTOP=True, NOTIFY_WEBHOOK_URL="https://hooks.example.com/webhook")
        notify_changes(diff_info, _make_iteration(), cfg)

        mock_desktop.assert_called_once()
        desktop_args = mock_desktop.call_args[0]
        assert "新增" in desktop_args[1]

        mock_webhook.assert_called_once()
        payload = mock_webhook.call_args[0][1]
        attachments = payload["attachments"][0]
        assert attachments["color"] == "#22c55e"  # green for new items
        assert "新增" in attachments["text"]
        # 验证新增 item 详情链接
        assert "登录Bug" in attachments["text"]
        assert "首页优化" in attachments["text"]
        assert "/_workitems/edit/1" in attachments["text"]
        assert "/_workitems/edit/2" in attachments["text"]

    def test_only_changed_items(self, mocker):
        """仅状态变化时触发通知"""
        mock_desktop = mocker.patch("notifier._send_desktop")
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_changes

        continuing = [
            {**_make_item(1, state="In Progress"), "_state_changed": True, "_prev_state": "To Do"},
            {**_make_item(2, state="Done"), "_state_changed": True, "_prev_state": "In Progress"},
        ]
        diff_info = {
            "new_items": [],
            "continuing_items": continuing,
            "gone_items": [],
        }
        cfg = _make_config(NOTIFY_DESKTOP=True, NOTIFY_WEBHOOK_URL="https://hooks.example.com/webhook")
        notify_changes(diff_info, _make_iteration(), cfg)

        mock_desktop.assert_called_once()
        desktop_body = mock_desktop.call_args[0][1]
        assert "状态变化" in desktop_body

        mock_webhook.assert_called_once()
        payload = mock_webhook.call_args[0][1]
        attachments = payload["attachments"][0]
        assert attachments["color"] == "#eab308"  # yellow for changes

    def test_only_gone_items(self, mocker):
        """仅消失项时触发通知"""
        mock_desktop = mocker.patch("notifier._send_desktop")
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_changes

        diff_info = {
            "new_items": [],
            "continuing_items": [],
            "gone_items": [_make_item(1, state="Done")],
        }
        cfg = _make_config(NOTIFY_DESKTOP=True, NOTIFY_WEBHOOK_URL="https://hooks.example.com/webhook")
        notify_changes(diff_info, _make_iteration(), cfg)

        mock_desktop.assert_called_once()
        desktop_body = mock_desktop.call_args[0][1]
        assert "消失" in desktop_body

        mock_webhook.assert_called_once()
        payload = mock_webhook.call_args[0][1]
        attachments = payload["attachments"][0]
        assert attachments["color"] == "#ef4444"  # red for gone

    def test_mixed_changes(self, mocker):
        """混合变化时通知包含所有类型"""
        mock_desktop = mocker.patch("notifier._send_desktop")
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_changes

        continuing = [
            {**_make_item(1, state="In Progress"), "_state_changed": True, "_prev_state": "To Do"},
        ]
        diff_info = {
            "new_items": [_make_item(2, state="New")],
            "continuing_items": continuing,
            "gone_items": [_make_item(3, state="Done")],
        }
        cfg = _make_config(NOTIFY_DESKTOP=True, NOTIFY_WEBHOOK_URL="https://hooks.example.com/webhook")
        notify_changes(diff_info, _make_iteration(), cfg)

        mock_desktop.assert_called_once()
        desktop_body = mock_desktop.call_args[0][1]
        assert "新增" in desktop_body
        assert "状态变化" in desktop_body
        assert "消失" in desktop_body

        # 有消失项时颜色为红色
        payload = mock_webhook.call_args[0][1]
        attachments = payload["attachments"][0]
        assert attachments["color"] == "#ef4444"

    def test_desktop_only(self, mocker):
        """仅启用桌面通知时，不触发 Webhook"""
        mock_desktop = mocker.patch("notifier._send_desktop")
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_changes

        diff_info = {
            "new_items": [_make_item(1)],
            "continuing_items": [],
            "gone_items": [],
        }
        cfg = _make_config(NOTIFY_DESKTOP=True, NOTIFY_WEBHOOK_URL="")
        notify_changes(diff_info, _make_iteration(), cfg)

        mock_desktop.assert_called_once()
        mock_webhook.assert_not_called()

    def test_webhook_only(self, mocker):
        """仅启用 Webhook 时，不触发桌面通知"""
        mock_desktop = mocker.patch("notifier._send_desktop")
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_changes

        diff_info = {
            "new_items": [_make_item(1)],
            "continuing_items": [],
            "gone_items": [],
        }
        cfg = _make_config(NOTIFY_DESKTOP=False, NOTIFY_WEBHOOK_URL="https://hooks.example.com/webhook")
        notify_changes(diff_info, _make_iteration(), cfg)

        mock_desktop.assert_not_called()
        mock_webhook.assert_called_once()

    def test_neither_enabled_no_notification(self, mocker):
        """桌面和 Webhook 都未启用时不发送任何通知"""
        mock_desktop = mocker.patch("notifier._send_desktop")
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_changes

        diff_info = {
            "new_items": [_make_item(1), _make_item(2), _make_item(3)],
            "continuing_items": [],
            "gone_items": [],
        }
        cfg = _make_config(NOTIFY_DESKTOP=False, NOTIFY_WEBHOOK_URL="")
        notify_changes(diff_info, _make_iteration(), cfg)

        mock_desktop.assert_not_called()
        mock_webhook.assert_not_called()

    def test_title_includes_project_and_sprint(self, mocker):
        """通知标题包含项目名和 Sprint 名"""
        mock_desktop = mocker.patch("notifier._send_desktop")

        from notifier import notify_changes

        diff_info = {
            "new_items": [_make_item(1)],
            "continuing_items": [],
            "gone_items": [],
        }
        cfg = _make_config(NOTIFY_DESKTOP=True)
        notify_changes(diff_info, _make_iteration(name="Sprint 42"), cfg, project="AwesomeProject")

        title = mock_desktop.call_args[0][0]
        assert "AwesomeProject" in title
        assert "Sprint 42" in title

    def test_project_from_config_when_not_provided(self, mocker):
        """未显式传 project 时使用 config.PROJECT"""
        mock_desktop = mocker.patch("notifier._send_desktop")

        from notifier import notify_changes

        diff_info = {
            "new_items": [_make_item(1)],
            "continuing_items": [],
            "gone_items": [],
        }
        cfg = _make_config(NOTIFY_DESKTOP=True)
        notify_changes(diff_info, _make_iteration(), cfg)

        title = mock_desktop.call_args[0][0]
        assert "testproject" in title

    def test_webhook_payload_fields(self, mocker):
        """Webhook 负载包含正确的字段"""
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_changes

        continuing = [
            {**_make_item(1, state="Done"), "_state_changed": True, "_prev_state": "To Do"},
        ]
        diff_info = {
            "new_items": [_make_item(2)],
            "continuing_items": continuing,
            "gone_items": [_make_item(3)],
        }
        cfg = _make_config(NOTIFY_WEBHOOK_URL="https://hooks.example.com/webhook")
        notify_changes(diff_info, _make_iteration(name="Q1 Sprint"), cfg)

        payload = mock_webhook.call_args[0][1]
        attachments = payload["attachments"][0]

        assert "title" in attachments
        assert "text" in attachments
        assert "fields" in attachments
        assert "footer" in attachments
        assert "ts" in attachments

        # fields 按新增/状态变化/消失排列
        fields = attachments["fields"]
        assert fields[0]["title"] == "[新增]"
        assert fields[0]["value"] == "1"
        assert fields[1]["title"] == "[状态变化]"
        assert fields[1]["value"] == "1"
        assert fields[2]["title"] == "[消失]"
        assert fields[2]["value"] == "1"

        # footer 包含日期范围
        assert "2026-01-01" in attachments["footer"]
        assert "2026-01-15" in attachments["footer"]

    def test_continuing_without_state_changed_not_counted(self, mocker):
        """状态未变化的持续项不计入 changed_count"""
        mock_desktop = mocker.patch("notifier._send_desktop")

        from notifier import notify_changes

        continuing = [
            {**_make_item(1), "_state_changed": False},
        ]
        diff_info = {
            "new_items": [],
            "continuing_items": continuing,
            "gone_items": [_make_item(2)],
        }
        cfg = _make_config(NOTIFY_DESKTOP=True)
        notify_changes(diff_info, _make_iteration(), cfg)

        body = mock_desktop.call_args[0][1]
        assert "状态变化" not in body
        assert "消失" in body

    def test_webhook_text_includes_top_new_item_links(self, mocker):
        """Webhook text 包含前 5 个新增 item 的标题和链接"""
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_changes

        diff_info = {
            "new_items": [
                _make_item(10, title="修复登录Bug", item_type="Bug"),
                _make_item(11, title="优化首页性能", item_type="Task"),
            ],
            "continuing_items": [],
            "gone_items": [],
        }
        cfg = _make_config(NOTIFY_WEBHOOK_URL="https://hooks.example.com/webhook")
        notify_changes(diff_info, _make_iteration(), cfg)

        payload = mock_webhook.call_args[0][1]
        text = payload["attachments"][0]["text"]
        # Slack markdown 链接格式: <url|label>
        assert "修复登录Bug" in text
        assert "优化首页性能" in text
        assert "/_workitems/edit/10" in text
        assert "/_workitems/edit/11" in text
        assert "<" in text
        assert ">" in text
        assert "|[Bug]" in text
        assert "|[Task]" in text

    def test_webhook_limits_new_items_to_5(self, mocker):
        """超过 5 个新增项时只展示前 5 个"""
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_changes

        new_items = [_make_item(i, title=f"Item_{i}") for i in range(10)]
        diff_info = {
            "new_items": new_items,
            "continuing_items": [],
            "gone_items": [],
        }
        cfg = _make_config(NOTIFY_WEBHOOK_URL="https://hooks.example.com/webhook")
        notify_changes(diff_info, _make_iteration(), cfg)

        payload = mock_webhook.call_args[0][1]
        text = payload["attachments"][0]["text"]
        assert "Item_0" in text
        assert "Item_4" in text
        assert "Item_5" not in text

    def test_webhook_item_without_htmlurl(self, mocker):
        """htmlUrl 缺失时不输出链接，仅显示标题"""
        mock_webhook = mocker.patch("notifier._send_webhook")

        from notifier import notify_changes

        diff_info = {
            "new_items": [
                _make_item(1, title="无链接项", html_url=""),
            ],
            "continuing_items": [],
            "gone_items": [],
        }
        cfg = _make_config(NOTIFY_WEBHOOK_URL="https://hooks.example.com/webhook")
        notify_changes(diff_info, _make_iteration(), cfg)

        payload = mock_webhook.call_args[0][1]
        text = payload["attachments"][0]["text"]
        assert "无链接项" in text
        # 没有 htmlUrl 时不应生成 <url|...> 中的 url 部分
        assert "<http" not in text
