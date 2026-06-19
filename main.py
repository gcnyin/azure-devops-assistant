#!/usr/bin/env python3
"""
Azure DevOps Sprint 看板监控 — Web UI 模式

定时获取当前 Sprint 卡片，自动分析变化并更新 Web 看板数据。
"""

import argparse
import signal
import socket
import sys
import threading
import time
from datetime import datetime

import schedule

from config import Config
from azure_devops import AzureDevOpsClient
from db import init_db, load_previous_items, save_snapshot, diff_items, load_snapshot_by_id, list_snapshots, \
    init_config_from_env, load_all_config
from notifier import notify_changes
from web import update_cached_data, run_web_server
from utils import setup_logging, get_logger

# ── 全局配置实例 ──
config = Config()

# ── 日志 ──
setup_logging(log_dir=config.LOG_DIR or None)
logger = get_logger(__name__)

# ── 优雅关闭 ──
_shutdown_event = threading.Event()


def _shutdown_handler(signum, frame):
    """信号处理器：设置停止标志，让调度循环优雅退出"""
    sig_name = signal.Signals(signum).name
    logger.info("收到 %s 信号，正在优雅关闭...", sig_name)
    _shutdown_event.set()
    # 退出进程，触发 Python 清理流程（atexit、日志缓冲区刷新等）
    raise SystemExit(0)



# ── 数据获取 ──

def fetch_data(
    client: AzureDevOpsClient,
    assigned_to: str | None = None,
    with_diff: bool = True,
    filter_by_user: bool = True,
) -> tuple[dict, list[dict], dict | None]:
    """获取 Sprint 数据，个人模式下只保存本人卡片，全量模式下保存全部

    filter_by_user: 为 True 且 assigned_to 非空时，仅返回当前用户的卡片；
                    为 False 时返回全部卡片（全量视图）。
    """
    iteration = client.get_current_iteration()
    incomplete_set = {s.lower() for s in config.QUERY_STATES}

    # 始终拉取全量 Work Items（不受状态/负责人限制），用于快照
    all_items = client.query_work_items(iteration_path=iteration["path"], states=None)
    logger.info("拉取 Work Items 完成: Sprint=%s, Team=%s, 共 %d 个",
                iteration["name"], client.team_name, len(all_items))

    # 展示层过滤
    # 返回所有 Work Items（含已完成），以便终端/导出/Web 正确统计完成数
    if assigned_to and filter_by_user:
        user_lower = assigned_to.lower()
        items = [it for it in all_items if it.get("assignedTo", "").lower() == user_lower]
    else:
        items = list(all_items)
    # 统一排序：未完成的排前面，已完成的排后面
    items.sort(key=lambda it: (
        0 if it["state"].lower() in incomplete_set else 1,
        it["state"], it["type"],
    ))

    # 快照数据：个人模式下只保存本人的卡片；全量模式下保存全部
    snapshot_items = (
        [it for it in all_items if it.get("assignedTo", "").lower() == assigned_to.lower()]
        if (assigned_to and filter_by_user) else all_items
    )

    # 增量对比：基于快照数据做 diff
    diff_info = None
    if with_diff:
        prev_items, prev_time = load_previous_items(iteration["name"], client.team_name)
        if prev_items:
            new_items, cont_items, gone_items = diff_items(snapshot_items, prev_items)
            if not assigned_to:
                new_items = [it for it in new_items if it["state"].lower() in incomplete_set]
                cont_items = [it for it in cont_items if it.get("_state_changed") or it["state"].lower() in incomplete_set]
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
    sprint_name: str = "",
    team_name: str = "",
    assigned_to: str | None = None,
    filter_by_user: bool = True,
) -> tuple[dict, list[dict], dict | None] | None:
    """离线模式：从数据库加载最后一次快照

    如果 sprint_name 为空，则自动查找该 team 下最近的一次快照作为降级路径。
    """
    if sprint_name:
        prev_items, prev_time = load_previous_items(sprint_name, team_name)
    else:
        # 无 sprint_name 时降级：列出该 team 所有快照，取最新一条
        snaps = list_snapshots(team_name=team_name)
        if not snaps:
            return None
        snapshot_data = load_snapshot_by_id(snaps[0]["id"])
        if not snapshot_data:
            return None
        items_from_db, meta = snapshot_data
        sprint_name = meta["sprint_name"]
        prev_items = {it["id"]: it for it in items_from_db}
        prev_time = meta["fetched_at"]

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
    incomplete_set = {s.lower() for s in config.QUERY_STATES}

    # 返回所有 Work Items（含已完成），以保持一致统计口径
    if assigned_to and filter_by_user:
        user_lower = assigned_to.lower()
        items = [it for it in snapshot_list if it.get("assignedTo", "").lower() == user_lower]
    else:
        items = list(snapshot_list)
    items.sort(key=lambda it: (
        0 if it["state"].lower() in incomplete_set else 1,
        it["state"], it["type"],
    ))

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
    filter_by_user: bool = True,
) -> tuple | None:
    """执行一次检查，返回 (iteration, items, diff_info, offline) 或 None（出错时）"""
    offline = False
    try:
        iteration, items, diff_info = fetch_data(
            client, assigned_to=assigned_to, with_diff=with_diff,
            filter_by_user=filter_by_user,
        )
        # 保存当前 Sprint 名称，供下次 API 失败时离线回退使用
        client._last_sprint_name = iteration["name"]
    except Exception as e:
        logger.error("API 请求失败: %s", e)

        # 尝试离线模式
        logger.warning("尝试从本地数据库加载上次快照...")
        try:
            sprint_name = getattr(client, '_last_sprint_name', '')
            offline_result = load_offline_data(sprint_name, client.team_name, assigned_to, filter_by_user=filter_by_user)
            if offline_result:
                iteration, items, diff_info = offline_result
                offline = True
                logger.info("离线模式 — 显示上次快照数据 (%s)", diff_info["prev_time"])
            else:
                logger.error("本地无可用快照")
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

    # 通知
    if not offline and diff_info:
        nn = len(diff_info["new_items"])
        nc = sum(1 for it in diff_info["continuing_items"] if it.get("_state_changed"))
        ng = len(diff_info["gone_items"])
        if nn or nc or ng:
            try:
                notify_changes(diff_info, iteration, config, project=config.PROJECT)
            except Exception as e:
                logger.warning("通知发送失败: %s", e)

    return iteration, items, diff_info, offline


# ── 入口 ──

def main():
    parser = argparse.ArgumentParser(description="Azure DevOps Sprint Board Monitor (Web UI)")
    parser.add_argument("--interval", type=int, default=None, help="Check interval in minutes")
    parser.add_argument("-w", "--web-port", type=int, default=8080,
                       metavar="PORT",
                       help="Web UI start port (default 8080)")
    parser.add_argument("--public", action="store_true",
                       help="绑定 0.0.0.0 允许外部访问（默认仅监听 127.0.0.1）")
    args = parser.parse_args()

    try:
        config.validate()
    except ValueError as e:
        logger.error("配置错误: %s", e)
        sys.exit(1)

    logger.info("启动 Sprint Monitor: ORG=%s, PROJECT=%s", config.ORG, config.PROJECT)

    client = AzureDevOpsClient()
    init_db()

    # 初始化配置持久化: 首次启动从 .env 种子到 DB，之后从 DB 读取
    init_config_from_env(config)
    db_config = load_all_config(for_api=False)

    interval = args.interval or int(db_config.get("check_interval_minutes", str(config.CHECK_INTERVAL_MINUTES)))

    assigned_to = client.get_my_display_name()
    if not assigned_to:
        logger.error("无法自动识别当前用户，请检查 PAT 和网络连接")
        sys.exit(1)
    logger.info("用户: %s", assigned_to)

    # ── 启动信息 ──
    logger.info("Azure DevOps Sprint 监控已启动: ORG=%s, PROJECT=%s, TEAM=%s, 间隔=%d分钟",
                config.ORG, config.PROJECT, client.team_name, interval)
    if config.NOTIFY_DESKTOP:
        logger.info("桌面通知: 已启用")
    if config.NOTIFY_WEBHOOK_URL:
        logger.info("Webhook: 已配置")

    def check_and_cache():
        try:
            # 拉取该团队所有迭代列表（供前端 sprint 下拉使用）
            try:
                all_iters = client.get_all_iterations()
                from web import update_cached_iterations
                update_cached_iterations(all_iters)
            except Exception as e:
                logger.warning("获取迭代列表失败，sprint 下拉可能不完整: %s", e)

            result = check_once(client, assigned_to=assigned_to, filter_by_user=False)
        except Exception as e:
            logger.error("check_once 发生未预期异常: %s", e, exc_info=True)
            try:
                update_cached_data(
                    iteration={}, items=[], diff_info=None,
                    team_name=client.team_name, project=config.PROJECT,
                    error=f"数据获取失败: {e}",
                )
            except Exception:
                pass
            return
        if result:
            iteration, items, diff_info, offline = result
            try:
                update_cached_data(
                    iteration=iteration,
                    items=items,
                    diff_info=diff_info,
                    assigned_to=assigned_to,
                    team_name=client.team_name,
                    project=config.PROJECT,
                    offline=offline,
                )
            except Exception as e:
                logger.error("更新 Web 缓存失败（Web UI 将显示过期数据）: %s", e)
        else:
            # check_once 返回 None: API 和离线模式均失败
            try:
                update_cached_data(
                    iteration={}, items=[], diff_info=None,
                    team_name=client.team_name, project=config.PROJECT,
                    error="无法连接 Azure DevOps，且本地无可用离线数据",
                )
            except Exception:
                pass

    # 首次执行
    check_and_cache()

    # 定时调度
    schedule.every(interval).minutes.do(check_and_cache)

    # ── Web UI ──

    # 设置 Web 配置（优先从 DB 读取）
    from web import set_web_query_states, set_web_work_dir, set_web_access_token, set_refresh_callback, set_azure_devops_client
    from web import _apply_runtime_config as apply_runtime_config
    from ai_fix import set_timeout as ai_set_timeout, set_target_branch as ai_set_target_branch, recover_pending_tasks

    # 应用 DB 配置到运行时
    apply_runtime_config(db_config)

    # 恢复上次重启前遗留的修复任务
    recover_pending_tasks()

    # 以下 setter 在 _apply_runtime_config 中已调用，此处作为兜底
    set_refresh_callback(check_and_cache)
    set_azure_devops_client(client)

    # 确定监听地址
    host = "0.0.0.0" if args.public else "127.0.0.1"

    # 获取本机局域网 IP（仅在 --public 模式下有意义）
    local_ip = "127.0.0.1"
    if args.public:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
        except Exception:
            pass

    print(f"\n  Azure DevOps Sprint Monitor started")
    print(f"  Local:   http://localhost:{args.web_port}")
    if args.public:
        if local_ip != "127.0.0.1":
            print(f"  Network: http://{local_ip}:{args.web_port}")
    print()

    logger.info("Web 看板启动中，起始端口=%d，绑定地址=%s（端口占用时自动顺延）", args.web_port, host)

    # 注册信号处理器
    signal.signal(signal.SIGINT, _shutdown_handler)
    signal.signal(signal.SIGTERM, _shutdown_handler)

    def schedule_loop():
        while not _shutdown_event.is_set():
            schedule.run_pending()
            # 使用短 sleep 分段检查，以便更快响应停止信号
            for _ in range(10):
                if _shutdown_event.is_set():
                    break
                time.sleep(1)
        logger.info("调度循环已优雅退出")

    schedule_thread = threading.Thread(target=schedule_loop, daemon=True, name="schedule-loop")
    schedule_thread.start()

    try:
        run_web_server(start_port=args.web_port, debug=False, host=host)
    except SystemExit:
        # 由信号处理器触发的 SystemExit，正常退出
        pass
    finally:
        logger.info("Sprint Monitor 已停止")


if __name__ == "__main__":
    main()
