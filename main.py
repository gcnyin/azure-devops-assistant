#!/usr/bin/env python3
"""
Azure DevOps Sprint 看板监控

定时获取当前 Sprint 卡片，支持个人视图、增量对比、AI 修复、通知和文件存档。
"""

import argparse
import os
import sys
import time
from datetime import datetime

import schedule
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from rich import box

from config import Config
from azure_devops import AzureDevOpsClient
from db import init_db, load_previous_items, save_snapshot, diff_items, load_snapshot_by_id
from renderer import (
    render_table,
    render_changes_only_table,
    save_to_file,
    expand_now,
    state_style,
    type_icon,
    console,
)
from notifier import notify_changes
from web import update_cached_data, run_web_server
from utils import find_available_port, setup_logging, get_logger

# ── 日志 ──
setup_logging(log_dir=Config.LOG_DIR or None)
logger = get_logger(__name__)


# ── 数据获取 ──

def fetch_data(
    client: AzureDevOpsClient,
    assigned_to: str | None = None,
    with_diff: bool = True,
) -> tuple[dict, list[dict], dict | None]:
    """获取 Sprint 数据，个人模式下只保存本人卡片，全量模式下保存全部"""
    iteration = client.get_current_iteration()
    incomplete_set = {s.lower() for s in Config.QUERY_STATES}

    # 始终拉取全量 Work Items（不受状态/负责人限制），用于快照
    all_items = client.query_work_items(iteration_path=iteration["path"], states=None)
    logger.info("拉取 Work Items 完成: Sprint=%s, Team=%s, 共 %d 个",
                iteration["name"], client.team_name, len(all_items))

    # 展示层过滤
    if assigned_to:
        user_lower = assigned_to.lower()
        items = [it for it in all_items if it.get("assignedTo", "").lower() == user_lower]
        items.sort(key=lambda it: (
            0 if it["state"].lower() in incomplete_set else 1,
            it["state"], it["type"],
        ))
    else:
        items = [it for it in all_items if it["state"].lower() in incomplete_set]

    # 快照数据：个人模式下只保存本人的卡片；全量模式下保存全部
    snapshot_items = (
        [it for it in all_items if it.get("assignedTo", "").lower() == assigned_to.lower()]
        if assigned_to else all_items
    )

    # 增量对比：基于快照数据做 diff
    diff_info = None
    if with_diff:
        prev_items, prev_time = load_previous_items(iteration["name"], client.team_name)
        if prev_items:
            new_items, cont_items, gone_items = diff_items(snapshot_items, prev_items)
            if not assigned_to:
                # 全量模式下按状态过滤展示
                new_items = [it for it in new_items if it["state"].lower() in incomplete_set]
                cont_items = [it for it in cont_items if it["state"].lower() in incomplete_set]
                gone_items = [it for it in gone_items if it.get("state", "").lower() in incomplete_set]
            diff_info = {
                "prev_time": prev_time,
                "new_items": new_items,
                "continuing_items": cont_items,
                "gone_items": gone_items,
            }
            logger.info("增量对比完成: +%d 新增, ~%d 变化, -%d 消失",
                        len(new_items),
                        sum(1 for it in cont_items if it.get("_state_changed")),
                        len(gone_items))
        save_snapshot(iteration["name"], client.team_name, snapshot_items)
    return iteration, items, diff_info


def load_offline_data(
    sprint_name: str,
    team_name: str,
    assigned_to: str | None = None,
) -> tuple[dict, list[dict], dict | None] | None:
    """离线模式：从数据库加载最后一次快照"""
    prev_items, prev_time = load_previous_items(sprint_name, team_name)
    if not prev_items:
        return None

    iteration = {
        "id": "",
        "name": sprint_name,
        "path": "",
        "startDate": "",
        "finishDate": "",
    }

    snapshot_list = list(prev_items.values())
    incomplete_set = {s.lower() for s in Config.QUERY_STATES}

    if assigned_to:
        user_lower = assigned_to.lower()
        items = [it for it in snapshot_list if it.get("assignedTo", "").lower() == user_lower]
        items.sort(key=lambda it: (
            0 if it["state"].lower() in incomplete_set else 1,
            it["state"], it["type"],
        ))
    else:
        items = [it for it in snapshot_list if it["state"].lower() in incomplete_set]

    diff_info = {
        "prev_time": prev_time,
        "new_items": [],
        "continuing_items": [],
        "gone_items": [],
    }
    return iteration, items, diff_info


# ── 主检查逻辑 ──

def check_once(
    client: AzureDevOpsClient,
    output_file: str | None = None,
    assigned_to: str | None = None,
    with_diff: bool = True,
    ai_fix: bool = False,
    changes_only: bool = False,
) -> tuple | None:
    """执行一次检查，返回 (iteration, items, diff_info, offline) 或 None（出错时）"""
    offline = False
    try:
        iteration, items, diff_info = fetch_data(
            client, assigned_to=assigned_to, with_diff=with_diff,
        )
    except Exception as e:
        logger.error("API 请求失败: %s", e)
        console.print(f"[red]❌ API 错误: {e}[/red]")

        # 尝试离线模式
        console.print("[yellow]⚠ 尝试从本地数据库加载上次快照...[/yellow]")
        try:
            sprint_name = getattr(client, '_last_sprint_name', '')
            team_name = client.team_name
            if sprint_name:
                offline_result = load_offline_data(sprint_name, team_name, assigned_to)
                if offline_result:
                    iteration, items, diff_info = offline_result
                    offline = True
                    console.print(Panel(
                        f"[yellow]⚠ 离线模式 — 显示上次快照数据 ({diff_info['prev_time']})[/yellow]",
                        style="yellow",
                    ))
                else:
                    console.print("[red]本地无可用快照[/red]")
                    return None
            else:
                # 还没拉取过，尝试从数据库直接加载
                from db import list_snapshots, load_snapshot_by_id
                snaps = list_snapshots()
                if snaps:
                    snapshot_data = load_snapshot_by_id(snaps[0]["id"])
                    if snapshot_data:
                        items_from_db, meta = snapshot_data
                        iteration = {
                            "id": "", "name": meta["sprint_name"], "path": "",
                            "startDate": "", "finishDate": "",
                        }
                        items = items_from_db
                        diff_info = {"prev_time": meta["fetched_at"], "new_items": [], "continuing_items": [], "gone_items": []}
                        offline = True
                        console.print(Panel(
                            f"[yellow]⚠ 离线模式 — 显示上次快照数据 ({meta['fetched_at']})[/yellow]",
                            style="yellow",
                        ))
                    else:
                        return None
                else:
                    return None
        except Exception as e2:
            logger.error("离线模式加载失败: %s", e2)
            console.print("[red]离线模式加载也失败了[/red]")
            return None

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if diff_info:
        nn = len(diff_info["new_items"])
        nc = sum(1 for it in diff_info["continuing_items"] if it.get("_state_changed"))
        ng = len(diff_info["gone_items"])
        diff_parts = [Text.assemble(("⏱ {}  ".format("离线于" if offline else "上次检查"), "dim"),
                                   (diff_info["prev_time"], "white"))]
        if nn:
            diff_parts.append(Text.assemble(("✨ 新增 ", "dim"), (str(nn), "bold green")))
        if nc:
            diff_parts.append(Text.assemble(("🔄 状态变化 ", "dim"), (str(nc), "bold yellow")))
        if ng:
            diff_parts.append(Text.assemble(("👻 消失 ", "dim"), (str(ng), "bold red")))
        console.print(Text(" │ ", style="dim").join(diff_parts))

        has_changes = bool(nn or nc or ng)
        if changes_only and not has_changes:
            console.print(Text.assemble(("⏱ 更新时间 ", "dim"), (now_str, "white")))
            console.print(Panel("✨ 无变化", style="green"))
            if output_file:
                save_to_file(expand_now(output_file), iteration, items)
            return iteration, items, diff_info, offline

    console.print(Text.assemble(("⏱ 更新时间 ", "dim"), (now_str, "white")))
    if offline:
        console.print(Panel("[yellow]⚠ 离线数据 — 非实时[/yellow]", style="yellow"))
    console.print()

    if changes_only and diff_info:
        render_changes_only_table(iteration, diff_info)
    else:
        render_table(iteration, items, diff_info)

    # AI 修复建议（离线模式跳过）
    if ai_fix and not offline and diff_info and diff_info["new_items"]:
        from ai_fix import process_new_bugs
        new_bugs = [it for it in diff_info["new_items"] if it.get("type") == "Bug"]
        if new_bugs:
            console.print()
            console.rule("[bold red]🐛 AI 修复建议[/bold red]")
            console.print(Text.assemble(
                ("新发现 ", "dim"), (str(len(new_bugs)), "bold red"), (" 个 Bug", "dim")
            ))
            for i, bug in enumerate(new_bugs, 1):
                console.print(f"  {i}. [cyan]#{bug['id']}[/cyan]  {bug['title']}")
            console.print()
            work_dir = Config.WORK_DIR or None
            if not work_dir:
                console.print("[yellow]⚠ 提示: 未配置 WORK_DIR，AI 无法搜索代码。请在 .env 中设置 WORK_DIR[/yellow]")
            results = process_new_bugs(new_bugs, work_dir)
            if results:
                console.print(f"[green]✅ 已生成 {len(results)} 个 Bug 修复建议（已存入数据库，使用 --ai-fix-list 查看）[/green]")
            elif work_dir:
                console.print("[yellow]⚠ 未找到可用的 AI agent（需要 pi / claude / opencode / codex）[/yellow]")
            console.print()

    # 通知
    if not offline and diff_info:
        nn = len(diff_info["new_items"])
        nc = sum(1 for it in diff_info["continuing_items"] if it.get("_state_changed"))
        ng = len(diff_info["gone_items"])
        if nn or nc or ng:
            try:
                notify_changes(diff_info, iteration, project=Config.PROJECT)
            except Exception as e:
                logger.warning("通知发送失败: %s", e)

    if output_file:
        save_to_file(expand_now(output_file), iteration, items)

    return iteration, items, diff_info, offline


# ── 入口 ──

def main():
    parser = argparse.ArgumentParser(description="Azure DevOps Sprint Board Monitor")
    parser.add_argument("--once", "-1", action="store_true", help="Run once and exit")
    parser.add_argument("--interval", type=int, default=None, help="Check interval in minutes")
    parser.add_argument(
        "--me", "-m", type=str, nargs="?", const="__auto__", default="__auto__",
        help="Show only specified user's cards (default: auto-detect myself)",
    )
    parser.add_argument(
        "--all", action="store_true",
        help="Show all users' cards (override default personal mode)",
    )
    parser.add_argument("--ai-fix", "-a", action="store_true",
                       help="发现新 Bug 时自动调用 AI agent 生成修复建议（pi/claude/opencode/codex）")
    parser.add_argument("--changes-only", "-c", action="store_true",
                       help="仅显示变化项，无变化时只打印一行")
    parser.add_argument("--output", "-o", type=str, default=None,
                       help="Save results to file (.csv / .md / .txt)，支持 {now} 占位符")
    parser.add_argument("--no-web", action="store_true",
                       help="禁用 Web UI（默认自动启动）")
    parser.add_argument("-w", "--web-port", type=int, default=8080,
                       metavar="PORT",
                       help="Web UI 起始端口（默认 8080，被占用则顺延）")
    args = parser.parse_args()

    try:
        Config.validate()
    except ValueError as e:
        console.print(f"[red]❌ 错误: {e}[/red]")
        sys.exit(1)

    logger.info("启动 Sprint Monitor: ORG=%s, PROJECT=%s", Config.ORG, Config.PROJECT)

    client = AzureDevOpsClient()
    interval = args.interval or Config.CHECK_INTERVAL_MINUTES
    init_db()

    assigned_to: str | None = None
    if args.all:
        assigned_to = None
    elif args.me is not None:
        if args.me == "__auto__":
            assigned_to = client.get_my_display_name()
            if not assigned_to:
                console.print("[yellow]⚠ 警告: 无法自动识别用户，请手动指定 --me <用户名> 或使用 --all 查看全部[/yellow]")
                sys.exit(1)
            console.print(f"[cyan]👤 用户: {assigned_to}[/cyan]")
        else:
            assigned_to = args.me

    if args.once:
        result = check_once(client, output_file=args.output, assigned_to=assigned_to,
                           ai_fix=args.ai_fix, changes_only=args.changes_only)
        if result:
            iteration, items, diff_info, offline = result
            try:
                update_cached_data(
                    iteration=iteration,
                    items=items,
                    diff_info=diff_info,
                    assigned_to=assigned_to,
                    team_name=client.team_name,
                    project=Config.PROJECT,
                    offline=offline,
                )
            except Exception:
                pass
        return

    console.print()
    console.rule("[bold bright_blue]🚀 Azure DevOps Sprint 监控已启动[/bold bright_blue]")
    console.print()

    info_table = Table(box=box.SIMPLE, show_header=False, padding=(0, 2))
    info_table.add_column(style="dim", width=12)
    info_table.add_column(style="white")
    info_table.add_row("组织", Config.ORG)
    info_table.add_row("项目", Config.PROJECT)
    team_label = f"{client.team_name}{' [dim](自动发现)[/dim]' if not Config.TEAM else ''}"
    info_table.add_row("团队", team_label)
    info_table.add_row("间隔", f"{interval} 分钟")
    info_table.add_row("状态", ", ".join(Config.QUERY_STATES))
    if args.changes_only:
        info_table.add_row("模式", "[yellow]仅变化[/yellow]")
    if assigned_to:
        info_table.add_row("只看", assigned_to)
    if Config.NOTIFY_DESKTOP:
        info_table.add_row("桌面通知", "[green]已启用[/green]")
    if Config.NOTIFY_WEBHOOK_URL:
        info_table.add_row("Webhook", "[green]已配置[/green]")
    console.print(info_table)
    console.print()

    def check_and_cache():
        result = check_once(client, output_file=args.output, assigned_to=assigned_to,
                           ai_fix=args.ai_fix, changes_only=args.changes_only)
        if result:
            try:
                iteration, items, diff_info, offline = result
                update_cached_data(
                    iteration=iteration,
                    items=items,
                    diff_info=diff_info,
                    assigned_to=assigned_to,
                    team_name=client.team_name,
                    project=Config.PROJECT,
                    offline=offline,
                )
            except Exception:
                pass

    # 首次执行
    check_and_cache()

    # 定时调度
    schedule.every(interval).minutes.do(check_and_cache)

    # ── Web UI（默认启动，除非 --no-web） ──
    if not args.no_web:
        import threading
        web_port = find_available_port(args.web_port)

        url_text = Text.assemble(
            ("\n  🌐  Web 看板已启动  ", "bold white on bright_blue"),
            ("  →  ", "dim"),
            (f"http://localhost:{web_port}", "bold bright_cyan underline"),
        )
        console.print(url_text)
        if web_port != args.web_port:
            console.print(f"  [dim]（端口 {args.web_port} 已被占用，自动顺延至 {web_port}）[/dim]")
        console.print("  [dim]按 Ctrl+C 停止[/dim]")
        console.print()

        def schedule_loop():
            while True:
                schedule.run_pending()
                time.sleep(10)
        threading.Thread(target=schedule_loop, daemon=True).start()
        run_web_server(start_port=web_port, debug=False)
        return

    try:
        while True:
            schedule.run_pending()
            time.sleep(10)
    except KeyboardInterrupt:
        logger.info("用户中止")
        print("\nStopped.")


if __name__ == "__main__":
    main()
