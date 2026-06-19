"""
Azure DevOps Sprint 看板监控配置

支持通过 __init__ 参数传入值或从环境变量读取，方便测试和不同运行环境。
用法：
    # 从环境变量读取
    config = Config()

    # 显式传入值（测试友好）
    config = Config(ORG="myorg", PROJECT="myproj", PAT="mypat")
"""
import os
from dotenv import load_dotenv

_dotenv_loaded = False


class Config:
    """可实例化的配置类，支持通过 __init__ 传入值或从环境变量读取"""

    def __init__(self, **kwargs):
        global _dotenv_loaded
        if not _dotenv_loaded:
            load_dotenv()
            _dotenv_loaded = True

        self.ORG: str = kwargs.get("ORG") or os.getenv("AZURE_DEVOPS_ORG", "")
        self.PROJECT: str = kwargs.get("PROJECT") or os.getenv("AZURE_DEVOPS_PROJECT", "")
        self.TEAM: str = kwargs.get("TEAM") or os.getenv("AZURE_DEVOPS_TEAM", "")
        self.PAT: str = kwargs.get("PAT") or os.getenv("AZURE_DEVOPS_PAT", "")

        # 要查询的状态列表：支持直接传 list 或逗号分隔字符串（从 env 读取时为字符串）
        states_raw = kwargs.get("QUERY_STATES")
        if states_raw is None:
            states_raw = os.getenv("QUERY_STATES", "To Do,In Progress,Active,New,Committed")
        if isinstance(states_raw, str):
            self.QUERY_STATES: list[str] = [
                s.strip() for s in states_raw.split(",") if s.strip()
            ]
        else:
            self.QUERY_STATES: list[str] = list(states_raw)

        # 检查间隔（分钟）
        self.CHECK_INTERVAL_MINUTES: int = int(
            kwargs.get("CHECK_INTERVAL_MINUTES")
            or os.getenv("CHECK_INTERVAL_MINUTES", "30")
        )

        # AI 修复建议用的工作目录
        self.WORK_DIR: str = kwargs.get("WORK_DIR") or os.getenv("WORK_DIR", "")

        # AI 修复超时（秒），默认 300（5分钟）
        self.AI_FIX_TIMEOUT_SECONDS: int = int(
            kwargs.get("AI_FIX_TIMEOUT_SECONDS")
            or os.getenv("AI_FIX_TIMEOUT_SECONDS", "300")
        )

        # AI 修复目标分支（用于 checkout/pull/PR base），默认 develop
        self.TARGET_BRANCH: str = (
            kwargs.get("TARGET_BRANCH") or os.getenv("AZURE_DEVOPS_TARGET_BRANCH", "develop")
        )

        # ── 通知配置 ──
        notify_val = kwargs.get("NOTIFY_DESKTOP")
        if notify_val is None:
            notify_val = os.getenv("NOTIFY_DESKTOP", "")
        self.NOTIFY_DESKTOP: bool = (
            notify_val if isinstance(notify_val, bool)
            else str(notify_val).lower() in ("true", "1", "yes")
        )
        self.NOTIFY_WEBHOOK_URL: str = (
            kwargs.get("NOTIFY_WEBHOOK_URL") or os.getenv("NOTIFY_WEBHOOK_URL", "")
        )
        notify_pr_val = kwargs.get("NOTIFY_PR_WEBHOOK_URL")
        if notify_pr_val is None:
            notify_pr_val = os.getenv("NOTIFY_PR_WEBHOOK_URL", "")
        self.NOTIFY_PR_WEBHOOK_URL: str = notify_pr_val or self.NOTIFY_WEBHOOK_URL

        # ── Web 认证 ──
        # 设置后，所有 Web API 路由（除 /health）都要求请求头携带 Authorization: Bearer <token>
        # 前端会自动在 fetch 请求中附带该 token
        # 留空则不启用认证
        self.WEB_ACCESS_TOKEN: str = (
            kwargs.get("WEB_ACCESS_TOKEN") or os.getenv("WEB_ACCESS_TOKEN", "")
        )

        # ── 日志目录 ──
        self.LOG_DIR: str = kwargs.get("LOG_DIR") or os.getenv("LOG_DIR", "")

    def validate(self) -> bool:
        """校验必需配置项，缺少时抛出 ValueError"""
        missing = []
        if not self.ORG:
            missing.append("AZURE_DEVOPS_ORG")
        if not self.PROJECT:
            missing.append("AZURE_DEVOPS_PROJECT")
        if not self.PAT:
            missing.append("AZURE_DEVOPS_PAT")
        if missing:
            raise ValueError(f"缺少必需配置: {', '.join(missing)}. 请检查 .env 文件")
        return True

    def base_url(self) -> str:
        """返回 Azure DevOps REST API 基础 URL"""
        return f"https://dev.azure.com/{self.ORG}"

    def profile_base_url(self) -> str:
        """返回 Azure DevOps Profile API 基础 URL"""
        return f"https://vssps.dev.azure.com/{self.ORG}"


