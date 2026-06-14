"""
Azure DevOps Sprint 看板监控配置
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    ORG: str = os.getenv("AZURE_DEVOPS_ORG", "")
    PROJECT: str = os.getenv("AZURE_DEVOPS_PROJECT", "")
    TEAM: str = os.getenv("AZURE_DEVOPS_TEAM", "")
    PAT: str = os.getenv("AZURE_DEVOPS_PAT", "")

    # 要查询的状态列表
    QUERY_STATES: list[str] = [
        s.strip()
        for s in os.getenv("QUERY_STATES", "To Do,In Progress,Active,New,Committed").split(",")
        if s.strip()
    ]

    # 检查间隔（分钟）
    CHECK_INTERVAL_MINUTES: int = int(os.getenv("CHECK_INTERVAL_MINUTES", "30"))

    # AI 修复建议用的工作目录
    WORK_DIR: str = os.getenv("WORK_DIR", "")

    @classmethod
    def validate(cls) -> bool:
        missing = []
        if not cls.ORG:
            missing.append("AZURE_DEVOPS_ORG")
        if not cls.PROJECT:
            missing.append("AZURE_DEVOPS_PROJECT")
        if not cls.PAT:
            missing.append("AZURE_DEVOPS_PAT")
        if missing:
            raise ValueError(f"缺少必需配置: {', '.join(missing)}. 请检查 .env 文件")
        return True

    @classmethod
    def base_url(cls) -> str:
        """返回 Azure DevOps REST API 基础 URL"""
        return f"https://dev.azure.com/{cls.ORG}"

    @classmethod
    def team_url(cls) -> str:
        """返回团队级别 API URL"""
        team = cls.TEAM or cls.PROJECT  # 如果没指定 team，用 project 名作为默认 team
        return f"https://dev.azure.com/{cls.ORG}/{cls.PROJECT}/{team}"
