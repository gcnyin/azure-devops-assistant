"""
AI 修复建议 — 对新发现的 Bug 卡，调用 AI agent 生成修复方案。
"""
import subprocess
import shutil

from db import save_ai_fix
from utils import get_logger

logger = get_logger(__name__)


def _which(cmd: str) -> str | None:
    return shutil.which(cmd)


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


def run_agent(prompt: str, work_dir: str | None = None) -> str | None:
    """尝试调用可用的 AI agent，返回其输出"""
    work_dir = work_dir or "."

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
        logger.info("调用 AI agent [%s] 生成修复建议...", name)
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
                logger.info("AI agent [%s] 返回 %d 字符", name, len(output))
                return f"[agent: {name}]\n\n{output}"
            else:
                logger.warning("AI agent [%s] 返回空输出", name)
        except subprocess.TimeoutExpired:
            logger.warning("AI agent [%s] 超时（5分钟）", name)
            return f"[agent: {name}] 超时（5分钟）"
        except Exception:
            logger.warning("AI agent [%s] 执行异常", name, exc_info=True)
            continue

    logger.warning("无可用的 AI agent")
    return None


def process_new_bugs(new_bugs: list[dict], work_dir: str | None = None) -> list[dict]:
    """处理新发现的 Bug：生成 prompt -> 调 AI agent -> 保存结果

    Returns:
        [(bug_id, bug_title, response), ...]
    """
    results = []
    bugs = [b for b in new_bugs if b.get("type") == "Bug"]
    if not bugs:
        logger.debug("没有新的 Bug，跳过 AI 修复")
        return results

    logger.info("发现 %d 个新 Bug，开始生成 AI 修复建议", len(bugs))
    for bug in bugs:
        logger.debug("处理 Bug #%d: %s", bug["id"], bug["title"])
        prompt = build_prompt(bug)
        response = run_agent(prompt, work_dir)
        if response:
            save_ai_fix(bug["id"], bug["title"], response)
            results.append((bug["id"], bug["title"], response))
        else:
            logger.warning("Bug #%d 未能生成修复建议", bug["id"])

    logger.info("AI 修复建议生成完成: %d/%d 成功", len(results), len(bugs))
    return results
