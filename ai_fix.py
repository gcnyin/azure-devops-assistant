"""
AI 修复建议 — 后台线程队列，对 Bug 调用 AI agent 生成修复方案。
"""
import os
import queue
import shutil
import subprocess
import threading

from db import (
    create_fix_task, update_fix_task_status,
    STATUS_PENDING, STATUS_RUNNING, STATUS_COMPLETED, STATUS_FAILED,
)
from utils import get_logger

logger = get_logger(__name__)

# ── 后台任务队列 ──

_task_queue: queue.Queue = queue.Queue()
_worker_thread: threading.Thread | None = None
_work_dir: str = "."
_timeout_seconds: int = 300
_agent_name: str = ""
_callbacks: list = []  # 任务完成回调列表


def _which(cmd: str) -> str | None:
    return shutil.which(cmd)


def set_work_dir(work_dir: str):
    global _work_dir
    _work_dir = work_dir or "."


def set_timeout(seconds: int):
    global _timeout_seconds
    _timeout_seconds = seconds


def add_finish_callback(cb):
    """注册任务完成回调。cb(task_dict) 在任务完成后被调用。"""
    _callbacks.append(cb)


def start_worker():
    """启动后台处理线程（幂等）"""
    global _worker_thread
    if _worker_thread and _worker_thread.is_alive():
        return
    _worker_thread = threading.Thread(target=_worker_loop, daemon=True, name="ai-fix-worker")
    _worker_thread.start()
    logger.info("AI fix 后台线程已启动")


def _worker_loop():
    """后台循环：从队列取任务，串行处理"""
    while True:
        try:
            task_id, bug, prompt = _task_queue.get()
        except Exception:
            continue
        try:
            _process_one(task_id, bug, prompt)
        except Exception:
            logger.exception("任务 #%d 处理异常", task_id)
        finally:
            _task_queue.task_done()


def _process_one(task_id: int, bug: dict, prompt: str):
    """处理单个修复任务"""
    update_fix_task_status(task_id, STATUS_RUNNING, started_at="now")
    logger.info("开始处理任务 #%d: Bug #%d - %s", task_id, bug["id"], bug["title"])

    response, agent, error = _try_agent(prompt)

    if response is not None:
        update_fix_task_status(
            task_id, STATUS_COMPLETED,
            agent_name=agent,
            response=response,
            finished_at="now",
        )
        logger.info("任务 #%d 完成: agent=%s, %d 字符", task_id, agent, len(response))
    else:
        err_msg = error or f"无可用的 AI agent"
        update_fix_task_status(
            task_id, STATUS_FAILED,
            agent_name=agent,
            error=err_msg,
            finished_at="now",
        )
        logger.warning("任务 #%d 失败: %s", task_id, err_msg)

    # 触发回调
    with _connect_to_db() as conn:
        row = conn.execute("SELECT * FROM fix_tasks WHERE id = ?", (task_id,)).fetchone()
        if row:
            task_dict = dict(row)
            for cb in _callbacks:
                try:
                    cb(task_dict)
                except Exception:
                    logger.exception("任务完成回调异常")


def _connect_to_db():
    import sqlite3
    from pathlib import Path
    DB_PATH = Path(__file__).parent / "sprint_history.db"
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _try_agent(prompt: str) -> tuple[str | None, str | None, str | None]:
    """尝试调用可用的 AI agent，返回 (response, agent_name, error)"""
    candidates = [
        ("pi", lambda p: ["pi", "-p", "--approve", p]),
        ("claude", lambda p: ["claude", "-p", p, "--add-dir", _work_dir]),
        ("opencode", lambda p: ["opencode", "run", p]),
        ("codex", lambda p: ["codex", "exec", p]),
    ]

    for name, build_args in candidates:
        exe = _which(name)
        if not exe:
            continue
        logger.info("调用 AI agent [%s] 生成修复建议...", name)
        try:
            result = subprocess.run(
                build_args(prompt),
                capture_output=True,
                text=True,
                timeout=_timeout_seconds,
                cwd=_work_dir,
            )
            output = (result.stdout + result.stderr).strip()
            if output:
                logger.info("AI agent [%s] 返回 %d 字符", name, len(output))
                return f"[agent: {name}]\n\n{output}", name, None
            else:
                logger.warning("AI agent [%s] 返回空输出", name)
                return None, name, f"Agent [{name}] 返回空输出"
        except subprocess.TimeoutExpired:
            logger.warning("AI agent [%s] 超时（%d秒）", name, _timeout_seconds)
            return None, name, f"Agent [{name}] 超时（{_timeout_seconds}秒）"
        except Exception:
            logger.warning("AI agent [%s] 执行异常", name, exc_info=True)
            continue

    return None, None, "无可用的 AI agent"


# ── 公共接口 ──

def build_prompt(bug: dict) -> str:
    """生成发给 AI agent 的结构化提示词"""
    desc = bug.get("description", "").strip()
    desc_block = f"\n{desc}\n" if desc else "（无详细描述）"

    prompt = f"""你是一个代码修复助手。下面是一个 Bug，请在工作目录中找到相关代码，给出修复方案。

Bug ID: {bug['id']}
Bug 标题: {bug['title']}
Bug 描述:{desc_block}

要求：
1. 在代码仓库中定位相关文件和代码段
2. 如果可以修复，给出具体的修改方案（最好直接写代码 diff）
3. 如果无法定位或无法修复，总结你的疑问点，说明需要哪些额外信息
4. 用中文回复"""
    logger.debug("生成提示词: Bug #%d (%d 字符)", bug["id"], len(prompt))
    return prompt


def enqueue_fix_tasks(bugs: list[dict], sprint_name: str = "") -> list[int]:
    """将 Bug 列表入队，返回 task_id 列表"""
    start_worker()
    task_ids = []
    for bug in bugs:
        prompt = build_prompt(bug)
        task_id = create_fix_task(
            bug_id=bug["id"],
            bug_title=bug["title"],
            sprint_name=sprint_name,
            work_item_type=bug.get("type", "Bug"),
            prompt=prompt,
        )
        _task_queue.put((task_id, bug, prompt))
        task_ids.append(task_id)
        logger.debug("Bug #%d 已入队, task_id=%d", bug["id"], task_id)
    logger.info("%d 个修复任务已入队", len(task_ids))
    return task_ids
