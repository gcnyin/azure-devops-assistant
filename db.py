"""
SQLite 持久化层 — 记录每次拉取的 Sprint 卡片，支持对比差异
"""
import sqlite3
import json
from datetime import datetime
from pathlib import Path

from utils import get_logger

logger = get_logger(__name__)

DB_PATH = Path(__file__).parent / "sprint_history.db"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """初始化表结构"""
    logger.info("初始化数据库: %s", DB_PATH)
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
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_fixes (
                bug_id INTEGER PRIMARY KEY,
                bug_title TEXT,
                response TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)
        # 启用 WAL 模式：允许并发读取不阻塞写入，避免 Web 线程与后台采集线程之间的锁冲突
        # WAL 是持久化设置，只需在初始化时执行一次
        conn.execute("PRAGMA journal_mode=WAL")
        conn.commit()
    logger.debug("数据库表结构检查完成")


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
            try:
                items = json.loads(row["work_items_json"])
            except json.JSONDecodeError:
                logger.warning("上次快照数据损坏，将重新开始对比")
                return {}, None
            logger.debug("加载上次快照: %d 项, 时间=%s", len(items), row["fetched_at"])
            return {it["id"]: it for it in items}, row["fetched_at"]
    logger.debug("未找到历史快照: sprint=%s, team=%s", sprint_name, team_name)
    return {}, None


def save_snapshot(sprint_name: str, team_name: str, items: list[dict]):
    """保存当前拉取结果，清理旧快照只保留最近 10 条"""
    with _connect() as conn:
        conn.execute(
            "INSERT INTO sprint_snapshot (sprint_name, team_name, work_items_json) "
            "VALUES (?, ?, ?)",
            (sprint_name, team_name, json.dumps(items, ensure_ascii=False)),
        )
        # 只保留当前 Sprint/Team 最近 10 条
        cursor = conn.execute(
            "DELETE FROM sprint_snapshot "
            "WHERE sprint_name = ? AND team_name = ? "
            "AND id NOT IN ("
            "  SELECT id FROM sprint_snapshot "
            "  WHERE sprint_name = ? AND team_name = ? "
            "  ORDER BY id DESC LIMIT 10"
            ")",
            (sprint_name, team_name, sprint_name, team_name),
        )
        conn.commit()
        if cursor.rowcount:
            logger.debug("清理旧快照: 删除 %d 条", cursor.rowcount)


def diff_items(
    current: list[dict],
    previous: dict[int, dict],
) -> tuple[list[dict], list[dict], list[dict]]:
    """
    对比当前与上次拉取结果。

    返回:
        (new_items, continuing_items, disappeared_items)
        - new_items: 新增的（上次没有）
        - continuing_items: 持续存在的（含状态变化标记）
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


# ── AI 修复建议存取 ──

def save_ai_fix(bug_id: int, bug_title: str, response: str):
    """保存 AI 修复建议"""
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO ai_fixes (bug_id, bug_title, response, updated_at) "
            "VALUES (?, ?, ?, datetime('now'))",
            (bug_id, bug_title, response),
        )
        conn.commit()
    logger.debug("保存 AI 修复建议: Bug #%d - %s", bug_id, bug_title)


def get_ai_fixes() -> list[dict]:
    """获取所有已保存的 AI 修复建议"""
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM ai_fixes ORDER BY updated_at DESC").fetchall()
        return [dict(r) for r in rows]


# ── 历史快照浏览 ──

def list_snapshots(sprint_name: str | None = None, team_name: str | None = None) -> list[dict]:
    """列出历史快照摘要（id、sprint、team、时间、卡片数）"""
    with _connect() as conn:
        query = "SELECT id, sprint_name, team_name, fetched_at, work_items_json FROM sprint_snapshot"
        params: list = []
        conditions: list[str] = []
        if sprint_name:
            conditions.append("sprint_name = ?")
            params.append(sprint_name)
        if team_name:
            conditions.append("team_name = ?")
            params.append(team_name)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY id DESC LIMIT 50"
        rows = conn.execute(query, params).fetchall()
        result = []
        for r in rows:
            try:
                items = json.loads(r["work_items_json"])
                count = len(items) if isinstance(items, list) else 0
            except (json.JSONDecodeError, TypeError):
                logger.warning("快照 #%d 数据损坏，跳过", r["id"])
                count = 0
            result.append({
                "id": r["id"],
                "sprint_name": r["sprint_name"],
                "team_name": r["team_name"],
                "fetched_at": r["fetched_at"],
                "item_count": count,
            })
        logger.debug("查询历史快照: 返回 %d 条", len(result))
        return result


def load_snapshot_by_id(snapshot_id: int) -> tuple[list[dict], dict] | None:
    """加载指定 ID 的快照，返回 (items, meta)"""
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM sprint_snapshot WHERE id = ?", (snapshot_id,)
        ).fetchone()
        if not row:
            return None
        try:
            items = json.loads(row["work_items_json"])
        except (json.JSONDecodeError, TypeError):
            items = []
        meta = {
            "id": row["id"],
            "sprint_name": row["sprint_name"],
            "team_name": row["team_name"],
            "fetched_at": row["fetched_at"],
        }
        return items, meta
