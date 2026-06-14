"""
AI 修复建议 — 对新发现的 Bug 卡，调用 AI agent 生成修复方案。
"""
import json
import subprocess
import sqlite3
import shutil
from datetime import datetime
from pathlib import Path

from config import Config

DB_PATH = Path(__file__).parent / "sprint_history.db"


def _which(cmd: str) -> str | None:
    return shutil.which(cmd)


def build_prompt(bug: dict) -> str:
    """生成发给 AI agent 的结构化提示词"""
    desc = bug.get("description", "").strip()
    desc_block = f"\n{desc}\n" if desc else "（无详细描述）"

    return f"""你是一个代码修复助手。下面是一个 Bug，请在工作目录中找到相关代码，给出修复方案。

Bug ID: {bug['id']}
Bug 标题: {bug['title']}
Bug 描述:{desc_block}

要求：
1. 在代码仓库中定位相关文件和代码段
2. 如果可以修复，给出具体的修改方案（最好直接写代码 diff）
3. 如果无法定位或无法修复，总结你的疑问点，说明需要哪些额外信息
4. 用中文回复"""


def run_agent(prompt: str, work_dir: str | None = None) -> str | None:
    """尝试调用可用的 AI agent，返回其输出"""
    work_dir = work_dir or Config.WORK_DIR or "."

    candidates = [
        ("pi", lambda p: ["pi", "-p", "--approve", p]),
        ("claude", lambda p: ["claude", "-p", p, "--add-dir", work_dir]),
        ("opencode", lambda p: ["opencode", "run", p]),
        ("codex", lambda p: ["codex", "exec", p]),
    ]

    for name, build_args in candidates:
        exe = _which(name)
        if not exe:
            continue
        try:
            result = subprocess.run(
                build_args(prompt),
                capture_output=True,
                text=True,
                timeout=300,  # 5 分钟超时
                cwd=work_dir,
            )
            output = (result.stdout + result.stderr).strip()
            if output:
                return f"[agent: {name}]\n\n{output}"
        except subprocess.TimeoutExpired:
            return f"[agent: {name}] 超时（5分钟）"
        except Exception as e:
            continue

    return None


def save_fix_result(bug_id: int, bug_title: str, response: str):
    """将 AI 修复建议存入 SQLite"""
    db = sqlite3.connect(str(DB_PATH))
    db.execute("""
        CREATE TABLE IF NOT EXISTS ai_fixes (
            bug_id INTEGER PRIMARY KEY,
            bug_title TEXT,
            response TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)
    db.execute(
        "INSERT OR REPLACE INTO ai_fixes (bug_id, bug_title, response, updated_at) "
        "VALUES (?, ?, ?, datetime('now'))",
        (bug_id, bug_title, response),
    )
    db.commit()
    db.close()


def get_all_fixes() -> list[dict]:
    """获取所有已保存的修复建议"""
    db = sqlite3.connect(str(DB_PATH))
    db.row_factory = sqlite3.Row
    rows = db.execute("SELECT * FROM ai_fixes ORDER BY updated_at DESC").fetchall()
    db.close()
    return [dict(r) for r in rows]


def process_new_bugs(new_bugs: list[dict], work_dir: str | None = None) -> list[dict]:
    """处理新发现的 Bug：生成 prompt → 调 AI agent → 保存结果

    Returns:
        [(bug_id, bug_title, response), ...]
    """
    results = []
    bugs = [b for b in new_bugs if b.get("type") == "Bug"]
    if not bugs:
        return results

    for bug in bugs:
        prompt = build_prompt(bug)
        response = run_agent(prompt, work_dir)
        if response:
            save_fix_result(bug["id"], bug["title"], response)
            results.append((bug["id"], bug["title"], response))

    return results
