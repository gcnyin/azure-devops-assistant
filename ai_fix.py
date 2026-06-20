"""
AI 修复 — 后台线程队列，对 Bug 调用 AI agent 自动修复代码
并自动创建分支、提交、推送、创建 PR 关联到 Work Item。
"""
import json
import os
import queue
import re
import shutil
import subprocess
import threading

from config import Config
from azure_devops import AzureDevOpsClient
from db import (
    CANCELLABLE_STATUSES,
    create_fix_task, get_fix_tasks, update_fix_task_status,
    STATUS_CANCELLED, STATUS_COMPLETED, STATUS_FAILED,
    STATUS_PENDING, STATUS_RUNNING,
)
from notifier import notify_fix_result
from utils import get_logger

logger = get_logger(__name__)

# ── 后台任务队列 ──

_task_queue: queue.Queue = queue.Queue()
_worker_thread: threading.Thread | None = None
_work_dir: str = "."
_timeout_seconds: int = 300
_target_branch: str = "develop"
_ai_provider: str = "auto"


def set_work_dir(work_dir: str):
    global _work_dir
    _work_dir = work_dir or "."


def set_timeout(seconds: int):
    global _timeout_seconds
    _timeout_seconds = seconds


def set_target_branch(branch: str):
    global _target_branch
    _target_branch = branch


def set_ai_provider(provider: str):
    global _ai_provider
    _ai_provider = provider.strip().lower() if provider else "auto"


def start_worker():
    """启动后台处理线程（幂等）"""
    global _worker_thread
    if _worker_thread and _worker_thread.is_alive():
        return
    _worker_thread = threading.Thread(target=_worker_loop, daemon=True, name="ai-fix-worker")
    _worker_thread.start()
    logger.info("AI fix 后台线程已启动")


def _worker_loop():
    """后台循环：从队列取任务，串行处理。处理前检查状态，跳过已取消的任务。"""
    while True:
        try:
            task_id, bug, prompt = _task_queue.get()
        except Exception:
            continue
        try:
            # 检查任务是否已被取消
            tasks = get_fix_tasks(bug_id=bug.get("id"))
            task_status = None
            for t in tasks:
                if t["id"] == task_id:
                    task_status = t["status"]
                    break
            if task_status == STATUS_CANCELLED:
                logger.info("任务 #%d 已被取消，跳过处理", task_id)
                continue
            _process_one(task_id, bug, prompt)
        except Exception:
            logger.exception("任务 #%d 处理异常", task_id)
        finally:
            _task_queue.task_done()


# ── Git 辅助函数 ──

def _git_run(repo_path: str, *args: str, timeout: int = 60) -> subprocess.CompletedProcess:
    """在指定仓库路径下执行 git 命令"""
    cmd = ["git", "-C", repo_path] + list(args)
    logger.debug("git: %s", " ".join(cmd))
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def _scan_repos(work_dir: str) -> list[str]:
    """扫描 work_dir 下所有包含 .git 的目录，返回仓库路径列表"""
    repos = []
    for root, dirs, _files in os.walk(work_dir, topdown=True):
        if ".git" in dirs:
            repos.append(root)
            dirs[:] = []  # 不深入递归子仓库
    if not repos:
        logger.warning("WORK_DIR 下未找到任何 Git 仓库: %s", work_dir)
    else:
        logger.info("扫描到 %d 个 Git 仓库: %s", len(repos), repos)
    return sorted(repos)


def _git_get_current_branch(repo_path: str) -> str:
    """获取当前分支名，失败返回空字符串"""
    r = _git_run(repo_path, "rev-parse", "--abbrev-ref", "HEAD")
    return r.stdout.strip()


def _git_is_dirty(repo_path: str) -> bool:
    """检查仓库是否有未提交的修改"""
    r = _git_run(repo_path, "status", "--porcelain")
    return bool(r.stdout.strip())


def _git_stash(repo_path: str) -> bool:
    """stash 当前修改，返回是否确实 stash 了内容"""
    if not _git_is_dirty(repo_path):
        logger.debug("[%s] 工作区干净，跳过 stash", os.path.basename(repo_path))
        return False
    logger.info("[%s] stash 未提交修改", os.path.basename(repo_path))
    r = _git_run(repo_path, "stash", "push", "-m", "auto-stash by azure-devops-assistant")
    if r.returncode != 0:
        raise RuntimeError(f"git stash 失败: {r.stderr.strip()}")
    return True


def _git_stash_pop(repo_path: str):
    """恢复最近一次 stash"""
    r = _git_run(repo_path, "stash", "pop")
    if r.returncode != 0:
        logger.warning("[%s] git stash pop 失败: %s", os.path.basename(repo_path), r.stderr.strip())


def _git_checkout(repo_path: str, branch: str):
    """切换分支"""
    r = _git_run(repo_path, "checkout", branch)
    if r.returncode != 0:
        raise RuntimeError(f"git checkout {branch} 失败: {r.stderr.strip()}")


def _git_pull(repo_path: str, branch: str):
    """拉取最新代码"""
    r = _git_run(repo_path, "pull", "origin", branch, timeout=120)
    if r.returncode != 0:
        logger.warning("[%s] git pull %s 失败: %s", os.path.basename(repo_path), branch, r.stderr.strip())
        # pull 失败不中断流程，可能是网络问题但本地代码仍可用


def _git_create_branch(repo_path: str, branch: str):
    """创建并切换到新分支（-B 强制覆盖已存在的同名分支）"""
    r = _git_run(repo_path, "checkout", "-B", branch)
    if r.returncode != 0:
        raise RuntimeError(f"git checkout -B {branch} 失败: {r.stderr.strip()}")
    logger.info("[%s] 已切换到分支: %s", os.path.basename(repo_path), branch)


def _git_push(repo_path: str, branch: str):
    """推送分支到远程"""
    r = _git_run(repo_path, "push", "-u", "origin", branch, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"git push 失败: {r.stderr.strip()}")
    logger.info("[%s] 已推送分支: %s", os.path.basename(repo_path), branch)


def _get_repo_name(repo_path: str) -> str:
    """从 git remote origin URL 解析仓库名"""
    r = _git_run(repo_path, "remote", "get-url", "origin")
    url = r.stdout.strip()
    if not url:
        return os.path.basename(repo_path)
    # HTTPS: https://dev.azure.com/{org}/{project}/_git/{repo} 或 .../_git/{repo}.git
    m = re.search(r'/_git/(.+?)(?:\.git)?$', url)
    if m:
        return m.group(1)
    # SSH: git@ssh.dev.azure.com:v3/{org}/{project}/{repo} 或 .../{repo}.git
    m = re.search(r'/([^/]+?)(?:\.git)?$', url)
    if m:
        return m.group(1)
    return os.path.basename(repo_path)


def _build_branch_name(bug: dict) -> str:
    """根据 Bug 信息生成分支名: ai-fix/{bug_id}-{YYYYMMDD}-{HHMMSS}"""
    from datetime import datetime
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"ai-fix/{bug['id']}-{ts}"


def _parse_result_block(output: str, marker: str) -> dict | None:
    """从 AI agent 输出中解析 ---{marker}--- JSON 块"""
    m = re.search(rf'---{re.escape(marker)}---\s*\n(.*?)(?:\n\s*```)?\s*$', output, re.DOTALL)
    if not m:
        m = re.search(rf'---{re.escape(marker)}---\s*\n?(\{{.*)', output, re.DOTALL)
    if not m:
        logger.warning("AI 输出中未找到 ---%s--- 标记", marker)
        return None
    json_str = m.group(1).strip()
    json_str = re.sub(r'^```(?:json)?\s*', '', json_str)
    json_str = re.sub(r'\s*```$', '', json_str)
    try:
        result = json.loads(json_str)
        logger.info("解析 %s 成功", marker)
        return result
    except json.JSONDecodeError as e:
        logger.warning("%s JSON 解析失败: %s", marker, e)
        return None


def _restore_repos(repo_states: list[dict]):
    """恢复所有仓库到原始状态"""
    for state in reversed(repo_states):
        try:
            _git_checkout(state["path"], state["original_branch"])
            if state["stashed"]:
                _git_stash_pop(state["path"])
        except Exception:
            logger.exception("[%s] 恢复仓库状态失败", os.path.basename(state["path"]))


# ── 主处理逻辑 ──

def _process_one(task_id: int, bug: dict, prompt: str):
    """处理单个修复任务：分析阶段定位 -> 修复阶段修改 -> push -> 创建PR -> 恢复现场

    两阶段流程：
    1. 分析阶段：所有仓库 stash → checkout develop → pull，AI 只读代码定位目标仓库
    2. 修复阶段：仅对目标仓库创建 fix 分支，AI 修改代码并提交
    """
    update_fix_task_status(task_id, STATUS_RUNNING, started_at="now")
    logger.info("开始处理任务 #%d: Bug #%d - %s", task_id, bug["id"], bug["title"])

    bug_id = bug["id"]
    branch_name = _build_branch_name(bug)

    # ── 步骤 1: 扫描仓库 ──
    repos = _scan_repos(_work_dir)
    if not repos:
        update_fix_task_status(
            task_id, STATUS_FAILED,
            error=f"WORK_DIR 下未找到任何 Git 仓库: {_work_dir}",
            finished_at="now",
        )
        notify_fix_result(bug, bug_id, success=False,
                          error=f"WORK_DIR 下未找到任何 Git 仓库: {_work_dir}")
        return

    # ── 步骤 2: 准备所有仓库用于分析 (stash → checkout develop → pull) ──
    repo_states = []  # [{path, original_branch, stashed}]
    prep_failed = False
    for repo_path in repos:
        repo_name = os.path.basename(repo_path)
        try:
            original_branch = _git_get_current_branch(repo_path)
            stashed = _git_stash(repo_path)
            _git_checkout(repo_path, _target_branch)
            _git_pull(repo_path, _target_branch)
            repo_states.append({
                "path": repo_path,
                "original_branch": original_branch,
                "stashed": stashed,
            })
        except Exception as e:
            logger.error("[%s] 准备仓库失败: %s", repo_name, e)
            for state in reversed(repo_states):
                try:
                    _git_checkout(state["path"], state["original_branch"])
                    if state["stashed"]:
                        _git_stash_pop(state["path"])
                except Exception:
                    pass
            update_fix_task_status(
                task_id, STATUS_FAILED,
                error=f"准备仓库 [{repo_name}] 失败: {e}",
                finished_at="now",
            )
            notify_fix_result(bug, bug_id, success=False,
                              error=f"准备仓库 [{repo_name}] 失败: {e}")
            prep_failed = True
            break

    if prep_failed:
        return

    # ── 步骤 3: 阶段 1 — AI 分析定位目标仓库 ──
    analysis_prompt = build_analysis_prompt(bug, repos)
    analysis_response, analysis_agent, analysis_error = _try_agent(analysis_prompt)

    if analysis_response is None:
        _restore_repos(repo_states)
        update_fix_task_status(
            task_id, STATUS_FAILED,
            agent_name=analysis_agent,
            error=analysis_error or "分析阶段无可用的 AI agent",
            finished_at="now",
        )
        notify_fix_result(bug, bug_id, success=False,
                          error=analysis_error or "分析阶段无可用的 AI agent",
                          agent_name=analysis_agent or "")
        logger.warning("任务 #%d 分析阶段失败: %s", task_id, analysis_error)
        return

    analysis_result = _parse_result_block(analysis_response, 'ANALYSIS')
    if not analysis_result or not analysis_result.get("target_repos"):
        _restore_repos(repo_states)
        update_fix_task_status(
            task_id, STATUS_FAILED,
            agent_name=analysis_agent,
            error="AI 分析未能定位到目标仓库",
            response=analysis_response,
            finished_at="now",
        )
        notify_fix_result(bug, bug_id, success=False,
                          error="AI 分析未能定位到目标仓库",
                          agent_name=analysis_agent or "")
        logger.warning("任务 #%d 分析结果为空", task_id)
        return

    target_repo_paths = analysis_result["target_repos"]
    logger.info("分析阶段完成: target_repos=%s, agent=%s", target_repo_paths, analysis_agent)

    # ── 步骤 4: 仅对目标仓库创建 fix 分支 ──
    target_repos = []
    for target_path in target_repo_paths:
        repo_abs = os.path.join(_work_dir, target_path)
        matched = None
        for rp in repos:
            if os.path.normpath(repo_abs) == os.path.normpath(rp):
                matched = rp
                break
        if matched:
            try:
                _git_create_branch(matched, branch_name)
                target_repos.append(matched)
            except Exception as e:
                logger.error("[%s] 创建 fix 分支失败: %s", os.path.basename(matched), e)
        else:
            logger.warning("分析结果中的仓库路径不在扫描列表中: %s", target_path)

    if not target_repos:
        _restore_repos(repo_states)
        update_fix_task_status(
            task_id, STATUS_FAILED,
            agent_name=analysis_agent,
            error="目标仓库验证失败，无法创建 fix 分支",
            response=analysis_response,
            finished_at="now",
        )
        notify_fix_result(bug, bug_id, success=False,
                          error="目标仓库验证失败，无法创建 fix 分支",
                          agent_name=analysis_agent or "")
        return

    # ── 步骤 5: 阶段 2 — AI 修复代码 ──
    fix_prompt = build_prompt(bug, target_repos, branch_name)
    response, agent, agent_error = _try_agent(fix_prompt)

    # ── 步骤 6: 解析修复结果 ──
    fix_result = None
    if response is not None:
        fix_result = _parse_result_block(response, 'FIX_RESULT')

    # ── 步骤 7: push + 创建 PR ──
    pr_results = []
    az_client = None

    if fix_result and fix_result.get("success") and fix_result.get("repos"):
        az_client = AzureDevOpsClient()
        for repo_result in fix_result["repos"]:
            repo_rel_path = repo_result.get("path", "")
            repo_abs_path = os.path.join(_work_dir, repo_rel_path)
            _push_and_create_pr(
                repos, repo_abs_path, repo_rel_path, branch_name,
                bug, bug_id, agent, fix_result, repo_result,
                az_client, pr_results,
            )
    elif response is not None:
        # 部分成功/失败：提交已存在，仍然尝试 push（不创建 PR）
        az_client = AzureDevOpsClient()
        for repo_path in target_repos:
            repo_display = os.path.basename(repo_path)
            repo_name = _get_repo_name(repo_path)
            try:
                _git_push(repo_path, branch_name)
                logger.info("[%s] push 成功（无 PR）", repo_display)
                pr_results.append({
                    "path": os.path.relpath(repo_path, _work_dir),
                    "branch": branch_name,
                    "pr_url": None,
                    "repo_name": repo_name,
                    "pr_note": "修复阶段未完全成功，仅 push 分支未创建 PR",
                })
            except Exception as e:
                logger.error("[%s] push 失败: %s", repo_display, e)
                pr_results.append({
                    "path": os.path.relpath(repo_path, _work_dir),
                    "branch": branch_name,
                    "pr_url": None,
                    "push_error": str(e),
                })

    # ── 步骤 8: 恢复所有仓库 ──
    _restore_repos(repo_states)

    # ── 步骤 9: 保存结果 ──
    repo_results_json = json.dumps(pr_results, ensure_ascii=False) if pr_results else None
    combined_response = (
        f"[分析阶段: {analysis_agent}]\n\n{analysis_response}\n\n---\n\n"
        f"[修复阶段: {agent or 'N/A'}]\n\n{response or '(无响应)'}"
    )
    final_agent = agent or analysis_agent

    if response is not None:
        update_fix_task_status(
            task_id, STATUS_COMPLETED,
            agent_name=final_agent,
            response=combined_response,
            repo_results=repo_results_json,
            finished_at="now",
        )
        notify_fix_result(bug, bug_id, success=True,
                          agent_name=final_agent or "",
                          pr_results=pr_results if pr_results else None)
        logger.info("任务 #%d 完成: agent=%s, 响应 %d 字符, PR %d 个",
                    task_id, final_agent, len(combined_response),
                    sum(1 for r in pr_results if r.get("pr_url")))
    else:
        update_fix_task_status(
            task_id, STATUS_FAILED,
            agent_name=final_agent,
            error=agent_error or "修复阶段无可用的 AI agent",
            response=combined_response,
            repo_results=repo_results_json,
            finished_at="now",
        )
        notify_fix_result(bug, bug_id, success=False,
                          error=agent_error or "修复阶段无可用的 AI agent",
                          agent_name=final_agent or "",
                          pr_results=pr_results if pr_results else None)
        logger.warning("任务 #%d 修复阶段失败: %s", task_id, agent_error)




def _push_and_create_pr(
    repos: list[str],
    repo_abs_path: str,
    repo_rel_path: str,
    branch_name: str,
    bug: dict,
    bug_id: int,
    agent: str | None,
    fix_result: dict,
    repo_result: dict,
    az_client,
    pr_results: list,
):
    """推送分支并创建 PR"""
    repo_display = repo_rel_path or os.path.basename(repo_abs_path)
    matched_repo = None
    for rp in repos:
        if os.path.normpath(repo_abs_path) == os.path.normpath(rp):
            matched_repo = rp
            break
    if not matched_repo:
        logger.warning("仓库路径不在扫描列表中: %s, 跳过 push/PR", repo_abs_path)
        pr_results.append({**repo_result, "branch": branch_name,
                           "pr_url": None, "push_error": "仓库路径不匹配"})
        return

    repo_name = _get_repo_name(matched_repo)
    try:
        _git_push(matched_repo, branch_name)
    except Exception as e:
        logger.error("[%s] push 失败: %s", repo_display, e)
        pr_results.append({**repo_result, "branch": branch_name,
                           "pr_url": None, "push_error": str(e)})
        return

    try:
        pr_title = f"[AI Fix][{repo_name}] #{bug_id} {bug['title']}"
        pr_desc = _build_pr_description(bug, agent, fix_result, repo_result, repo_name)
        pr_url = az_client.create_pull_request(
            repo_name=repo_name,
            source_branch=branch_name,
            target_branch=_target_branch,
            title=pr_title,
            description=pr_desc,
        )
        if pr_url:
            pr_results.append({**repo_result, "branch": branch_name,
                               "pr_url": pr_url, "repo_name": repo_name})

        else:
            pr_results.append({**repo_result, "branch": branch_name,
                               "pr_url": None, "pr_error": "PR URL 为空（意外情况）"})
    except Exception as e:
        logger.error("[%s] PR 创建失败: %s", repo_display, e)
        pr_results.append({**repo_result, "branch": branch_name,
                           "pr_url": None, "pr_error": str(e)})


def _build_pr_description(bug: dict, agent: str | None, fix_result: dict,
                          repo_result: dict, repo_name: str) -> str:
    """构建 PR 描述内容"""
    html_url = bug.get("htmlUrl", "")
    summary = fix_result.get("summary", "")
    files = repo_result.get("files_modified", [])
    files_str = "\n".join(f"- {f}" for f in files) if files else "（无文件列表）"

    lines = [
        f"Fixes AB#{bug['id']}",
        "",
        f"## Bug 信息",
        f"- **Bug:** [{bug['title']}]({html_url})" if html_url else f"- **Bug:** {bug['title']}",
        f"- **AI Agent:** {agent or 'N/A'}",
        "",
        f"## 修复说明",
        summary,
        "",
        f"## 修改文件 ({repo_name})",
        files_str,
    ]
    return "\n".join(lines)


def _try_agent(prompt: str) -> tuple[str | None, str | None, str | None]:
    """尝试调用可用的 AI agent，返回 (response, agent_name, error)

    根据 _ai_provider 过滤候选列表：
    - "auto" 或空：按优先级尝试全部已知 agent
    - 指定名称（如 "claude"）：仅尝试该 agent
    """
    all_candidates = [
        ("pi", lambda p: ["pi", "-p", "--approve", p]),
        ("claude", lambda p: ["claude", "-p", p, "--add-dir", _work_dir]),
        ("opencode", lambda p: ["opencode", "run", p]),
        ("codex", lambda p: ["codex", "exec", p]),
    ]

    provider = _ai_provider if _ai_provider else "auto"
    if provider == "auto":
        candidates = list(all_candidates)
    else:
        candidates = [(n, b) for n, b in all_candidates if n == provider]
        if not candidates:
            logger.warning("配置的 AI provider [%s] 不在已知候选列表中", provider)
            return None, provider, f"未知的 AI provider: {provider}"

    env = os.environ.copy()

    errors: list[str] = []
    last_agent: str | None = None

    for name, build_args in candidates:
        exe = shutil.which(name)
        if not exe:
            # 仅对指定 provider 报错；auto 模式下跳过未安装的 agent
            if provider != "auto":
                errors.append(f"agent [{name}] 未安装或不在 PATH 中")
            continue
        last_agent = name
        logger.info("调用 AI agent [%s] 生成修复...", name)
        try:
            args = list(build_args(prompt))
            result = subprocess.run(
                args,
                capture_output=True,
                text=True,
                timeout=_timeout_seconds,
                cwd=_work_dir,
                env=env,
            )
            output = (result.stdout + result.stderr).strip()
            if output:
                logger.info("AI agent [%s] 返回 %d 字符", name, len(output))
                return f"[agent: {name}]\n\n{output}", name, None
            else:
                logger.warning("AI agent [%s] 返回空输出 (exit code %d)", name, result.returncode)
                errors.append(f"agent [{name}] 返回空输出 (exit code {result.returncode})")
                continue
        except subprocess.TimeoutExpired:
            logger.warning("AI agent [%s] 超时（%d秒）", name, _timeout_seconds)
            errors.append(f"agent [{name}] 执行超时（{_timeout_seconds}秒）")
            continue
        except Exception as e:
            logger.warning("AI agent [%s] 执行异常: %s", name, e)
            errors.append(f"agent [{name}] 执行异常: {e}")
            continue

    if errors:
        return None, last_agent, "; ".join(errors)
    return None, None, "无可用的 AI agent"


# ── 公共接口 ──

def build_analysis_prompt(bug: dict, repos: list[str]) -> str:
    """生成分析阶段的提示词：只读代码，定位需要修改的仓库"""
    desc = bug.get("description", "").strip()
    desc_block = f"\n{desc}\n" if desc else "（无详细描述）"

    repo_lines = "\n".join(f"- {os.path.relpath(r, _work_dir)}" for r in repos)

    prompt = f"""你是一个代码分析助手。下面是一个 Bug，你需要在以下仓库中**只读分析**，定位与 Bug 相关的代码所在的仓库。

Bug ID: {bug['id']}
Bug 标题: {bug['title']}
Bug 描述:{desc_block}

可分析的代码仓库（全部已切换到 {_target_branch} 分支并拉取最新代码）:
{repo_lines}

要求：
1. 阅读各仓库中的代码，定位与 Bug 相关的仓库
2. **不要修改任何文件**，只做代码分析
3. 在回复的末尾，输出如下格式的 JSON（以 ---ANALYSIS--- 单独一行开头）:

---ANALYSIS---
{{
  "target_repos": ["相对于工作目录的仓库路径"],
  "confidence": "high/medium/low",
  "reasoning": "分析理由（中文，简洁描述为什么是这些仓库）"
}}

4. 如果无法定位，设置 target_repos 为空数组，reasoning 说明原因
5. 用中文回复"""
    logger.debug("生成分析提示词: Bug #%d (%d 字符), %d 个仓库", bug["id"], len(prompt), len(repos))
    return prompt


def build_prompt(bug: dict, repos: list[str] | None = None, branch_name: str = "") -> str:
    """生成发给 AI agent 的结构化提示词，要求直接修改代码"""
    if repos is None:
        repos = _scan_repos(_work_dir)
    if not branch_name:
        branch_name = _build_branch_name(bug)

    desc = bug.get("description", "").strip()
    desc_block = f"\n{desc}\n" if desc else "（无详细描述）"

    repo_lines = "\n".join(f"- {r}" for r in repos)

    prompt = f"""你是一个代码修复助手。下面是一个 Bug，你需要在以下仓库中找到相关代码，**直接修改文件**进行修复，并提交 commit。

Bug ID: {bug['id']}
Bug 标题: {bug['title']}
Bug 描述:{desc_block}

可操作的代码仓库（每个仓库已经切换到 {branch_name} 分支）:
{repo_lines}

要求：
1. 在以上仓库中定位与 Bug 相关的代码文件
2. **直接修改源文件**（不要只给建议或 diff，要用编辑工具实际修改代码）
3. 对于每个修改过的仓库，执行 `git add -A` 然后 `git commit -m "fix: #{bug['id']} {bug['title']}"`
4. 在回复的末尾，输出如下格式的 JSON（以 ---FIX_RESULT--- 单独一行开头）:

---FIX_RESULT---
{{
  "success": true,
  "summary": "修复总结（中文，简洁描述做了什么修改）",
  "repos": [
    {{
      "path": "仓库相对路径（相对于当前目录）",
      "commit_sha": "commit 的完整 SHA",
      "files_modified": ["修改的文件相对路径列表"]
    }}
  ]
}}

5. 如果无法修复（代码无法定位、需要更多信息等），设置 success 为 false，repos 为空数组，summary 说明原因
6. 用中文回复
7. 注意：你已经处于正确的目录和分支中，直接操作文件即可"""
    logger.debug("生成提示词: Bug #%d (%d 字符), %d 个仓库", bug["id"], len(prompt), len(repos))
    return prompt


def enqueue_fix_tasks(bugs: list[dict], sprint_name: str = "") -> list[int]:
    """将 Bug 列表入队，返回 task_id 列表

    入队时存储分析阶段 prompt（与 _process_one 执行流程一致），
    避免 DB 中 prompt 字段与实际执行内容不一致。
    """
    start_worker()
    repos = _scan_repos(_work_dir)
    task_ids = []
    for bug in bugs:
        prompt = build_analysis_prompt(bug, repos)
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


def recover_pending_tasks():
    """服务器重启后恢复 orphaned 修复任务。

    - pending 任务重新入队
    - running 任务标记为 failed（server restarted during execution）
    """
    pending_tasks = get_fix_tasks(status=[STATUS_PENDING])
    if pending_tasks:
        logger.info("恢复 %d 个 pending 修复任务", len(pending_tasks))
        start_worker()
        for task in pending_tasks:
            bug = {
                "id": task["bug_id"],
                "title": task["bug_title"],
                "type": task.get("work_item_type", "Bug"),
                "description": "",
                "htmlUrl": "",
            }
            _task_queue.put((task["id"], bug, task["prompt"] or ""))
        logger.info("%d 个 pending 任务已重新入队", len(pending_tasks))

    running_tasks = get_fix_tasks(status=[STATUS_RUNNING])
    for task in running_tasks:
        update_fix_task_status(
            task["id"], STATUS_FAILED,
            error="server restarted during execution",
            finished_at="now",
        )
        logger.info("任务 #%d (Bug #%d) 标记为 failed: server restarted during execution",
                    task["id"], task["bug_id"])


