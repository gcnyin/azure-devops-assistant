"""
配置模块测试：验证 Config 类的实例化与校验逻辑
"""
import pytest

from config import Config


class TestConfigValidate:
    """配置验证测试"""

    def test_validate_pass_when_all_required_set(self):
        """所有必需配置项都设置时，validate() 返回 True"""
        cfg = Config(ORG="myorg", PROJECT="myproject", PAT="mypat")
        assert cfg.validate() is True

    def test_validate_raises_when_org_missing(self):
        """缺少 AZURE_DEVOPS_ORG 时抛出 ValueError"""
        cfg = Config(ORG="", PROJECT="myproject", PAT="mypat")
        with pytest.raises(ValueError, match="AZURE_DEVOPS_ORG"):
            cfg.validate()

    def test_validate_raises_when_project_missing(self):
        """缺少 AZURE_DEVOPS_PROJECT 时抛出 ValueError"""
        cfg = Config(ORG="myorg", PROJECT="", PAT="mypat")
        with pytest.raises(ValueError, match="AZURE_DEVOPS_PROJECT"):
            cfg.validate()

    def test_validate_raises_when_pat_missing(self):
        """缺少 AZURE_DEVOPS_PAT 时抛出 ValueError"""
        cfg = Config(ORG="myorg", PROJECT="myproject", PAT="")
        with pytest.raises(ValueError, match="AZURE_DEVOPS_PAT"):
            cfg.validate()

    def test_validate_raises_when_multiple_missing(self):
        """多个配置项都缺失时，错误消息包含所有缺失项"""
        cfg = Config(ORG="", PROJECT="", PAT="")
        with pytest.raises(ValueError) as exc:
            cfg.validate()
        msg = str(exc.value)
        assert "AZURE_DEVOPS_ORG" in msg
        assert "AZURE_DEVOPS_PROJECT" in msg
        assert "AZURE_DEVOPS_PAT" in msg


class TestConfigDefaults:
    """默认值测试"""

    def test_base_url(self):
        """base_url() 返回正确的 Azure DevOps URL"""
        cfg = Config(ORG="myorg")
        assert cfg.base_url() == "https://dev.azure.com/myorg"

    def test_profile_base_url(self):
        """profile_base_url() 返回正确的 Profile API URL"""
        cfg = Config(ORG="myorg")
        assert cfg.profile_base_url() == "https://vssps.dev.azure.com/myorg"

    def test_default_query_states(self):
        """未设置 QUERY_STATES 时使用默认值"""
        cfg = Config()
        assert len(cfg.QUERY_STATES) == 5
        assert "To Do" in cfg.QUERY_STATES
        assert "In Progress" in cfg.QUERY_STATES

    def test_custom_query_states_from_list(self):
        """通过 list 传入自定义 QUERY_STATES 正确解析"""
        cfg = Config(QUERY_STATES=["New", "Active", "Closed"])
        assert cfg.QUERY_STATES == ["New", "Active", "Closed"]

    def test_custom_query_states_from_string(self):
        """通过逗号分隔字符串传入自定义 QUERY_STATES 正确解析"""
        cfg = Config(QUERY_STATES="New,Active,Closed")
        assert cfg.QUERY_STATES == ["New", "Active", "Closed"]

    def test_query_states_empty_string_handled(self):
        """空白 QUERY_STATES 只保留非空项"""
        cfg = Config(QUERY_STATES="To Do,,In Progress,  ,")
        assert cfg.QUERY_STATES == ["To Do", "In Progress"]

    def test_default_check_interval(self):
        """未设置 CHECK_INTERVAL_MINUTES 时默认 30 分钟"""
        cfg = Config()
        assert cfg.CHECK_INTERVAL_MINUTES == 30

    def test_custom_check_interval(self):
        """自定义 CHECK_INTERVAL_MINUTES 正确解析为整数"""
        cfg = Config(CHECK_INTERVAL_MINUTES=15)
        assert cfg.CHECK_INTERVAL_MINUTES == 15

    def test_notify_desktop_true_bool(self):
        """NOTIFY_DESKTOP 传入 True 时正确解析"""
        cfg = Config(NOTIFY_DESKTOP=True)
        assert cfg.NOTIFY_DESKTOP is True

    def test_notify_desktop_true_string(self):
        """NOTIFY_DESKTOP 传入字符串 'true' 时正确解析"""
        cfg = Config(NOTIFY_DESKTOP="true")
        assert cfg.NOTIFY_DESKTOP is True

    def test_notify_desktop_false_by_default(self):
        """未设置 NOTIFY_DESKTOP 时默认为 False"""
        cfg = Config()
        assert cfg.NOTIFY_DESKTOP is False

    def test_team_default_empty(self):
        """未设置 AZURE_DEVOPS_TEAM 时默认为空字符串"""
        cfg = Config()
        assert cfg.TEAM == ""

    def test_custom_team(self):
        """自定义 TEAM 正确解析"""
        cfg = Config(TEAM="MyTeam")
        assert cfg.TEAM == "MyTeam"

    def test_kwargs_override_env(self):
        """__init__ 参数优先级高于环境变量"""
        import os
        os.environ["AZURE_DEVOPS_ORG"] = "env_org"
        try:
            cfg = Config(ORG="override_org")
            assert cfg.ORG == "override_org"
        finally:
            del os.environ["AZURE_DEVOPS_ORG"]
