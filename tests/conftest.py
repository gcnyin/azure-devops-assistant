"""
测试共享 fixture，为所有测试模块提供通用工具。
"""
import os
import sys
import tempfile
from pathlib import Path

import pytest

# 确保项目根目录在 import 路径中
sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture(autouse=True)
def _disable_dotenv(monkeypatch):
    """禁止测试中加载 .env 文件，确保环境变量隔离"""
    import config
    monkeypatch.setattr(config, "load_dotenv", lambda: None)


@pytest.fixture(autouse=True)
def clean_env():
    """每个测试前清除相关环境变量，避免交叉污染"""
    keys_to_pop = [
        "AZURE_DEVOPS_ORG", "AZURE_DEVOPS_PROJECT", "AZURE_DEVOPS_TEAM",
        "AZURE_DEVOPS_PAT", "QUERY_STATES", "CHECK_INTERVAL_MINUTES",
        "WORK_DIR", "NOTIFY_DESKTOP", "NOTIFY_WEBHOOK_URL", "LOG_DIR",
    ]
    saved = {}
    for key in keys_to_pop:
        if key in os.environ:
            saved[key] = os.environ.pop(key)
    yield
    # 恢复环境变量
    for key in keys_to_pop:
        os.environ.pop(key, None)
        if key in saved:
            os.environ[key] = saved[key]


@pytest.fixture
def temp_db_dir():
    """创建临时目录用于数据库测试"""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def temp_log_dir():
    """创建临时目录用于日志测试"""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)
