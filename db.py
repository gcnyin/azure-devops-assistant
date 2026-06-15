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
        # 删除旧 ai_fixes 表（schema 已重新设计）
        conn.execute("DROP TABLE IF EXISTS ai_fixes")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS fix_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bug_id INTEGER NOT NULL,
                bug_title TEXT NOT NULL DEFAULT '',
                work_item_type TEXT NOT NULL DEFAULT 'Bug',
                sprint_name TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending',
                agent_name TEXT,
                prompt TEXT,
                response TEXT,
                error TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                started_at TEXT,
                finished_at TEXT
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


# ── AI 修复任务存取 ──

STATUS_PENDING = "pending"
STATUS_RUNNING = "running"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"
ALL_STATUSES = [STATUS_PENDING, STATUS_RUNNING, STATUS_COMPLETED, STATUS_FAILED]


def create_fix_task(bug_id: int, bug_title: str, sprint_name: str = "",
                    work_item_type: str = "Bug", prompt: str = "") -> int:
    """创建修复任务，返回 task id"""
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO fix_tasks (bug_id, bug_title, work_item_type, sprint_name, status, prompt) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (bug_id, bug_title, work_item_type, sprint_name, STATUS_PENDING, prompt),
        )
        conn.commit()
        task_id = cur.lastrowid
    logger.debug("创建修复任务 #%d: Bug #%d - %s", task_id, bug_id, bug_title)
    return task_id


def update_fix_task_status(task_id: int, status: str, **kwargs):
    """更新任务状态和可选字段"""
    allowed = {"status", "agent_name", "response", "error", "started_at", "finished_at"}
    sets = ["status = ?"]
    values: list = [status]
    ts_now_args = set()
    for k in kwargs:
        if k in allowed:
            if k == "started_at" and kwargs[k] == "now":
                sets.append("started_at = datetime('now')")
                ts_now_args.add("started_at")
            elif k == "finished_at" and kwargs[k] == "now":
                sets.append("finished_at = datetime('now')")
                ts_now_args.add("finished_at")
            elif k not in ts_now_args:
                sets.append(f"{k} = ?")
                values.append(kwargs[k])
    values.append(task_id)
    with _connect() as conn:
        conn.execute(
            f"UPDATE fix_tasks SET {', '.join(sets)} WHERE id = ?",
            values,
        )
        conn.commit()
    logger.debug("任务 #%d 状态更新: %s", task_id, status)


def get_fix_tasks(status: str | list[str] | None = None, bug_id: int | None = None) -> list[dict]:
    """查询修复任务。status 可传单个字符串或列表，None 表示所有状态。"""
    try:
        with _connect() as conn:
            query = "SELECT * FROM fix_tasks WHERE 1=1"
            params: list = []
            if status:
                if isinstance(status, list):
                    placeholders = ", ".join("?" for _ in status)
                    query += f" AND status IN ({placeholders})"
                    params.extend(status)
                else:
                    query += " AND status = ?"
                    params.append(status)
            if bug_id is not None:
                query += " AND bug_id = ?"
                params.append(bug_id)
            query += " ORDER BY created_at DESC"
            rows = conn.execute(query, params).fetchall()
            return [dict(r) for r in rows]
    except Exception:
        return []


def get_bug_fix_status_map() -> dict[int, dict]:
    """返回 {bug_id: {status, task_id, created_at, started_at}}，取每个 bug 最新任务的信息"""
    try:
        with _connect() as conn:
            rows = conn.execute(
                "SELECT bug_id, id, status, created_at, started_at FROM fix_tasks "
                "WHERE id IN (SELECT MAX(id) FROM fix_tasks GROUP BY bug_id)"
            ).fetchall()
            return {
                r["bug_id"]: {
                    "status": r["status"],
                    "task_id": r["id"],
                    "created_at": r["created_at"],
                    "started_at": r["started_at"],
                }
                for r in rows
            }
    except Exception:
        return {}


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
