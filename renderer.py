"""
终端渲染模块 — Rich 表格绘制、文件导出、通用常量
"""

import csv
import os
from datetime import datetime

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from rich import box
from rich.style import Style

from config import Config

console = Console()

# ── 状态颜色映射 ──
STATE_COLORS: dict[str, Style] = {
    "done": Style(color="green", bold=True),
    "closed": Style(color="green", bold=True),
    "completed": Style(color="green", bold=True),
    "resolved": Style(color="green"),
    "in progress": Style(color="yellow"),
    "active": Style(color="yellow"),
    "committed": Style(color="bright_yellow"),
    "to do": Style(color="cyan"),
    "new": Style(color="bright_cyan"),
    "removed": Style(color="red"),
    "blocked": Style(color="red", bold=True),
}

_TYPE_ICONS: dict[str, str] = {
    "bug": "🐛",
    "task": "📋",
    "feature": "🚀",
    "user story": "📖",
    "issue": "⚠️",
    "epic": "🏛️",
}

# ── 导出用字符串版本（web.py 使用） ──
STATE_COLORS_HEX: dict[str, str] = {
    # Raycast accent 色系 — 仅在状态标签和扩展插图使用
    "done": "#59d499",       # accent-green
    "closed": "#59d499",
    "completed": "#59d499",
    "resolved": "#3aad7f",
    "in progress": "#ffc533",  # accent-yellow
    "active": "#ffc533",
    "committed": "#e5a81c",
    "to do": "#57c1ff",       # accent-blue
    "new": "#57c1ff",
    "removed": "#ff6161",     # accent-red
    "blocked": "#ff6161",
}


def state_style(state: str) -> Style:
    return STATE_COLORS.get(state.lower().strip(), Style())


def state_color_hex(state: str) -> str:
    return STATE_COLORS_HEX.get(state.lower().strip(), "#9ca3af")


def state_bg_hex(state: str) -> str:
    return f"{state_color_hex(state)}20"


def type_icon(wi_type: str) -> str:
    return _TYPE_ICONS.get(wi_type.lower().strip(), "📌")


def expand_now(path: str) -> str:
    """将 {now} 替换为当前时间戳"""
    return path.replace("{now}", datetime.now().strftime("%Y%m%d_%H%M%S"))


# ── 表格渲染 ──

def render_table(iteration: dict, items: list[dict], diff_info: dict | None = None):
    """使用 Rich 渲染美观的 Sprint 看板表格"""
    new_ids: set[int] = set()
    changed_ids: dict[int, str] = {}
    if diff_info:
        for it in diff_info.get("new_items", []):
            new_ids.add(it["id"])
        for it in diff_info.get("continuing_items", []):
            if it.get("_state_changed"):
                changed_ids[it["id"]] = it.get("_prev_state", "?")

    sprint_dates = f"{iteration['startDate'][:10]} → {iteration['finishDate'][:10]}"
    title_text = Text.assemble(
        (Config.PROJECT, "bold bright_blue"),
        ("  |  ", "dim"),
        (iteration["name"], "bold white"),
        (f"  ({sprint_dates})", "dim"),
    )
    if diff_info:
        nn = len(diff_info.get("new_items", []))
        if nn:
            title_text.append(f"  [ +{nn} 新增 ]", Style(color="green", bold=True))

    console.print(Panel(title_text, box=box.HEAVY, border_style="bright_blue"))

    table = Table(
        box=box.ROUNDED,
        header_style="bold white on bright_blue",
        border_style="bright_blue",
        padding=(0, 1),
        collapse_padding=False,
    )
    table.add_column("#", justify="right", style="dim", no_wrap=True)
    table.add_column("ID", justify="right", style="cyan", no_wrap=True)
    table.add_column("标题", style="white", no_wrap=True, overflow="ellipsis")
    table.add_column("类型", no_wrap=True)
    table.add_column("状态", no_wrap=True)
    table.add_column("负责人", style="magenta", no_wrap=True)

    for idx, item in enumerate(items, 1):
        wi_id = str(item["id"])
        title = item["title"]
        wi_type = item["type"]
        state = item["state"]
        assignee = item.get("assignedTo", "Unassigned")

        row_style: Style | None = None
        idx_text = Text(str(idx))
        id_text = Text(wi_id)
        title_cell = Text(title, overflow="ellipsis")
        type_text = Text(wi_type)
        state_text = Text(state, style=state_style(state))
        assignee_text = Text(assignee)

        if item["id"] in new_ids:
            row_style = Style(color="green")
            idx_text.stylize("bold green")
            title_cell = Text.assemble(("✨ ", "bold green"), (title, "green"), overflow="ellipsis")
            state_text.stylize("bold")
        elif item["id"] in changed_ids:
            prev = changed_ids[item["id"]]
            row_style = Style(color="yellow")
            idx_text.stylize("bold yellow")
            title_cell = Text.assemble(("🔄 ", "bold yellow"), (title, "yellow"), overflow="ellipsis")
            state_text = Text.assemble(
                (prev, Style(color="red", strike=True)),
                (" → ", "dim"),
                (state, state_style(state) + Style(bold=True)),
            )

        table.add_row(
            idx_text, id_text, title_cell, type_text,
            state_text, assignee_text,
            style=row_style,
        )

    console.print(table)

    # ── 统计面板 ──
    state_counts: dict[str, int] = {}
    for it in items:
        s = it["state"]
        state_counts[s] = state_counts.get(s, 0) + 1
    incomplete_set = {s.lower() for s in Config.QUERY_STATES}
    inc_count = sum(c for s, c in state_counts.items() if s.lower() in incomplete_set)
    comp_count = len(items) - inc_count

    summary_parts: list[Text] = []
    summary_parts.append(Text.assemble(("📊 合计 ", "dim"), (str(len(items)), "bold white")))

    if diff_info:
        nn = len(diff_info.get("new_items", []))
        nc = sum(1 for it in diff_info.get("continuing_items", []) if it.get("_state_changed"))
        ng = len(diff_info.get("gone_items", []))
        if nn:
            summary_parts.append(Text.assemble(("✨ 新增 ", "dim"), (str(nn), "bold green")))
        if nc:
            summary_parts.append(Text.assemble(("🔄 状态变化 ", "dim"), (str(nc), "bold yellow")))
        if ng:
            summary_parts.append(Text.assemble(("👻 消失 ", "dim"), (str(ng), "bold red")))
    if inc_count > 0:
        summary_parts.append(Text.assemble(("⏳ 未完成 ", "dim"), (str(inc_count), "bold yellow")))
    if comp_count > 0:
        summary_parts.append(Text.assemble(("✅ 已完成 ", "dim"), (str(comp_count), "bold green")))

    dist_parts = [Text.assemble((f"{s}: ", "dim"), (str(c), state_style(s))) for s, c in state_counts.items()]
    summary_parts.append(Text(" │ ", style="dim").join(dist_parts))

    console.print(Panel(Text("  ").join(summary_parts), box=box.SIMPLE, border_style="dim"))
    console.print()


def render_changes_only_table(iteration: dict, diff_info: dict):
    """仅渲染变化项（新增 + 状态变化 + 消失）"""
    new_items = diff_info["new_items"]
    gone_items = diff_info["gone_items"]
    changed_cont = [it for it in diff_info["continuing_items"] if it.get("_state_changed")]

    sprint_dates = f"{iteration['startDate'][:10]} → {iteration['finishDate'][:10]}"
    title_text = Text.assemble(
        (Config.PROJECT, "bold bright_blue"),
        ("  |  ", "dim"),
        (iteration["name"], "bold white"),
        (f"  ({sprint_dates})", "dim"),
        ("  [ 仅变化 ]", Style(color="bright_yellow", bold=True)),
    )
    console.print(Panel(title_text, box=box.HEAVY, border_style="bright_blue"))

    if not new_items and not changed_cont and not gone_items:
        console.print(Panel("✨ 无变化", style="green"))
        console.print()
        return

    table = Table(
        box=box.ROUNDED,
        header_style="bold white on bright_blue",
        border_style="bright_blue",
        padding=(0, 1),
        collapse_padding=False,
    )
    table.add_column("标记", no_wrap=True)
    table.add_column("ID", justify="right", style="cyan", no_wrap=True)
    table.add_column("标题", style="white", no_wrap=True, overflow="ellipsis")
    table.add_column("类型", no_wrap=True)
    table.add_column("状态", no_wrap=True)
    table.add_column("负责人", style="magenta", no_wrap=True)

    for it in new_items:
        title = it["title"]
        state = it["state"]
        table.add_row(
            Text("✨ 新增", style="bold green"),
            Text(str(it["id"]), style="green"),
            Text(title, style="green", overflow="ellipsis"),
            Text(it.get("type", "")),
            Text(state, style=state_style(state)),
            Text(it.get("assignedTo", "")),
            style=Style(color="green"),
        )

    for it in changed_cont:
        prev = it.get("_prev_state", "?")
        state = it["state"]
        table.add_row(
            Text("🔄 变化", style="bold yellow"),
            Text(str(it["id"]), style="yellow"),
            Text(it["title"], style="yellow", overflow="ellipsis"),
            Text(it.get("type", "")),
            Text.assemble(
                (prev, Style(color="red", strike=True)),
                (" → ", "dim"),
                (state, state_style(state) + Style(bold=True)),
            ),
            Text(it.get("assignedTo", "")),
            style=Style(color="yellow"),
        )

    for it in gone_items:
        state = it.get("state", "?")
        table.add_row(
            Text("👻 消失", style="bold red"),
            Text(str(it["id"]), style="red strike"),
            Text(it["title"], style="red strike", overflow="ellipsis"),
            Text(it.get("type", "?")),
            Text(state, style=Style(color="red", strike=True)),
            Text(it.get("assignedTo", "?")),
            style=Style(color="red", dim=True),
        )

    console.print(table)

    summary = Text.assemble(
        ("✨ 新增 ", "dim"), (str(len(new_items)), "bold green"),
        ("  │  ", "dim"),
        ("🔄 状态变化 ", "dim"), (str(len(changed_cont)), "bold yellow"),
        ("  │  ", "dim"),
        ("👻 消失 ", "dim"), (str(len(gone_items)), "bold red"),
    )
    console.print(Panel(summary, box=box.SIMPLE, border_style="dim"))
    console.print()


# ── 文件导出 ──

def save_to_file(filepath: str, iteration: dict, items: list[dict]):
    """导出结果到文件（.csv / .md / .txt）"""
    ext = os.path.splitext(filepath)[1].lower()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if ext == ".csv":
        with open(filepath, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(["#", "ID", "Title", "Type", "State", "Assigned To", "URL"])
            for i, item in enumerate(items, 1):
                writer.writerow([i, item["id"], item["title"], item["type"],
                                 item["state"], item.get("assignedTo", ""), item.get("htmlUrl", "")])
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
                    f.write(f"| {idx} | {it['id']} | {it['title']} | {it['type']} | {it.get('assignedTo', '')} |\n")
                f.write("\n")
                for it in state_items:
                    if it.get("description"):
                        f.write(f"> **[{it['id']}] 描述**: {it['description']}\n\n")
    print(f"已保存: {os.path.abspath(filepath)}")
