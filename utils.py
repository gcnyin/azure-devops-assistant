"""
工具函数：日志配置

日志系统特性：
- 双通道输出：终端（INFO+） + 文件（DEBUG+）
- 自动日志轮转：单文件最大 5MB，保留最近 10 个备份
- 异常日志：自动包含完整调用栈
- 层级 logger：每模块独立获取 logger，自动继承根配置
"""

import atexit
import logging
import logging.handlers
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path


# ── 日志配置 ──

_log_initialized = False
_log_init_lock = threading.Lock()
_DEFAULT_MAX_BYTES = 5 * 1024 * 1024   # 5 MB
_DEFAULT_BACKUP_COUNT = 10


class _BaseFormatter(logging.Formatter):
    """使用 UTC 时区的基类 Formatter"""

    def formatTime(self, record, datefmt=None):
        dt = datetime.fromtimestamp(record.created, tz=timezone.utc)
        if datefmt:
            return dt.strftime(datefmt)
        return dt.strftime("%Y-%m-%d %H:%M:%S") + " UTC"


class _FileFormatter(_BaseFormatter):
    """文件日志 Formatter：包含完整调用栈"""


class _ConsoleFormatter(_BaseFormatter):
    """终端日志 Formatter：只显示异常类型和消息，不打印调用栈"""

    def format(self, record):
        # 保存原始值，避免影响后续 handler（如文件 handler）
        orig_exc_info = record.exc_info
        orig_exc_text = record.exc_text
        orig_msg = record.msg
        orig_args = record.args

        try:
            if record.exc_info:
                exc_type, exc_value, _ = record.exc_info
                extra = f"{exc_type.__name__}: {exc_value}" if exc_value else exc_type.__name__
                msg = record.getMessage()
                record.msg = f"{msg}  [{extra}]"
                record.args = None
                record.exc_info = None
                record.exc_text = None
            return super().format(record)
        finally:
            # 恢复原始值，不影响文件日志等后续 handler
            record.exc_info = orig_exc_info
            record.exc_text = orig_exc_text
            record.msg = orig_msg
            record.args = orig_args


# ── 终端格式（纯文本，无颜色） ──

_CONSOLE_FORMAT = _ConsoleFormatter(
    "%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

# ── 文件格式（包含模块/函数/行号，方便定位） ──

_FILE_FORMAT = _FileFormatter(
    "%(asctime)s  %(levelname)-8s  [%(name)s] %(funcName)s:%(lineno)d  -  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


def setup_logging(
    log_dir: str | None = None,
    file_level: int = logging.DEBUG,
    console_level: int = logging.INFO,
):
    """初始化日志系统（全局仅执行一次）。

    参数
    ----
    log_dir: 日志文件目录，为 None 则使用项目下 logs/ 目录
    file_level: 文件日志最低级别，默认 DEBUG
    console_level: 终端日志最低级别，默认 INFO

    输出
    ----
    - 终端 (stderr): INFO 及以上，格式紧凑，适合实时监控
    - 文件: DEBUG 及以上，含模块/函数/行号，适合事后排查
    - 自动轮转: 单文件 5MB，保留最近 10 个备份

    异常日志
    --------
    调用 logger.exception() 或 logger.error(..., exc_info=True)
    时，文件日志会包含完整调用栈，终端日志仅显示异常消息。
    """
    global _log_initialized
    with _log_init_lock:
        if _log_initialized:
            return

        # ── 根 logger（sprint_monitor） ──
        root = logging.getLogger("sprint_monitor")
        root.setLevel(logging.DEBUG)  # 整体捕获 DEBUG+，由各 handler 决定输出级别
        # 禁止传播到 Python 根 logger，避免重复输出
        root.propagate = False

        # ── 终端 handler ──
        _add_console_handler(root, console_level)

        # ── 文件 handler ──
        log_path = _resolve_log_dir(log_dir)
        _add_file_handler(root, log_path, file_level)

        # ── 退出时清理 ──
        atexit.register(logging.shutdown)

        _log_initialized = True

        # 写入启动标记
        root.info("日志系统初始化完成: 文件=%s", log_path)


def _resolve_log_dir(log_dir: str | None) -> Path:
    """解析日志目录"""
    if log_dir:
        p = Path(log_dir)
    else:
        p = Path(__file__).parent / "logs"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _add_console_handler(logger: logging.Logger, level: int) -> None:
    """添加终端 handler（纯文本，异常只显示摘要不打印调用栈）"""
    handler = logging.StreamHandler(sys.stderr)
    handler.setLevel(level)
    handler.setFormatter(_CONSOLE_FORMAT)
    logger.addHandler(handler)


def _add_file_handler(logger: logging.Logger, log_path: Path, level: int) -> None:
    """添加文件 handler（带轮转）"""
    file_path = log_path / "sprint_monitor.log"
    handler = logging.handlers.RotatingFileHandler(
        file_path,
        maxBytes=_DEFAULT_MAX_BYTES,
        backupCount=_DEFAULT_BACKUP_COUNT,
        encoding="utf-8",
        delay=True,  # 延迟打开文件，直到第一次写入
    )
    handler.setLevel(level)
    handler.setFormatter(_FILE_FORMAT)
    logger.addHandler(handler)


def get_logger(name: str = "sprint_monitor") -> logging.Logger:
    """获取 sprint_monitor 子 logger 实例。

    用法
    ----
        from utils import get_logger
        logger = get_logger(__name__)
        logger.info("处理完成: %d 条记录", count)
        logger.warning("配置缺失: %s", key)
        logger.error("请求失败", exc_info=True)

    说明
    ----
    - 返回 sprint_monitor.<name> 格式的子 logger，自动继承 handler 配置
    - 各模块通过 __name__ 获取独立 logger，日志前缀可区分来源
    - 文件日志中会显示完整 logger 名称，方便过滤排查
    """
    return logging.getLogger(f"sprint_monitor.{name}")


