"""
工具函数测试：验证端口发现和日志配置逻辑
"""
import logging
from pathlib import Path

import pytest


class TestLoggingSetup:
    """日志系统测试"""

    def test_setup_logging_creates_log_file(self, temp_log_dir):
        """setup_logging 创建日志文件"""
        from utils import setup_logging

        # 重置日志状态以允许重新初始化
        import utils
        utils._log_initialized = False

        setup_logging(log_dir=str(temp_log_dir))
        log_file = temp_log_dir / "sprint_monitor.log"
        # 注意: delay=True 意味着文件在第一次写入时才创建
        # 但启动标记会触发写入
        logger = logging.getLogger("sprint_monitor")
        logger.info("测试日志写入")
        assert log_file.exists()

    def test_setup_logging_only_once(self, temp_log_dir):
        """setup_logging 全局仅执行一次"""
        import utils
        utils._log_initialized = False

        from utils import setup_logging
        setup_logging(log_dir=str(temp_log_dir))

        root = logging.getLogger("sprint_monitor")
        # 只统计非 LogCaptureHandler 的 handlers
        handler_count = len([h for h in root.handlers if not _is_capture_handler(h)])
        assert handler_count > 0

        # 再次调用不应增加 handler
        setup_logging(log_dir=str(temp_log_dir))
        new_count = len([h for h in root.handlers if not _is_capture_handler(h)])
        assert new_count == handler_count

    def test_get_logger_returns_child_logger(self):
        """get_logger 返回 sprint_monitor 的子 logger"""
        from utils import get_logger
        logger = get_logger("test_module")
        assert logger.name == "sprint_monitor.test_module"
        assert isinstance(logger, logging.Logger)

    def test_get_logger_default_name(self):
        """get_logger 无参数时返回子 logger（name=sprint_monitor）"""
        from utils import get_logger
        logger = get_logger()
        assert logger.name.startswith("sprint_monitor")
        assert isinstance(logger, logging.Logger)

    def test_root_logger_propagate_false(self, temp_log_dir):
        """根 logger 的 propagate 为 False，避免重复输出"""
        import utils
        utils._log_initialized = False

        from utils import setup_logging
        setup_logging(log_dir=str(temp_log_dir))
        root = logging.getLogger("sprint_monitor")
        assert root.propagate is False

    def test_log_levels(self, temp_log_dir):
        """终端 handler 级别为 INFO，文件 handler 级别为 DEBUG"""
        import utils
        utils._log_initialized = False

        from utils import setup_logging
        setup_logging(log_dir=str(temp_log_dir))
        root = logging.getLogger("sprint_monitor")

        handlers = [h for h in root.handlers if not _is_capture_handler(h)]
        assert len(handlers) >= 2

        has_console = False
        has_file = False
        for h in handlers:
            if isinstance(h, logging.StreamHandler) and not isinstance(h, logging.handlers.RotatingFileHandler):
                has_console = True
                assert h.level == logging.INFO
            if isinstance(h, logging.handlers.RotatingFileHandler):
                has_file = True
                assert h.level == logging.DEBUG
        assert has_console, "应有终端 handler"
        assert has_file, "应有文件 handler"

    def test_log_dir_creates_parent(self, temp_log_dir):
        """日志目录不存在时自动创建"""
        import utils
        utils._log_initialized = False

        nested_dir = temp_log_dir / "deep" / "nested"
        from utils import setup_logging
        setup_logging(log_dir=str(nested_dir))
        assert nested_dir.exists()
        assert nested_dir.is_dir()


def _is_capture_handler(handler):
    """判断是否为 pytest 的日志捕获 handler"""
    hname = type(handler).__name__
    return hname == "LogCaptureHandler"
