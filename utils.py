"""
工具函数：端口自动发现、日志配置
"""

import logging
import socket
import sys
from pathlib import Path

# ── 日志配置 ──

_log_initialized = False


def setup_logging(log_dir: str | None = None, level: int = logging.INFO):
    """初始化日志系统（仅执行一次）。

    日志输出：
    - 文件: <log_dir>/sprint_monitor.log（DEBUG 级别，保留最近 5 个文件，每个 1MB）
    - 终端: stderr（WARNING 及以上）
    """
    global _log_initialized
    if _log_initialized:
        return

    logger = logging.getLogger("sprint_monitor")
    logger.setLevel(logging.DEBUG)

    # 终端 handler（WARNING+）
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setLevel(logging.WARNING)
    console_handler.setFormatter(logging.Formatter(
        "[%(levelname)s] %(message)s"
    ))
    logger.addHandler(console_handler)

    # 文件 handler（DEBUG+，带详细时间戳和模块名）
    if log_dir:
        log_path = Path(log_dir)
        log_path.mkdir(parents=True, exist_ok=True)
        from logging.handlers import RotatingFileHandler
        file_handler = RotatingFileHandler(
            log_path / "sprint_monitor.log",
            maxBytes=1_000_000,   # 1 MB
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s:%(funcName)s:%(lineno)d  %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        ))
        logger.addHandler(file_handler)
    else:
        # 默认写到项目目录
        log_path = Path(__file__).parent / "logs"
        log_path.mkdir(parents=True, exist_ok=True)
        from logging.handlers import RotatingFileHandler
        file_handler = RotatingFileHandler(
            log_path / "sprint_monitor.log",
            maxBytes=1_000_000,
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s:%(funcName)s:%(lineno)d  %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        ))
        logger.addHandler(file_handler)

    _log_initialized = True


def get_logger(name: str = "sprint_monitor") -> logging.Logger:
    """获取 logger 实例"""
    return logging.getLogger(name)


# ── 端口自动发现 ──

def find_available_port(start_port: int = 8080, max_attempts: int = 100) -> int:
    """从 start_port 开始找可用端口，被占用则顺延 +1，最多尝试 max_attempts 次"""
    logger = get_logger()
    port = start_port
    for _ in range(max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("0.0.0.0", port))
                return port
            except OSError:
                logger.debug("端口 %d 已被占用，尝试 %d", port, port + 1)
                port += 1
    raise RuntimeError(f"在 {start_port}-{start_port + max_attempts} 范围内未找到可用端口")
