"""
AI 修复模块测试：验证 prompt 构造、agent 调用和 Bug 处理流程
"""
import subprocess
import threading
import time

import pytest


# ── build_prompt 测试 ──

class TestBuildPrompt:
    """prompt 构造测试"""

    def test_basic_prompt_structure(self):
        """基本 prompt 包含 Bug ID、标题和结构要求"""
        from ai_fix import build_prompt

        bug = {
            "id": 123,
            "title": "登录页面样式错乱",
            "description": "用户反馈登录按钮位置偏移。",
        }
        prompt = build_prompt(bug)

        assert "Bug ID: 123" in prompt
        assert "Bug 标题: 登录页面样式错乱" in prompt
        assert "用户反馈登录按钮位置偏移。" in prompt
        assert "定位与 Bug 相关的代码文件" in prompt
        assert "直接修改源文件" in prompt
        assert "用中文回复" in prompt

    def test_empty_description_shows_placeholder(self):
        """空描述时显示占位文本"""
        from ai_fix import build_prompt

        bug = {
            "id": 456,
            "title": "空描述 Bug",
            "description": "",
        }
        prompt = build_prompt(bug)

        assert "无详细描述" in prompt
        assert "Bug ID: 456" in prompt

    def test_none_description_shows_placeholder(self):
        """description 缺失时也显示占位文本"""
        from ai_fix import build_prompt

        bug = {
            "id": 789,
            "title": "无描述字段",
        }
        prompt = build_prompt(bug)

        assert "无详细描述" in prompt
        assert "Bug ID: 789" in prompt

    def test_whitespace_only_description_shows_placeholder(self):
        """仅空格的描述被视为空"""
        from ai_fix import build_prompt

        bug = {
            "id": 999,
            "title": "空格 Bug",
            "description": "   \n  \t  ",
        }
        prompt = build_prompt(bug)

        assert "无详细描述" in prompt

    def test_multiline_description_preserved(self):
        """多行描述被保留"""
        from ai_fix import build_prompt

        bug = {
            "id": 1,
            "title": "多行 Bug",
            "description": "第一行\n第二行\n第三行",
        }
        prompt = build_prompt(bug)

        assert "第一行\n第二行\n第三行" in prompt

    def test_prompt_contains_all_requirements(self):
        """prompt 包含所有四项要求"""
        from ai_fix import build_prompt

        bug = {"id": 1, "title": "Test", "description": "desc"}
        prompt = build_prompt(bug)

        assert "1. " in prompt
        assert "2. " in prompt
        assert "3. " in prompt
        assert "4. " in prompt

    def test_prompt_length_reasonable(self):
        """长描述时 prompt 长度合理"""
        from ai_fix import build_prompt

        long_desc = "这是一个很长的描述。" * 50
        bug = {
            "id": 1,
            "title": "长标题",
            "description": long_desc,
        }
        prompt = build_prompt(bug)
        # 确保描述被完整包含
        assert len(prompt) > len(long_desc)


# ── _try_agent 测试 ──

class TestTryAgent:
    """AI agent 调用测试"""

    def test_first_available_agent_used(self, mocker):
        """按优先级选择第一个可用的 agent"""
        mocker.patch("shutil.which", return_value="/usr/local/bin/pi")
        mock_run = mocker.patch("subprocess.run")
        mock_run.return_value = mocker.MagicMock(stdout="修复方案...", stderr="")

        from ai_fix import _try_agent
        response, agent, error = _try_agent("请修复 Bug #1")

        assert response is not None
        assert "[agent: pi]" in response
        assert "修复方案..." in response
        assert agent == "pi"
        assert error is None

    def test_falls_back_to_second_agent(self, mocker):
        """第一个 agent 不可用时回退到第二个"""
        def which_side_effect(cmd):
            if cmd == "pi":
                return None
            if cmd == "claude":
                return "/usr/local/bin/claude"
            return None

        mocker.patch("shutil.which", side_effect=which_side_effect)
        mocker.patch("ai_fix._work_dir", "/tmp/test")
        mock_run = mocker.patch("subprocess.run")
        mock_run.return_value = mocker.MagicMock(stdout="Claude 修复建议", stderr="")

        from ai_fix import _try_agent
        response, agent, error = _try_agent("请修复 Bug #2")

        assert response is not None
        assert "[agent: claude]" in response
        assert "Claude 修复建议" in response
        assert agent == "claude"

    def test_no_agent_available(self, mocker):
        """所有 agent 都不可用时返回 None"""
        mocker.patch("shutil.which", return_value=None)
        mock_logger = mocker.patch("ai_fix.logger.warning")

        from ai_fix import _try_agent
        response, agent, error = _try_agent("测试 prompt")

        assert response is None
        assert agent is None
        assert error == "无可用的 AI agent"

    def test_agent_timeout_handled(self, mocker):
        """agent 执行超时时返回超时信息"""
        mocker.patch("shutil.which", return_value="/usr/local/bin/pi")
        mocker.patch("subprocess.run", side_effect=subprocess.TimeoutExpired("pi", 300))

        from ai_fix import _try_agent
        response, agent, error = _try_agent("测试 prompt")

        assert response is None
        assert agent == "pi"
        assert "超时" in error

    def test_agent_empty_output(self, mocker):
        """agent 返回空输出时记录警告"""
        mocker.patch("shutil.which", return_value="/usr/local/bin/pi")
        mock_run = mocker.patch("subprocess.run")
        mock_run.return_value = mocker.MagicMock(stdout="", stderr="")
        mock_logger = mocker.patch("ai_fix.logger.warning")

        from ai_fix import _try_agent
        response, agent, error = _try_agent("测试 prompt")

        assert response is None
        assert agent == "pi"
        assert "返回空输出" in error

    def test_agent_exception_falls_through(self, mocker):
        """一个 agent 异常时继续尝试下一个可用的"""
        def which_side_effect(cmd):
            return f"/usr/local/bin/{cmd}"

        mocker.patch("shutil.which", side_effect=which_side_effect)

        def run_side_effect(args, **kwargs):
            exe = args[0]
            if exe == "pi":
                raise OSError("pi 崩溃")
            elif exe == "claude":
                result = mocker.MagicMock()
                result.stdout = "Claude 输出"
                result.stderr = ""
                return result
            return None

        mocker.patch("subprocess.run", side_effect=run_side_effect)

        from ai_fix import _try_agent
        response, agent, error = _try_agent("测试 prompt")

        assert response is not None
        assert "[agent: claude]" in response
        assert "Claude 输出" in response
        assert agent == "claude"

    def test_combined_stdout_stderr(self, mocker):
        """agent 输出合并 stdout 和 stderr"""
        mocker.patch("shutil.which", return_value="/usr/local/bin/codex")
        mock_run = mocker.patch("subprocess.run")
        mock_run.return_value = mocker.MagicMock(stdout="方案A...", stderr="警告: 某些文件未找到")

        from ai_fix import _try_agent
        response, agent, error = _try_agent("测试 prompt")

        assert "方案A..." in response
        assert "警告: 某些文件未找到" in response


# ── enqueue_fix_tasks 测试 ──

def _make_bug(bug_id, title="Test Bug", item_type="Bug", description="测试描述"):
    return {
        "id": bug_id,
        "title": title,
        "type": item_type,
        "description": description,
    }


class TestEnqueueFixTasks:
    """enqueue_fix_tasks 测试"""

    def test_creates_tasks_and_returns_ids(self, mocker):
        """创建任务并返回 task_id 列表"""
        mocker.patch("ai_fix.start_worker")
        mock_create = mocker.patch("ai_fix.create_fix_task", side_effect=[101, 102, 103])
        mock_put = mocker.patch("ai_fix._task_queue.put")

        from ai_fix import enqueue_fix_tasks

        bugs = [
            _make_bug(1, "Bug A"),
            _make_bug(2, "Bug B"),
            _make_bug(3, "Bug C"),
        ]
        task_ids = enqueue_fix_tasks(bugs, sprint_name="Sprint 1")

        assert task_ids == [101, 102, 103]
        assert mock_create.call_count == 3
        assert mock_put.call_count == 3

    def test_empty_list_returns_empty(self):
        """空列表返回空"""
        from ai_fix import enqueue_fix_tasks
        task_ids = enqueue_fix_tasks([])
        assert task_ids == []

    def test_task_includes_sprint_name(self, mocker):
        """创建任务时传入 sprint_name"""
        mocker.patch("ai_fix.start_worker")
        mock_create = mocker.patch("ai_fix.create_fix_task", return_value=1)
        mocker.patch("ai_fix._task_queue.put")

        from ai_fix import enqueue_fix_tasks

        bugs = [_make_bug(1, "Bug X")]
        enqueue_fix_tasks(bugs, sprint_name="My Sprint")

        call_kwargs = mock_create.call_args[1]
        assert call_kwargs["sprint_name"] == "My Sprint"

    def test_worker_skips_cancelled_task(self, mocker):
        """worker 循环跳过已被取消的任务"""
        from ai_fix import _worker_loop, _task_queue

        mock_get = mocker.patch("db.get_fix_tasks", return_value=[{"id": 1, "status": "cancelled"}])
        mock_process = mocker.patch("ai_fix._process_one")

        bug = {"id": 999, "title": "Cancelled Bug"}
        _task_queue.put((1, bug, "test prompt"))

        # 在后台线程运行 worker
        t = threading.Thread(target=_worker_loop, daemon=True)
        t.start()
        # 等待 worker 处理并跳过后阻塞
        time.sleep(0.3)

        # _process_one 不应被调用
        mock_process.assert_not_called()

    def test_prompt_generated_for_each_bug(self, mocker):
        """每个 Bug 生成独立 prompt"""
        mocker.patch("ai_fix.start_worker")
        prompts = []
        def capture_create(bug_id, bug_title, sprint_name="", work_item_type="Bug", prompt=""):
            prompts.append(prompt)
            return bug_id
        mocker.patch("ai_fix.create_fix_task", side_effect=capture_create)
        mocker.patch("ai_fix._task_queue.put")

        from ai_fix import enqueue_fix_tasks

        bugs = [
            _make_bug(1, "Bug One", description="描述一"),
            _make_bug(2, "Bug Two", description="描述二"),
        ]
        enqueue_fix_tasks(bugs)

        assert len(prompts) == 2
        assert "Bug One" in prompts[0]
        assert "描述一" in prompts[0]
        assert "Bug Two" in prompts[1]
        assert "描述二" in prompts[1]


# ── _which 测试 ──

class TestWhich:
    """_which 辅助函数测试"""

    def test_which_returns_path(self, mocker):
        """返回可执行文件路径"""
        mocker.patch("shutil.which", return_value="/usr/local/bin/pi")

        from ai_fix import _which
        result = _which("pi")

        assert result == "/usr/local/bin/pi"

    def test_which_returns_none(self, mocker):
        """不可用时返回 None"""
        mocker.patch("shutil.which", return_value=None)

        from ai_fix import _which
        result = _which("nonexistent")

        assert result is None
