"""
Azure DevOps REST API 客户端
"""
import base64
import re
import requests
from typing import Any

from config import Config


def _strip_html(html: str) -> str:
    """去掉 HTML 标签，保留纯文本"""
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"</?p[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</?div[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&nbsp;", " ")
    text = text.replace("&amp;", "&")
    text = text.replace("&lt;", "<")
    text = text.replace("&gt;", ">")
    text = text.replace("&quot;", '"')
    # 合并连续空行
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


class AzureDevOpsClient:
    """封装 Azure DevOps REST API 调用"""

    def __init__(self, config: type[Config] = Config):
        self.config = config
        self._session = requests.Session()
        # Basic Auth: 用户名留空，PAT 作为密码
        auth = base64.b64encode(f":{config.PAT}".encode()).decode()
        self._session.headers.update({
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/json",
        })
        # 自动发现正确的 Team 名称
        self._team: str = self._resolve_team()

    # ------------------------------------------------------------------
    # Team 自动发现
    # ------------------------------------------------------------------

    def _resolve_team(self) -> str:
        """解析实际使用的 Team 名称（自动发现或使用配置值）

        优先级：
        1. 用户显式指定的 Team
        2. 自动扫描所有 Team，选第一个有「当前 Sprint」覆盖今天的
        3. 兜底返回第一个 Team
        """
        # 用户显式指定了 Team，直接使用
        if self.config.TEAM:
            return self.config.TEAM

        # 获取项目下所有 Team
        url = f"{self.config.base_url()}/_apis/projects/{self.config.PROJECT}/teams"
        try:
            resp = self._session.get(url, params={"api-version": "7.1"})
            if resp.status_code != 200:
                return self.config.PROJECT
            teams = resp.json().get("value", [])
            if not teams:
                return self.config.PROJECT
        except Exception:
            return self.config.PROJECT

        # 对每个 Team 查当前 Sprint，找第一个覆盖今天的
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)

        for team in teams:
            team_name = team["name"]
            try:
                iter_url = (
                    f"{self.config.base_url()}/{self.config.PROJECT}/{team_name}"
                    f"/_apis/work/teamsettings/iterations"
                )
                r = self._session.get(
                    iter_url,
                    params={"$timeframe": "current", "api-version": "7.1"},
                )
                if r.status_code == 200:
                    its = r.json().get("value", [])
                    if its:
                        attrs = its[0].get("attributes", {})
                        start = attrs.get("startDate")
                        finish = attrs.get("finishDate")
                        if start and finish:
                            start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
                            finish_dt = datetime.fromisoformat(finish.replace("Z", "+00:00"))
                            if start_dt <= now <= finish_dt:
                                return team_name
            except Exception:
                continue

        # 没有 Team 的 Sprint 覆盖今天，报错
        raise RuntimeError(
            f"项目 [{self.config.PROJECT}] 下所有团队均没有 Sprint 覆盖今天 "
            f"({now.strftime('%Y-%m-%d')})。"
            f"请在 Azure DevOps → Boards → Sprints 中设置当前 Iteration 的日期，"
            f"或在 .env 中指定 AZURE_DEVOPS_TEAM。"
        )

    @property
    def team_name(self) -> str:
        return self._team

    def team_api_url(self) -> str:
        """返回团队级别 API 基础 URL"""
        return f"{self.config.base_url()}/{self.config.PROJECT}/{self._team}"

    # ------------------------------------------------------------------
    # 身份识别
    # ------------------------------------------------------------------

    def get_my_display_name(self) -> str | None:
        """通过 PAT 获取当前用户的 displayName"""
        url = f"{self.config.base_url()}/_apis/connectionData"
        try:
            resp = self._session.get(url)  # 不带 api-version
            if resp.status_code == 200:
                user = resp.json().get("authenticatedUser", {})
                return user.get("providerDisplayName")
        except Exception:
            pass
        return None

    # ------------------------------------------------------------------
    # Sprint / Iteration
    # ------------------------------------------------------------------

    def get_current_iteration(self) -> dict[str, str]:
        """获取当前 Sprint (Iteration)，仅返回覆盖今天日期的 Sprint"""
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)

        url = f"{self.team_api_url()}/_apis/work/teamsettings/iterations"
        # 不用 $timeframe=current（Azure DevOps 在无匹配时会回退到最近一个过去的 Sprint）
        # 拉全部迭代，自己过滤
        resp = self._session.get(url, params={"api-version": "7.1"})
        resp.raise_for_status()
        data = resp.json()
        iterations = data.get("value", [])

        # 只保留 startDate <= now <= finishDate 的 Sprint
        matching = []
        for it in iterations:
            attrs = it.get("attributes", {})
            start = attrs.get("startDate")
            finish = attrs.get("finishDate")
            if start and finish:
                try:
                    start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
                    finish_dt = datetime.fromisoformat(finish.replace("Z", "+00:00"))
                    if start_dt <= now <= finish_dt:
                        matching.append((it, start_dt, finish_dt))
                except (ValueError, TypeError):
                    continue

        if not matching:
            team_label = self._team
            raise RuntimeError(
                f"团队 [{team_label}] 没有 Sprint 覆盖今天 ({now.strftime('%Y-%m-%d')})。"
                f"请在 Azure DevOps → Boards → Sprints 为 [{team_label}] 设置当前 Iteration 的日期。"
            )

        # 如果有多个（理论上不会），取第一个
        iter_info, start_dt, finish_dt = matching[0]
        return {
            "id": iter_info["id"],
            "name": iter_info["name"],
            "path": iter_info["path"],
            "startDate": start_dt.strftime("%Y-%m-%d"),
            "finishDate": finish_dt.strftime("%Y-%m-%d"),
        }

    # ------------------------------------------------------------------
    # Work Items via WIQL
    # ------------------------------------------------------------------

    def query_work_items(
        self, iteration_path: str, states: list[str] | None = None
    ) -> list[dict[str, Any]]:
        """
        通过 WIQL 查询当前 Iteration 中指定状态的 Work Items。

        参数
        ----
        iteration_path: Iteration 路径，如 "MyProject\\Sprint 1"
        states: 状态列表，如 ["To Do", "In Progress"]；传 None 表示不过滤，拉全部
        """
        where_clauses = [f"[System.IterationPath] = '{iteration_path}'"]
        if states:
            state_filter = ", ".join(f"'{s}'" for s in states)
            where_clauses.append(f"[System.State] IN ({state_filter})")

        wiql = (
            f"SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], "
            f"[System.AssignedTo], [System.CreatedDate], "
            f"[System.Description], [Microsoft.VSTS.TCM.ReproSteps] "
            f"FROM WorkItems "
            f"WHERE {' AND '.join(where_clauses)} "
            f"ORDER BY [System.State], [System.WorkItemType]"
        )

        url = f"{self.config.base_url()}/{self.config.PROJECT}/_apis/wit/wiql"
        resp = self._session.post(
            url,
            json={"query": wiql},
            params={"api-version": "7.1"},
        )
        resp.raise_for_status()
        data = resp.json()

        work_item_refs = data.get("workItems", [])
        if not work_item_refs:
            return []

        # 批量获取 Work Item 详情
        ids = [item["id"] for item in work_item_refs]
        details = self._get_work_items_batch(ids)

        # 合并 URL 与详情
        result = []
        for ref in work_item_refs:
            item_id = ref["id"]
            detail = details.get(item_id, {})
            fields = detail.get("fields", {})
            assigned_to = fields.get("System.AssignedTo", {})
            raw_desc = (
                fields.get("System.Description")
                or fields.get("Microsoft.VSTS.TCM.ReproSteps")
                or fields.get("Custom.Context")
                or ""
            )
            description = _strip_html(raw_desc) if raw_desc else ""
            result.append({
                "id": item_id,
                "url": ref["url"],
                "title": fields.get("System.Title", "N/A"),
                "state": fields.get("System.State", "N/A"),
                "type": fields.get("System.WorkItemType", "N/A"),
                "assignedTo": assigned_to.get("displayName", "Unassigned") if assigned_to else "Unassigned",
                "createdDate": fields.get("System.CreatedDate", "N/A"),
                "description": description,
                "htmlUrl": f"{self.config.base_url()}/{self.config.PROJECT}/_workitems/edit/{item_id}",
            })

        return result

    def _get_work_items_batch(self, ids: list[int]) -> dict[int, dict]:
        """批量获取 Work Item 详情（最多 200 个/次）"""
        if not ids:
            return {}

        # 分批处理（API 限制一次最多 200 个 ID）
        all_details = {}
        for i in range(0, len(ids), 200):
            batch = ids[i:i + 200]
            ids_str = ",".join(str(x) for x in batch)
            url = f"{self.config.base_url()}/{self.config.PROJECT}/_apis/wit/workitems"
            resp = self._session.get(
                url,
                params={
                    "ids": ids_str,
                    "fields": "System.Title,System.State,System.WorkItemType,System.AssignedTo,System.CreatedDate,System.Description,Microsoft.VSTS.TCM.ReproSteps,Custom.Context",
                    "api-version": "7.1",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            for item in data.get("value", []):
                all_details[item["id"]] = item

        return all_details
