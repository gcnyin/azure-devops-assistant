#!/usr/bin/env python3
"""
Azure DevOps Sprint 看板监控 — Web UI 模式

定时获取当前 Sprint 卡片，自动分析变化并更新 Web 看板数据。
"""

import argparse
import sys
import time
from datetime import datetime

import schedule

from config import Config
from azure_devops import AzureDevOpsClient
from db import init_db, load_previous_items, save_snapshot, diff_items, load_snapshot_by_id
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
    assigned_to: str | None = None,
    with_diff: bool = True,
) -> tuple | None:
    """执行一次检查，返回 (iteration, items, diff_info, offline) 或 None（出错时）"""
    offline = False
    try:
        iteration, items, diff_info = fetch_data(
            client, assigned_to=assigned_to, with_diff=with_diff,
        )
    except Exception as e:
        logger.error("API 请求失败: %s", e)

        # 尝试离线模式
        logger.warning("尝试从本地数据库加载上次快照...")
        try:
            sprint_name = getattr(client, '_last_sprint_name', '')
            team_name = client.team_name
            if sprint_name:
                offline_result = load_offline_data(sprint_name, team_name, assigned_to)
                if offline_result:
                    iteration, items, diff_info = offline_result
                    offline = True
                    logger.info("离线模式 — 显示上次快照数据 (%s)", diff_info["prev_time"])
                else:
                    logger.error("本地无可用快照")
                    return None
            else:
                from db import list_snapshots
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
                        logger.info("离线模式 — 显示上次快照数据 (%s)", meta["fetched_at"])
                    else:
                        return None
                else:
                    return None
        except Exception as e2:
            logger.error("离线模式加载失败: %s", e2)
            return None

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if diff_info:
        nn = len(diff_info["new_items"])
        nc = sum(1 for it in diff_info["continuing_items"] if it.get("_state_changed"))
        ng = len(diff_info["gone_items"])

        parts = []
        mode_label = "离线于" if offline else "上次检查"
        parts.append(f"{mode_label} {diff_info['prev_time']}")
        if nn:
            parts.append(f"新增 {nn}")
        if nc:
            parts.append(f"状态变化 {nc}")
        if ng:
            parts.append(f"消失 {ng}")
        logger.info(" | ".join(parts))

    logger.info("更新完成: %s, Sprint=%s, 共 %d 项", now_str, iteration.get("name", "?"), len(items))

    if offline:
        logger.warning("离线数据 — 非实时")

    # AI 修复建议（后台静默运行）
    if not offline and diff_info and diff_info["new_items"]:
        from ai_fix import process_new_bugs
        new_bugs = [it for it in diff_info["new_items"] if it.get("type") == "Bug"]
        if new_bugs:
            work_dir = Config.WORK_DIR or None
            results = process_new_bugs(new_bugs, work_dir)
            if results:
                logger.info("已生成 %d 个 Bug 修复建议", len(results))

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

    return iteration, items, diff_info, offline


# ── 入口 ──

def main():
    parser = argparse.ArgumentParser(description="Azure DevOps Sprint Board Monitor (Web UI)")
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
    parser.add_argument("--no-web", action="store_true",
                       help="Disable Web UI")
    parser.add_argument("-w", "--web-port", type=int, default=8080,
                       metavar="PORT",
                       help="Web UI start port (default 8080)")
    args = parser.parse_args()

    try:
        Config.validate()
    except ValueError as e:
        logger.error("配置错误: %s", e)
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
                logger.error("无法自动识别用户，请手动指定 --me <用户名> 或使用 --all 查看全部")
                sys.exit(1)
            logger.info("用户: %s", assigned_to)
        else:
            assigned_to = args.me

    if args.once:
        result = check_once(client, assigned_to=assigned_to)
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

    # ── 启动信息 ──
    print(f"\nAzure DevOps Sprint 监控已启动")
    print(f"   组织: {Config.ORG}")
    print(f"   项目: {Config.PROJECT}")
    print(f"   团队: {client.team_name}{' (自动发现)' if not Config.TEAM else ''}")
    print(f"   间隔: {interval} 分钟")
    print(f"   状态: {', '.join(Config.QUERY_STATES)}")
    if assigned_to:
        print(f"   只看: {assigned_to}")
    if Config.NOTIFY_DESKTOP:
        print(f"   桌面通知: 已启用")
    if Config.NOTIFY_WEBHOOK_URL:
        print(f"   Webhook: 已配置")
    print()

    def check_and_cache():
        result = check_once(client, assigned_to=assigned_to)
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

        print(f"  Web 看板已启动  ->  http://localhost:{web_port}")
        if web_port != args.web_port:
            print(f"  （端口 {args.web_port} 已被占用，自动顺延至 {web_port}）")
        print(f"  按 Ctrl+C 停止\n")

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
