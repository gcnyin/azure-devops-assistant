#!/usr/bin/env python3
"""
Azure DevOps Sprint 看板监控

定时获取当前 Sprint 卡片，支持个人视图、增量对比、文件存档。
"""

import argparse
import csv
import os
import sys
import time
from datetime import datetime

import schedule

from config import Config
from azure_devops import AzureDevOpsClient
from db import init_db, load_previous_items, save_snapshot, diff_items

# ── 纯文本输出 ──
SEP = "-" * 80

INCOMPLETE_STATES = {
    s.lower() for s in ["To Do", "In Progress", "Active", "New", "Committed", "Doing"]
}


def fetch_data(
    client: AzureDevOpsClient,
    assigned_to: str | None = None,
    with_diff: bool = True,
) -> tuple[dict, list[dict], dict | None]:
    iteration = client.get_current_iteration()
    if assigned_to:
        items = client.query_work_items(iteration_path=iteration["path"], states=None)
        items = [it for it in items if it["assignedTo"].lower() == assigned_to.lower()]
        incomplete_set = {s.lower() for s in Config.QUERY_STATES}
        items.sort(key=lambda it: (
            0 if it["state"].lower() in incomplete_set else 1,
            it["state"], it["type"],
        ))
    else:
        items = client.query_work_items(
            iteration_path=iteration["path"], states=Config.QUERY_STATES,
        )
    diff_info = None
    if with_diff:
        prev_items, prev_time = load_previous_items(iteration["name"], client.team_name)
        if prev_items:
            new_items, cont_items, gone_items = diff_items(items, prev_items)
            diff_info = {
                "prev_time": prev_time,
                "new_items": new_items,
                "continuing_items": cont_items,
                "gone_items": gone_items,
            }
            items = new_items + cont_items
        save_snapshot(iteration["name"], client.team_name, items)
    return iteration, items, diff_info


def render_table(iteration: dict, items: list[dict], diff_info: dict | None = None) -> str:
    """纯文本表格"""
    new_ids: set[int] = set()
    changed_ids: dict[int, str] = {}
    if diff_info:
        for it in diff_info["new_items"]:
            new_ids.add(it["id"])
        for it in diff_info["continuing_items"]:
            if it.get("_state_changed"):
                changed_ids[it["id"]] = it.get("_prev_state", "?")

    lines = []
    sprint_dates = f"{iteration['startDate'][:10]} -> {iteration['finishDate'][:10]}"
    title = f"{Config.PROJECT}  |  {iteration['name']}  ({sprint_dates})"
    if diff_info:
        nn = len(diff_info["new_items"])
        if nn:
            title += f"  [ 新增 +{nn} ]"
    lines.append(title)
    lines.append(SEP)

    # header
    fmt = "  {:<4} {:<7} {:<40} {:<10} {:<16} {:<14}"
    lines.append(fmt.format("#", "ID", "标题", "类型", "状态", "负责人"))
    lines.append(SEP)

    for i, item in enumerate(items, 1):
        title_text = item["title"]
        state_text = item["state"]
        flag = ""

        if item["id"] in new_ids:
            flag = " 新"
            title_text = f"[新增] {title_text}"
        elif item["id"] in changed_ids:
            prev = changed_ids[item["id"]]
            flag = " 变"
            title_text = f"[变化] {title_text}"
            state_text = f"{prev} -> {item['state']}"

        # 截断长标题（中文字符算2个宽度）
        flag_width = len(flag.encode("utf-8")) - len(flag) + len(flag)  # 宽字符双倍
        max_title = 42 - flag_width
        if len(title_text) > max_title:
            title_text = title_text[:max_title - 2] + ".."

        lines.append(fmt.format(
            str(i), str(item["id"]), title_text,
            item["type"], state_text, item["assignedTo"],
        ))

    lines.append(SEP)

    # 统计
    state_counts: dict[str, int] = {}
    for it in items:
        s = it["state"]
        state_counts[s] = state_counts.get(s, 0) + 1
    incomplete_set = {s.lower() for s in Config.QUERY_STATES}
    inc_count = sum(c for s, c in state_counts.items() if s.lower() in incomplete_set)
    comp_count = len(items) - inc_count

    parts = [f"合计: {len(items)}"]
    if diff_info:
        nn = len(diff_info["new_items"])
        nc = sum(1 for it in diff_info["continuing_items"] if it.get("_state_changed"))
        ng = len(diff_info["gone_items"])
        if nn:
            parts.append(f"新增: {nn}")
        if nc:
            parts.append(f"状态变化: {nc}")
        if ng:
            parts.append(f"消失: {ng}")
    if inc_count > 0:
        parts.append(f"  未完成: {inc_count}")
    if comp_count > 0:
        parts.append(f"  已完成: {comp_count}")
    parts.append("  |  " + "  ".join(f"{s}: {c}" for s, c in state_counts.items()))
    lines.append("  ".join(parts))
    lines.append("")

    return "\n".join(lines)


def check_once(
    client: AzureDevOpsClient,
    output_file: str | None = None,
    assigned_to: str | None = None,
    with_diff: bool = True,
    ai_fix: bool = False,
):
    try:
        iteration, items, diff_info = fetch_data(
            client, assigned_to=assigned_to, with_diff=with_diff,
        )
    except Exception as e:
        print(f"错误: {e}")
        return

    if diff_info:
        nn = len(diff_info["new_items"])
        nc = sum(1 for it in diff_info["continuing_items"] if it.get("_state_changed"))
        ng = len(diff_info["gone_items"])
        diff_parts = [f"上次检查: {diff_info['prev_time']}"]
        if nn:
            diff_parts.append(f"新增 {nn}")
        if nc:
            diff_parts.append(f"状态变化 {nc}")
        if ng:
            diff_parts.append(f"消失 {ng}")
        print("  |  ".join(diff_parts))

    print(f"更新时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    print(render_table(iteration, items, diff_info))

    # 打印有描述的卡片内容
    items_with_desc = [it for it in items if it.get("description")]
    if items_with_desc:
        print("=" * 80)
        print("详情描述")
        print("=" * 80)
        for it in items_with_desc:
            print(f"\n--- [{it['id']}] {it['title']} ---")
            print(it["description"])
        print()

    # AI 修复建议
    if ai_fix and diff_info and diff_info["new_items"]:
        from ai_fix import process_new_bugs
        new_bugs = [it for it in diff_info["new_items"] if it.get("type") == "Bug"]
        if new_bugs:
            print(f"\n{'=' * 80}")
            print(f"AI 修复建议 — 新发现 {len(new_bugs)} 个 Bug")
            print(f"{'=' * 80}")
            work_dir = Config.WORK_DIR or None
            if not work_dir:
                print("提示: 未配置 WORK_DIR，AI 无法搜索代码。请在 .env 中设置 WORK_DIR")
            results = process_new_bugs(new_bugs, work_dir)
            for bug_id, bug_title, response in results:
                print(f"\n--- Bug #{bug_id}: {bug_title} ---")
                print(response[:2000])
                if len(response) > 2000:
                    print(f"\n... (截断，完整内容共 {len(response)} 字符，已存入数据库)")
            if not results:
                print("未找到可用的 AI agent（需要 pi / claude / opencode / codex）")
            print()

    if output_file:
        save_to_file(output_file, iteration, items)


def save_to_file(filepath: str, iteration: dict, items: list[dict]):
    ext = os.path.splitext(filepath)[1].lower()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if ext == ".csv":
        with open(filepath, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(["#", "ID", "Title", "Type", "State", "Assigned To", "URL"])
            for i, item in enumerate(items, 1):
                writer.writerow([i, item["id"], item["title"], item["type"],
                                 item["state"], item["assignedTo"], item["htmlUrl"]])
    else:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(f"# {Config.PROJECT} — {iteration['name']}\n\n")
            f.write(f"**Sprint**: {iteration['name']}  "
                    f"({iteration['startDate'][:10]} -> {iteration['finishDate'][:10]})\n\n")
            f.write(f"**Updated**: {now_str}\n\n")
            f.write(f"**Total: {len(items)}**\n\n")
            grouped: dict[str, list[dict]] = {}
            for item in items:
                grouped.setdefault(item["state"], []).append(item)
            for state, state_items in grouped.items():
                f.write(f"## {state} ({len(state_items)})\n\n")
                f.write("| # | ID | Title | Type | Assigned To |\n")
                f.write("|---|-----|-------|------|-------------|\n")
                for idx, it in enumerate(state_items, 1):
                    f.write(f"| {idx} | {it['id']} | {it['title']} | {it['type']} | {it['assignedTo']} |\n")
                f.write("\n")
                # 附加描述
                for it in state_items:
                    if it.get("description"):
                        f.write(f"> **[{it['id']}] 描述**: {it['description']}\n\n")
    print(f"已保存: {os.path.abspath(filepath)}")


def main():
    parser = argparse.ArgumentParser(description="Azure DevOps Sprint Board Monitor")
    parser.add_argument("--once", "-1", action="store_true", help="Run once and exit")
    parser.add_argument("--interval", type=int, default=None, help="Check interval in minutes")
    parser.add_argument("--web", type=int, nargs="?", const=8080, default=None, help="Start web server")
    parser.add_argument(
        "--me", "-m", type=str, nargs="?", const="__auto__", default=None,
        help="Show only my cards (auto-detect identity or specify name)",
    )
    parser.add_argument("--ai-fix", "-a", action="store_true",
                       help="发现新 Bug 时自动调用 AI agent 生成修复建议（pi/claude/opencode/codex）")
    parser.add_argument("--output", "-o", type=str, default=None,
                       help="Save results to file (.csv / .md / .txt)")
    args = parser.parse_args()

    try:
        Config.validate()
    except ValueError as e:
        print(f"错误: {e}")
        sys.exit(1)

    client = AzureDevOpsClient()
    interval = args.interval or Config.CHECK_INTERVAL_MINUTES
    init_db()

    assigned_to: str | None = None
    if args.me is not None:
        if args.me == "__auto__":
            assigned_to = client.get_my_display_name()
            if not assigned_to:
                print("警告: 无法自动识别用户，请手动指定 --me <用户名>")
                sys.exit(1)
            print(f"用户: {assigned_to}")
        else:
            assigned_to = args.me

    if args.web is not None:
        print(f"Web server: http://localhost:{args.web}")
        return

    if args.once:
        check_once(client, output_file=args.output, assigned_to=assigned_to, ai_fix=args.ai_fix)
        return

    print(f"Azure DevOps Sprint 监控已启动")
    print(f"  组织:     {Config.ORG}")
    print(f"  项目:     {Config.PROJECT}")
    print(f"  团队:     {client.team_name}{' (自动发现)' if not Config.TEAM else ''}")
    print(f"  间隔:     {interval} 分钟")
    print(f"  状态:     {', '.join(Config.QUERY_STATES)}")
    if assigned_to:
        print(f"  只看:     {assigned_to}")
    print()

    check_once(client, output_file=args.output, assigned_to=assigned_to, ai_fix=args.ai_fix)
    schedule.every(interval).minutes.do(
        check_once, client=client,
        output_file=args.output, assigned_to=assigned_to, ai_fix=args.ai_fix,
    )

    try:
        while True:
            schedule.run_pending()
            time.sleep(10)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
