"""
Azure DevOps REST API 客户端
"""
import base64
from html import unescape
import re
import time
from urllib.parse import quote

import requests
from typing import Any

from config import Config
from utils import get_logger

logger = get_logger(__name__)


def _default_config() -> Config:
    """返回默认的 Config 实例（从环境变量读取），作为延迟创建的兜底"""
    return Config()


def _strip_html(html: str) -> str:
    """去掉 HTML 标签，保留纯文本"""
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"</?p[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</?div[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    # 使用标准库 html.unescape 解码所有 HTML 实体（&apos; &#39; &#x27; 等）
    text = unescape(text)
    # 将不间断空格（\xa0）统一转为普通空格
    text = text.replace('\xa0', ' ')
    # 合并连续空行
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


class AzureDevOpsClient:
    """封装 Azure DevOps REST API 调用"""

    _RETRIES = 3

    _TIMEOUT = 30  # 秒

    def __init__(self, config: Config | None = None):
        if config is None:
            config = _default_config()
        self.config: Config = config
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
    # HTTP 重试
    # ------------------------------------------------------------------

    def _request(self, method: str, url: str, **kwargs) -> requests.Response:
        """带指数退避的 HTTP 请求，自动重试 429 / 5xx / 网络异常

        行为：
        - 4xx（除 429）不重试，直接返回
        - 5xx / 429 / 网络异常：指数退避重试，最多 _RETRIES 次
        - 所有重试耗尽后，若为网络异常则抛出；若为 HTTP 错误则返回响应（由调用方处理）
        """
        kwargs.setdefault("timeout", self._TIMEOUT)
        last_status = None
        last_exception: Exception | None = None
        logger.debug("HTTP %s %s", method, url)
        for attempt in range(self._RETRIES):
            try:
                resp = self._session.request(method, url, **kwargs)
                # 成功获得 HTTP 响应后，清除之前可能遗留的网络异常
                last_exception = None
                # 4xx（除 429）不重试
                if resp.status_code < 500 and resp.status_code != 429:
                    return resp
                last_status = resp.status_code
                logger.warning(
                    "HTTP %d on %s %s (attempt %d/%d)",
                    resp.status_code, method, url, attempt + 1, self._RETRIES,
                )
                if attempt < self._RETRIES - 1:
                    wait = 2 ** attempt
                    time.sleep(wait)
            except requests.RequestException as e:
                last_exception = e
                logger.warning(
                    "请求异常 %s %s (attempt %d/%d): %s",
                    method, url, attempt + 1, self._RETRIES, e,
                )
                if attempt < self._RETRIES - 1:
                    time.sleep(2 ** attempt)

        # 所有重试耗尽：若最后一次是网络异常则抛出，否则返回最后一次 HTTP 响应
        if last_exception is not None:
            raise last_exception
        # 所有重试耗尽，返回最后一次 HTTP 响应（可能是 429 或 5xx）
        logger.error("所有重试 (%d) 耗尽: %s %s", self._RETRIES, method, url)
        return resp

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
        url = f"{self.config.base_url()}/_apis/projects/{quote(self.config.PROJECT, safe='')}/teams"
        try:
            resp = self._request("GET", url, params={"api-version": "7.1"})
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
        logger.debug("自动发现 Team: 项目下有 %d 个团队", len(teams))

        for team in teams:
            team_name = team["name"]
            try:
                iter_url = (
                    f"{self.config.base_url()}/{quote(self.config.PROJECT, safe='')}"
                    f"/{quote(team_name, safe='')}"
                    f"/_apis/work/teamsettings/iterations"
                )
                r = self._request(
                    "GET", iter_url,
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
            f"请在 Azure DevOps -> Boards -> Sprints 中设置当前 Iteration 的日期，"
            f"或在 .env 中指定 AZURE_DEVOPS_TEAM。"
        )

    @property
    def team_name(self) -> str:
        return self._team

    def team_api_url(self) -> str:
        """返回团队级别 API 基础 URL"""
        return f"{self.config.base_url()}/{quote(self.config.PROJECT, safe='')}/{quote(self._team, safe='')}"

    # ------------------------------------------------------------------
    # 身份识别
    # ------------------------------------------------------------------

    def get_my_display_name(self) -> str | None:
        """通过 PAT 获取当前用户的 displayName。

        优先使用官方 Profile API，失败时回退到 connectionData。
        """
        # 方案 1: 官方 Profile API（需要 PAT 有 User Profile (Read) 权限）
        try:
            url = f"{self.config.profile_base_url()}/_apis/profile/profiles/me"
            resp = self._request("GET", url, params={"api-version": "7.1"})
            if resp.status_code == 200:
                data = resp.json()
                display_name = data.get("displayName")
                if display_name:
                    logger.info("通过 Profile API 获取用户: %s", display_name)
                    return display_name
        except Exception:
            logger.debug("Profile API 获取用户失败，回退到 connectionData")

        # 方案 2: connectionData（常用但未公开文档）
        try:
            url = f"{self.config.base_url()}/_apis/connectionData"
            resp = self._request("GET", url)  # 不带 api-version
            if resp.status_code == 200:
                user = resp.json().get("authenticatedUser", {})
                display_name = user.get("providerDisplayName")
                if display_name:
                    logger.info("通过 connectionData 获取用户: %s", display_name)
                    return display_name
        except Exception:
            logger.debug("connectionData 获取用户也失败")

        logger.warning("无法获取用户 displayName")
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
        resp = self._request("GET", url, params={"api-version": "7.1"})
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
                f"请在 Azure DevOps -> Boards -> Sprints 为 [{team_label}] 设置当前 Iteration 的日期。"
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
        # 转义单引号：WIQL 中用两个单引号表示一个字面单引号
        safe_path = iteration_path.replace("'", "''")
        where_clauses = [f"[System.IterationPath] = '{safe_path}'"]
        if states:
            safe_states = [s.replace("'", "''") for s in states]
            state_filter = ", ".join(f"'{s}'" for s in safe_states)
            where_clauses.append(f"[System.State] IN ({state_filter})")

        wiql = (
            f"SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], "
            f"[System.AssignedTo], [System.CreatedDate], "
            f"[System.Description], [Microsoft.VSTS.TCM.ReproSteps] "
            f"FROM WorkItems "
            f"WHERE {' AND '.join(where_clauses)} "
            f"ORDER BY [System.State], [System.WorkItemType]"
        )

        url = f"{self.config.base_url()}/{quote(self.config.PROJECT, safe='')}/_apis/wit/wiql"
        resp = self._request(
            "POST", url,
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
                "htmlUrl": f"{self.config.base_url()}/{quote(self.config.PROJECT, safe='')}/_workitems/edit/{item_id}",
            })

        return result

    # ------------------------------------------------------------------
    # Pull Request
    # ------------------------------------------------------------------

    def create_pull_request(
        self,
        repo_name: str,
        source_branch: str,
        target_branch: str = "develop",
        title: str = "",
        description: str = "",
    ) -> str:
        """创建 Pull Request，返回 PR 的 HTML URL

        若 PR 已存在，查找已有 PR 并返回其 URL。
        若无法确定 URL，抛出 RuntimeError。
        """
        url = (
            f"{self.config.base_url()}"
            f"/{quote(self.config.PROJECT, safe='')}"
            f"/_apis/git/repositories/{quote(repo_name, safe='')}/pullrequests"
        )
        body = {
            "sourceRefName": f"refs/heads/{source_branch}",
            "targetRefName": f"refs/heads/{target_branch}",
            "title": title,
            "description": description,
        }
        resp = self._request("POST", url, json=body, params={"api-version": "7.1"})

        if resp.status_code == 409:
            # PR 已存在，尝试查找已有 PR
            logger.info("PR 已存在 (409)，查找已有 PR: %s -> %s", source_branch, target_branch)
            existing = self._find_existing_pr(repo_name, source_branch)
            if existing:
                logger.info("找到已有 PR: %s", existing)
                return existing
            raise RuntimeError(
                f"PR 已存在 (409) 但未找到匹配的 PR 记录，"
                f"source={source_branch}, target={target_branch}"
            )

        resp.raise_for_status()
        pr_data = resp.json()
        pr_id = pr_data.get("pullRequestId")
        pr_url = self._extract_pr_url(pr_data, repo_name, pr_id)
        if not pr_url:
            logger.warning("PR 创建成功但无法提取 URL（_links 和 pullRequestId 均缺失），响应: %s", pr_data)
        else:
            logger.info("PR 创建成功: %s", pr_url)
        return pr_url

    def _find_existing_pr(self, repo_name: str, source_branch: str) -> str:
        """查找已有 PR，先搜 active，再搜全部状态，返回 URL 或空字符串"""
        search_url = (
            f"{self.config.base_url()}"
            f"/{quote(self.config.PROJECT, safe='')}"
            f"/_apis/git/repositories/{quote(repo_name, safe='')}/pullrequests"
        )
        source_ref = f"refs/heads/{source_branch}"

        for status_filter in ["active", "all"]:
            params = {
                "searchCriteria.sourceRefName": source_ref,
                "api-version": "7.1",
            }
            if status_filter != "all":
                params["searchCriteria.status"] = status_filter
            search_resp = self._request("GET", search_url, params=params)
            if search_resp.status_code == 200:
                values = search_resp.json().get("value", [])
                if values:
                    pr_data = values[0]
                    pr_id = pr_data.get("pullRequestId")
                    pr_url = self._extract_pr_url(pr_data, repo_name, pr_id)
                    if pr_url:
                        return pr_url
        return ""

    def _extract_pr_url(self, pr_data: dict, repo_name: str, pr_id: int | None) -> str:
        """从 PR 数据中提取 HTML URL，带 fallback 构造"""
        # 优先从 _links 中提取
        pr_url = pr_data.get("_links", {}).get("html", {}).get("href", "")
        if pr_url:
            return pr_url
        # 回退：用 pullRequestId 自行构造 URL
        if pr_id:
            constructed = (
                f"{self.config.base_url()}"
                f"/{quote(self.config.PROJECT, safe='')}"
                f"/_git/{quote(repo_name, safe='')}/pullrequest/{pr_id}"
            )
            logger.debug("_links.html.href 为空，使用构造的 PR URL: %s", constructed)
            return constructed
        return ""

    def _get_work_items_batch(self, ids: list[int]) -> dict[int, dict]:
        """批量获取 Work Item 详情（最多 200 个/次）"""
        if not ids:
            return {}

        # 分批处理（API 限制一次最多 200 个 ID）
        all_details = {}
        total_batches = (len(ids) + 199) // 200
        logger.debug("批量获取 Work Items: %d 个, 分 %d 批", len(ids), total_batches)
        for i in range(0, len(ids), 200):
            batch = ids[i:i + 200]
            ids_str = ",".join(str(x) for x in batch)
            url = f"{self.config.base_url()}/{quote(self.config.PROJECT, safe='')}/_apis/wit/workitems"
            resp = self._request(
                "GET", url,
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

        logger.debug("Work Items 详情获取完成: %d 条", len(all_details))
        return all_details
