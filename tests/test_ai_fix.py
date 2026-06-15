"""
AI 修复模块测试：验证 prompt 构造、agent 调用和 Bug 处理流程
"""
import subprocess

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
        assert "定位相关文件和代码段" in prompt
        assert "给出具体的修改方案" in prompt
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


# ── run_agent 测试 ──

class TestRunAgent:
    """AI agent 调用测试"""

    def test_first_available_agent_used(self, mocker):
        """按优先级选择第一个可用的 agent"""
        # 让 pi 可用
        mocker.patch("shutil.which", return_value="/usr/local/bin/pi")
        mock_run = mocker.patch("subprocess.run")
        mock_run.return_value = mocker.MagicMock(
            stdout="修复方案...",
            stderr="",
        )

        from ai_fix import run_agent
        result = run_agent("请修复 Bug #1", work_dir="/tmp/test")

        assert result is not None
        assert "[agent: pi]" in result
        assert "修复方案..." in result
        # 验证 subprocess.run 参数
        args = mock_run.call_args[0][0]
        assert args[0] == "pi"

    def test_falls_back_to_second_agent(self, mocker):
        """第一个 agent 不可用时回退到第二个"""
        def which_side_effect(cmd):
            # pi 不存在，claude 存在
            if cmd == "pi":
                return None
            if cmd == "claude":
                return "/usr/local/bin/claude"
            return None

        mocker.patch("shutil.which", side_effect=which_side_effect)
        mock_run = mocker.patch("subprocess.run")
        mock_run.return_value = mocker.MagicMock(
            stdout="Claude 修复建议",
            stderr="",
        )

        from ai_fix import run_agent
        result = run_agent("请修复 Bug #2", work_dir="/tmp/test")

        assert result is not None
        assert "[agent: claude]" in result
        assert "Claude 修复建议" in result

    def test_no_agent_available(self, mocker):
        """所有 agent 都不可用时返回 None"""
        mocker.patch("shutil.which", return_value=None)
        mock_run = mocker.patch("subprocess.run")
        mock_logger = mocker.patch("ai_fix.logger.warning")

        from ai_fix import run_agent
        result = run_agent("测试 prompt")

        assert result is None
        mock_run.assert_not_called()
        mock_logger.assert_called_once()
        assert "无可用的 AI agent" in mock_logger.call_args[0][0]

    def test_agent_timeout_handled(self, mocker):
        """agent 执行超时时返回超时信息"""
        mocker.patch("shutil.which", return_value="/usr/local/bin/pi")
        mock_run = mocker.patch("subprocess.run", side_effect=subprocess.TimeoutExpired("pi", 300))

        from ai_fix import run_agent
        result = run_agent("测试 prompt")

        assert result is not None
        assert "[agent: pi]" in result
        assert "超时" in result

    def test_agent_empty_output(self, mocker):
        """agent 返回空输出时记录警告并继续尝试下一个"""
        # 只让 pi 可用，避免所有 agent 都遍历导致多次日志
        def which_side_effect(cmd):
            if cmd == "pi":
                return "/usr/local/bin/pi"
            return None

        mocker.patch("shutil.which", side_effect=which_side_effect)
        mock_run = mocker.patch("subprocess.run")
        mock_run.return_value = mocker.MagicMock(stdout="", stderr="")
        mock_logger = mocker.patch("ai_fix.logger.warning")

        from ai_fix import run_agent
        result = run_agent("测试 prompt")

        # pi 返回空输出，然后没有其他 agent 可用，最终返回 None
        assert result is None
        # 应有两条日志：pi 返回空输出 + 无可用的 AI agent
        assert mock_logger.call_count == 2
        assert "返回空输出" in mock_logger.call_args_list[0][0][0]
        assert "无可用的 AI agent" in mock_logger.call_args_list[1][0][0]

    def test_agent_exception_falls_through(self, mocker):
        """一个 agent 异常时继续尝试下一个可用的"""
        call_order = []

        def which_side_effect(cmd):
            # pi 和 claude 都存在
            return f"/usr/local/bin/{cmd}"

        mocker.patch("shutil.which", side_effect=which_side_effect)

        def run_side_effect(args, **kwargs):
            call_order.append("run")
            exe = args[0]
            if exe == "pi":
                raise OSError("pi 崩溃")
            elif exe == "claude":
                result = mocker.MagicMock()
                result.stdout = "Claude 输出"
                result.stderr = ""
                return result
            return None

        mock_run = mocker.patch("subprocess.run", side_effect=run_side_effect)
        mock_logger = mocker.patch("ai_fix.logger.warning")

        from ai_fix import run_agent
        result = run_agent("测试 prompt")

        assert result is not None
        assert "[agent: claude]" in result
        assert "Claude 输出" in result
        # 至少有一次警告（pi 异常）
        assert mock_logger.call_count >= 1

    def test_combined_stdout_stderr(self, mocker):
        """agent 输出合并 stdout 和 stderr"""
        mocker.patch("shutil.which", return_value="/usr/local/bin/codex")
        mock_run = mocker.patch("subprocess.run")
        mock_run.return_value = mocker.MagicMock(
            stdout="方案A...",
            stderr="警告: 某些文件未找到",
        )

        from ai_fix import run_agent
        result = run_agent("测试 prompt")

        assert "方案A..." in result
        assert "警告: 某些文件未找到" in result

    def test_default_work_dir(self, mocker):
        """未指定 work_dir 时使用当前目录 '.'"""
        mocker.patch("shutil.which", return_value="/usr/local/bin/pi")
        mock_run = mocker.patch("subprocess.run")
        mock_run.return_value = mocker.MagicMock(stdout="ok", stderr="")

        from ai_fix import run_agent
        run_agent("测试 prompt")

        # 验证 cwd 参数
        assert mock_run.call_args[1]["cwd"] == "."

    def test_custom_work_dir(self, mocker):
        """指定 work_dir 时传递给 subprocess"""
        mocker.patch("shutil.which", return_value="/usr/local/bin/pi")
        mock_run = mocker.patch("subprocess.run")
        mock_run.return_value = mocker.MagicMock(stdout="ok", stderr="")

        from ai_fix import run_agent
        run_agent("测试 prompt", work_dir="/home/user/project")

        assert mock_run.call_args[1]["cwd"] == "/home/user/project"


# ── process_new_bugs 测试 ──

def _make_bug(bug_id, title="Test Bug", item_type="Bug", description="测试描述"):
    return {
        "id": bug_id,
        "title": title,
        "type": item_type,
        "description": description,
    }


class TestProcessNewBugs:
    """process_new_bugs 集成流程测试"""

    def test_no_bugs_skips_processing(self, mocker):
        """没有 Bug 类型的工作项时直接返回空列表"""
        mock_run_agent = mocker.patch("ai_fix.run_agent")
        mock_save = mocker.patch("ai_fix.save_ai_fix")

        from ai_fix import process_new_bugs

        items = [
            _make_bug(1, item_type="Task"),
            _make_bug(2, item_type="Feature"),
        ]
        results = process_new_bugs(items)

        assert results == []
        mock_run_agent.assert_not_called()
        mock_save.assert_not_called()

    def test_empty_list_returns_empty(self, mocker):
        """空列表返回空"""
        mock_run_agent = mocker.patch("ai_fix.run_agent")

        from ai_fix import process_new_bugs
        results = process_new_bugs([])

        assert results == []
        mock_run_agent.assert_not_called()

    def test_single_bug_processed(self, mocker):
        """单个 Bug 被成功处理"""
        mock_run_agent = mocker.patch("ai_fix.run_agent", return_value="修复建议: 修改第 42 行")
        mock_save = mocker.patch("ai_fix.save_ai_fix")

        from ai_fix import process_new_bugs

        bugs = [_make_bug(123, "登录 Bug")]
        results = process_new_bugs(bugs)

        assert len(results) == 1
        assert results[0][0] == 123
        assert results[0][1] == "登录 Bug"
        assert "修复建议" in results[0][2]

        mock_run_agent.assert_called_once()
        mock_save.assert_called_once_with(123, "登录 Bug", "修复建议: 修改第 42 行")

    def test_multiple_bugs_all_processed(self, mocker):
        """多个 Bug 全部被处理"""
        responses = [
            "修复方案 A",
            "修复方案 B",
            "修复方案 C",
        ]
        mock_run_agent = mocker.patch("ai_fix.run_agent", side_effect=responses)
        mock_save = mocker.patch("ai_fix.save_ai_fix")

        from ai_fix import process_new_bugs

        bugs = [
            _make_bug(1, "Bug A"),
            _make_bug(2, "Bug B"),
            _make_bug(3, "Bug C"),
        ]
        results = process_new_bugs(bugs)

        assert len(results) == 3
        assert results[0][0] == 1
        assert results[1][0] == 2
        assert results[2][0] == 3
        assert mock_run_agent.call_count == 3
        assert mock_save.call_count == 3

    def test_non_bug_items_filtered_out(self, mocker):
        """非 Bug 项被过滤，只有 Bug 被处理"""
        mock_run_agent = mocker.patch("ai_fix.run_agent", return_value="修复建议")
        mock_save = mocker.patch("ai_fix.save_ai_fix")

        from ai_fix import process_new_bugs

        items = [
            _make_bug(1, item_type="Task"),
            _make_bug(2, item_type="Bug", title="真正的 Bug"),
            _make_bug(3, item_type="Feature"),
            _make_bug(4, item_type="Bug", title="另一个 Bug"),
            _make_bug(5, item_type="Issue"),
        ]
        results = process_new_bugs(items)

        assert len(results) == 2
        assert results[0][0] == 2
        assert results[1][0] == 4
        assert mock_run_agent.call_count == 2

    def test_agent_fails_partial_results(self, mocker):
        """部分 agent 调用失败时，仍返回成功的部分"""
        def run_agent_side_effect(prompt, work_dir=None):
            if "Bug A" in prompt:
                return "修复 A"
            if "Bug B" in prompt:
                return None  # 模拟失败
            if "Bug C" in prompt:
                return "修复 C"
            return None

        mock_run_agent = mocker.patch("ai_fix.run_agent", side_effect=run_agent_side_effect)
        mock_save = mocker.patch("ai_fix.save_ai_fix")

        from ai_fix import process_new_bugs

        bugs = [
            _make_bug(1, "Bug A"),
            _make_bug(2, "Bug B"),  # 会失败
            _make_bug(3, "Bug C"),
        ]
        results = process_new_bugs(bugs)

        assert len(results) == 2
        assert results[0][0] == 1
        assert results[1][0] == 3
        assert mock_save.call_count == 2  # 失败的那个不保存

    def test_all_agents_fail(self, mocker):
        """所有 agent 都失败时返回空列表"""
        mock_run_agent = mocker.patch("ai_fix.run_agent", return_value=None)
        mock_save = mocker.patch("ai_fix.save_ai_fix")

        from ai_fix import process_new_bugs

        bugs = [_make_bug(1, "Bug X"), _make_bug(2, "Bug Y")]
        results = process_new_bugs(bugs)

        assert results == []
        assert mock_save.call_count == 0

    def test_prompt_built_for_each_bug(self, mocker):
        """每个 Bug 使用独立的 prompt"""
        prompts_generated = []
        original_build = None

        import ai_fix
        original_build = ai_fix.build_prompt

        def build_side_effect(bug):
            prompt = original_build(bug)
            prompts_generated.append(prompt)
            return prompt

        mocker.patch("ai_fix.build_prompt", side_effect=build_side_effect)
        mocker.patch("ai_fix.run_agent", return_value="修复建议")
        mocker.patch("ai_fix.save_ai_fix")

        from ai_fix import process_new_bugs

        bugs = [
            _make_bug(1, "Bug One", description="描述一"),
            _make_bug(2, "Bug Two", description="描述二"),
        ]
        process_new_bugs(bugs)

        assert len(prompts_generated) == 2
        assert "Bug One" in prompts_generated[0]
        assert "描述一" in prompts_generated[0]
        assert "Bug Two" in prompts_generated[1]
        assert "描述二" in prompts_generated[1]

    def test_mixed_item_types_with_no_bug(self, mocker):
        """混合类型中无 Bug 时跳过处理"""
        mock_run_agent = mocker.patch("ai_fix.run_agent")

        from ai_fix import process_new_bugs

        items = [
            _make_bug(1, item_type="Task"),
            _make_bug(2, item_type="Epic"),
        ]
        results = process_new_bugs(items)

        assert results == []
        mock_run_agent.assert_not_called()


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
