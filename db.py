"""
SQLite 持久化层 — 记录每次拉取的 Sprint 卡片，支持对比差异
"""
import os
import sqlite3
import json
from datetime import datetime
from pathlib import Path

from utils import get_logger

logger = get_logger(__name__)

DB_PATH = Path(os.environ.get("SPRINT_DB_PATH", "")) if os.environ.get("SPRINT_DB_PATH") else Path(__file__).parent / "sprint_history.db"


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
                repo_results TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                started_at TEXT,
                finished_at TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS app_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
STATUS_CANCELLED = "cancelled"
ALL_STATUSES = [STATUS_PENDING, STATUS_RUNNING, STATUS_COMPLETED, STATUS_FAILED, STATUS_CANCELLED]
CANCELLABLE_STATUSES = [STATUS_PENDING, STATUS_RUNNING]
RETRYABLE_STATUSES = [STATUS_FAILED, STATUS_CANCELLED]


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
    allowed = {"status", "agent_name", "response", "error", "started_at", "finished_at", "repo_results"}
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


def get_fix_task_by_id(task_id: int) -> dict | None:
    """按 ID 获取单个修复任务，不存在返回 None"""
    try:
        with _connect() as conn:
            row = conn.execute(
                "SELECT * FROM fix_tasks WHERE id = ?", (task_id,)
            ).fetchone()
            if not row:
                return None
            return dict(row)
    except Exception:
        return None


def cancel_fix_task(task_id: int) -> bool:
    """取消修复任务。仅 pending/running 状态可取消。返回 True 表示成功取消。"""
    with _connect() as conn:
        row = conn.execute(
            "SELECT status FROM fix_tasks WHERE id = ?", (task_id,)
        ).fetchone()
        if not row:
            logger.debug("取消任务 #%d: 不存在", task_id)
            return False
        if row["status"] not in CANCELLABLE_STATUSES:
            logger.debug("取消任务 #%d: 当前状态=%s 不可取消", task_id, row["status"])
            return False
        conn.execute(
            "UPDATE fix_tasks SET status = ?, finished_at = datetime('now') WHERE id = ?",
            (STATUS_CANCELLED, task_id),
        )
        conn.commit()
    logger.info("任务 #%d 已取消", task_id)
    return True


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


def list_sprint_summaries(team_name: str | None = None) -> list[dict[str, str | int]]:
    """返回每个 Sprint 的快照计数摘要。"""
    with _connect() as conn:
        if team_name:
            rows = conn.execute(
                "SELECT sprint_name, COUNT(*) as snapshot_count "
                "FROM sprint_snapshot WHERE team_name = ? "
                "GROUP BY sprint_name",
                (team_name,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT sprint_name, COUNT(*) as snapshot_count "
                "FROM sprint_snapshot GROUP BY sprint_name"
            ).fetchall()
        return [{"sprint_name": r["sprint_name"], "snapshot_count": r["snapshot_count"]} for r in rows]


def load_latest_snapshot_by_sprint(sprint_name: str, team_name: str | None = None) -> tuple[list[dict], dict] | None:
    """加载指定 Sprint 的最新快照，返回 (items, meta)。
    team_name 可选但推荐传入以避免多团队同名 Sprint 混淆。"""
    with _connect() as conn:
        row = None
        if team_name:
            row = conn.execute(
                "SELECT * FROM sprint_snapshot WHERE sprint_name = ? AND team_name = ? ORDER BY id DESC LIMIT 1",
                (sprint_name, team_name),
            ).fetchone()
        if not row:
            row = conn.execute(
                "SELECT * FROM sprint_snapshot WHERE sprint_name = ? ORDER BY id DESC LIMIT 1",
                (sprint_name,),
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


# ── 应用配置持久化 ──

# 配置项元数据: key -> (默认值, 是否敏感)
_CONFIG_META: dict[str, tuple[str, bool]] = {
    "azure_devops_org": ("", False),
    "azure_devops_project": ("", False),
    "azure_devops_team": ("", False),
    "azure_devops_pat": ("", True),
    "query_states": ("To Do,In Progress,Active,New,Committed", False),
    "check_interval_minutes": ("30", False),
    "work_dir": ("", False),
    "ai_fix_timeout_seconds": ("300", False),
    "target_branch": ("develop", False),
    "notify_desktop": ("false", False),
    "notify_webhook_url": ("", False),
    "notify_pr_webhook_url": ("", False),
    "web_access_token": ("", True),
    "log_dir": ("", False),
    "ai_provider": ("auto", False),
    "ai_model": ("", False),
    "ai_api_base_url": ("", False),
    "ai_api_key": ("", True),
}


def _mask_sensitive(value: str, sensitive: bool) -> str:
    """对敏感字段做部分掩码：前4+后4可见，中间替换为 ****"""
    if not sensitive or not value:
        return value
    if len(value) <= 8:
        return "*" * len(value)
    return value[:4] + "****" + value[-4:]


def init_config_from_env(config_obj) -> bool:
    """如果 app_config 表为空，从 Config 对象和环境变量种子数据。
    返回 True 表示执行了种子操作。"""
    with _connect() as conn:
        count = conn.execute("SELECT COUNT(*) FROM app_config").fetchone()[0]
        if count > 0:
            logger.debug("app_config 表已有 %d 条记录，跳过种子", count)
            return False

    config_map = {
        "azure_devops_org": config_obj.ORG,
        "azure_devops_project": config_obj.PROJECT,
        "azure_devops_team": config_obj.TEAM,
        "azure_devops_pat": config_obj.PAT,
        "query_states": ",".join(config_obj.QUERY_STATES),
        "check_interval_minutes": str(config_obj.CHECK_INTERVAL_MINUTES),
        "work_dir": config_obj.WORK_DIR,
        "ai_fix_timeout_seconds": str(config_obj.AI_FIX_TIMEOUT_SECONDS),
        "target_branch": config_obj.TARGET_BRANCH,
        "notify_desktop": "true" if config_obj.NOTIFY_DESKTOP else "false",
        "notify_webhook_url": config_obj.NOTIFY_WEBHOOK_URL,
        "notify_pr_webhook_url": config_obj.NOTIFY_PR_WEBHOOK_URL,
        "web_access_token": config_obj.WEB_ACCESS_TOKEN,
        "log_dir": config_obj.LOG_DIR,
    }

    with _connect() as conn:
        for key, (default_val, _sensitive) in _CONFIG_META.items():
            value = config_map.get(key)
            if value is None:
                value = default_val
            conn.execute(
                "INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)",
                (key, str(value)),
            )
        conn.commit()
    logger.info("已从环境变量种子 %d 条配置到数据库", len(_CONFIG_META))
    return True


def load_all_config(for_api: bool = False) -> dict[str, str]:
    """加载全部配置。for_api=True 时敏感字段做掩码处理。"""
    result: dict[str, str] = {}
    with _connect() as conn:
        rows = conn.execute("SELECT key, value FROM app_config").fetchall()
        for r in rows:
            key = r["key"]
            value = r["value"]
            _, sensitive = _CONFIG_META.get(key, ("", False))
            if for_api and sensitive:
                value = _mask_sensitive(value, sensitive)
            result[key] = value
    # 确保所有已知 key 都有值（回退到默认）
    for key, (default_val, _sensitive) in _CONFIG_META.items():
        if key not in result:
            value = default_val
            if for_api and _sensitive:
                value = _mask_sensitive(value, _sensitive)
            result[key] = value
    return result


def save_config(data: dict[str, str]) -> tuple[dict[str, str], list[str]]:
    """保存配置到数据库。只保存已知的 key，跳过掩码未修改的敏感字段。
    返回 (全量配置含掩码, 验证错误列表)。
    """
    errors: list[str] = []

    # 验证
    org = data.get("azure_devops_org", "").strip()
    project = data.get("azure_devops_project", "").strip()
    pat = data.get("azure_devops_pat", "").strip()
    interval_str = data.get("check_interval_minutes", "30").strip()
    timeout_str = data.get("ai_fix_timeout_seconds", "300").strip()
    webhook = data.get("notify_webhook_url", "").strip()

    if not org:
        errors.append("azure_devops_org: 不能为空")
    if not project:
        errors.append("azure_devops_project: 不能为空")
    if not pat or pat == "*" * len(pat):
        # 掩码值 = 未修改
        pass
    elif not pat:
        errors.append("azure_devops_pat: 不能为空")

    try:
        interval = int(interval_str)
        if interval < 1:
            errors.append("check_interval_minutes: 必须为正整数")
    except ValueError:
        errors.append("check_interval_minutes: 必须为整数")

    try:
        timeout = int(timeout_str)
        if timeout < 1:
            errors.append("ai_fix_timeout_seconds: 必须为正整数")
    except ValueError:
        errors.append("ai_fix_timeout_seconds: 必须为整数")

    if webhook:
        if not (webhook.startswith("http://") or webhook.startswith("https://")):
            errors.append("notify_webhook_url: 必须以 http:// 或 https:// 开头")

    pr_wh = data.get("notify_pr_webhook_url", "").strip()
    if pr_wh:
        if not (pr_wh.startswith("http://") or pr_wh.startswith("https://")):
            errors.append("notify_pr_webhook_url: 必须以 http:// 或 https:// 开头")

    if errors:
        return load_all_config(for_api=True), errors

    # 写入
    with _connect() as conn:
        for key in _CONFIG_META:
            if key not in data:
                continue
            raw_value = str(data[key]).strip()
            _, sensitive = _CONFIG_META[key]
            if sensitive:
                # 检查是否为掩码值（未修改）
                existing = conn.execute(
                    "SELECT value FROM app_config WHERE key = ?", (key,)
                ).fetchone()
                if existing:
                    masked_existing = _mask_sensitive(existing["value"], True)
                    if raw_value == masked_existing or raw_value == "*" * len(raw_value):
                        continue  # 未修改，跳过
            conn.execute(
                "INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, datetime('now'))",
                (key, raw_value),
            )
        conn.commit()

    logger.info("配置已保存: %d 项", len(data))
    return load_all_config(for_api=True), []

