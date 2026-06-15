"""
通知模块 — 检测到变化时发送桌面通知或 Webhook
"""

import json
import platform
import shutil
import subprocess
from datetime import datetime

import requests

from config import Config
from utils import get_logger

logger = get_logger(__name__)


def _send_desktop(title: str, body: str):
    """发送桌面通知（跨平台）"""
    system = platform.system()
    try:
        if system == "Linux" and shutil.which("notify-send"):
            subprocess.run(
                ["notify-send", title, body, "--app-name=Azure DevOps Monitor"],
                timeout=5,
                capture_output=True,
            )
        elif system == "Darwin":
            script = f'display notification "{body}" with title "{title}"'
            subprocess.run(
                ["osascript", "-e", script],
                timeout=5,
                capture_output=True,
            )
        elif system == "Windows":
            # Windows toast notification via PowerShell
            ps = f'''
            [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
            $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
            $textNodes = $template.GetElementsByTagName("text")
            $textNodes.Item(0).AppendChild($template.CreateTextNode("{title}")) > $null
            $textNodes.Item(1).AppendChild($template.CreateTextNode("{body}")) > $null
            $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
            [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Azure DevOps Monitor").Show($toast)
            '''
            subprocess.run(
                ["powershell", "-Command", ps],
                timeout=10,
                capture_output=True,
            )
        else:
            logger.debug("未知操作系统 %s，跳过桌面通知", system)
    except Exception as e:
        logger.warning("桌面通知发送失败: %s", e)


def _send_webhook(webhook_url: str, payload: dict):
    """发送 Webhook 通知（Slack / Teams 兼容格式）"""
    try:
        resp = requests.post(
            webhook_url,
            json=payload,
            timeout=10,
            headers={"Content-Type": "application/json"},
        )
        if resp.status_code >= 400:
            logger.warning("Webhook 通知失败: HTTP %d, %s", resp.status_code, resp.text)
        else:
            logger.info("Webhook 通知已发送")
    except Exception as e:
        logger.warning("Webhook 通知发送异常: %s", e)


def notify_changes(
    diff_info: dict,
    iteration: dict,
    config: Config,
    project: str = "",
):
    """根据配置检测到变化时发送通知。

    配置项（.env）：
    - NOTIFY_DESKTOP=true      启用桌面通知
    - NOTIFY_WEBHOOK_URL=...   Slack/Teams Webhook URL
    """
    new_count = len(diff_info.get("new_items", []))
    changed_count = sum(1 for it in diff_info.get("continuing_items", []) if it.get("_state_changed"))
    gone_count = len(diff_info.get("gone_items", []))

    total_changes = new_count + changed_count + gone_count
    if total_changes == 0:
        return

    project_label = project or config.PROJECT
    sprint_label = iteration.get("name", "")

    # 构建通知内容
    parts = []
    if new_count:
        parts.append(f"{new_count} 个新增")
    if changed_count:
        parts.append(f"{changed_count} 个状态变化")
    if gone_count:
        parts.append(f"{gone_count} 个消失")

    title = f"Sprint Monitor: {project_label} / {sprint_label}"
    body = f"{', '.join(parts)}  —  {datetime.now().strftime('%H:%M:%S')}"

    # 桌面通知
    if config.NOTIFY_DESKTOP:
        _send_desktop(title, body)

    # Webhook 通知
    if config.NOTIFY_WEBHOOK_URL:
        # Slack 兼容格式
        color = "#eab308"  # yellow for general changes
        if new_count > 0:
            color = "#22c55e"  # green for new items
        if gone_count > 0:
            color = "#ef4444"  # red if items disappeared

        fields = []
        if new_count:
            fields.append({"title": "[新增]", "value": str(new_count), "short": True})
        if changed_count:
            fields.append({"title": "[状态变化]", "value": str(changed_count), "short": True})
        if gone_count:
            fields.append({"title": "[消失]", "value": str(gone_count), "short": True})

        # 前 5 个新增 Work Item 详情链接
        top_new_items = diff_info.get("new_items", [])[:5]
        item_lines = []
        for item in top_new_items:
            wi_title = item.get("title", "N/A")
            wi_url = item.get("htmlUrl", "")
            wi_type = item.get("type", "")
            if wi_url:
                item_lines.append(f"- <{wi_url}|[{wi_type}] {wi_title}>")
            else:
                item_lines.append(f"- [{wi_type}] {wi_title}")

        text = body
        if item_lines:
            text += "\n" + "\n".join(item_lines)

        payload = {
            "attachments": [
                {
                    "color": color,
                    "title": title,
                    "text": text,
                    "fields": fields,
                    "footer": f"Sprint: {sprint_label} ({iteration.get('startDate', '')[:10]} -> {iteration.get('finishDate', '')[:10]})",
                    "ts": int(datetime.now().timestamp()),
                }
            ]
        }
        _send_webhook(config.NOTIFY_WEBHOOK_URL, payload)


def notify_pr_created(bug: dict, repo_name: str, pr_url: str, bug_id: int):
    """PR 创建成功时发送桌面通知（包含 PR 链接）"""
    title = f"[AI Fix] PR Created - AB#{bug_id}"
    body = f"{repo_name}: {bug.get('title', 'N/A')[:60]}\n{pr_url}"
    _send_desktop(title, body)


def notify_fix_tasks_completed(completed: int, failed: int, total: int, config: Config):
    """修复任务批次完成时发送桌面通知"""
    if not config.NOTIFY_DESKTOP:
        return
    if completed > 0:
        title = "AI Fixes Ready"
        body = f"{completed} fix suggestion{'s' if completed > 1 else ''} ready"
        if failed > 0:
            body += f", {failed} failed"
        _send_desktop(title, body)
