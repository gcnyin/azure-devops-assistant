"""
SQLite 持久化层 — 记录每次拉取的 Sprint 卡片，支持对比差异
"""
import sqlite3
import json
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "sprint_history.db"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """初始化表结构"""
    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sprint_snapshot (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sprint_name TEXT NOT NULL,
                team_name TEXT NOT NULL,
                fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
                work_items_json TEXT NOT NULL
            )
        """)
        conn.commit()


def load_previous_items(sprint_name: str, team_name: str) -> dict[int, dict]:
    """加载上次拉取结果，返回 {work_item_id: item_data}"""
    with _connect() as conn:
        row = conn.execute(
            "SELECT work_items_json, fetched_at FROM sprint_snapshot "
            "WHERE sprint_name = ? AND team_name = ? "
            "ORDER BY id DESC LIMIT 1",
            (sprint_name, team_name),
        ).fetchone()
        if row:
            items = json.loads(row["work_items_json"])
            return {it["id"]: it for it in items}, row["fetched_at"]
    return {}, None


def save_snapshot(sprint_name: str, team_name: str, items: list[dict]):
    """保存当前拉取结果，清理旧快照只保留最近 10 条"""
    with _connect() as conn:
        conn.execute(
            "INSERT INTO sprint_snapshot (sprint_name, team_name, work_items_json) "
            "VALUES (?, ?, ?)",
            (sprint_name, team_name, json.dumps(items, ensure_ascii=False)),
        )
        # 只保留最近 10 条
        conn.execute(
            "DELETE FROM sprint_snapshot WHERE id NOT IN ("
            "SELECT id FROM sprint_snapshot "
            "WHERE sprint_name = ? AND team_name = ? "
            "ORDER BY id DESC LIMIT 10"
            ")",
            (sprint_name, team_name),
        )
        conn.commit()


def diff_items(
    current: list[dict],
    previous: dict[int, dict],
) -> tuple[list[dict], list[dict], list[dict]]:
    """
    对比当前与上次拉取结果。

    返回:
        (new_items, continuing_items, disappeared_items)
        - new_items: 新增的（上次没有）
        - continuing_items: 持续存在的（含状态变化）
        - disappeared_items: 消失的（上次有这次没有）
    """
    current_ids = {it["id"] for it in current}
    previous_ids = set(previous.keys())

    new_ids = current_ids - previous_ids
    gone_ids = previous_ids - current_ids
    keep_ids = current_ids & previous_ids

    new_items = [it for it in current if it["id"] in new_ids]

    continuing_items = []
    for it in current:
        if it["id"] in keep_ids:
            prev_state = previous[it["id"]].get("state", "?")
            it_copy = dict(it)
            it_copy["_prev_state"] = prev_state
            it_copy["_state_changed"] = (prev_state != it["state"])
            continuing_items.append(it_copy)

    disappeared_items = [previous[iid] for iid in gone_ids]

    # 排序：new 排前面
    new_items.sort(key=lambda x: (x["state"], x["type"]))
    continuing_items.sort(key=lambda x: (
        0 if x["_state_changed"] else 1,
        x["state"],
        x["type"],
    ))

    return new_items, continuing_items, disappeared_items
