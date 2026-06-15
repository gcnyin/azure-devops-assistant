"""
Web UI — Flask 服务器，提供 Sprint 看板、AI 修复建议、历史快照浏览的 Web 界面。
"""

import copy
import csv
import io
import json
import os
import threading
import warnings
from datetime import datetime
from typing import Any

from flask import Flask, jsonify, render_template, request, abort, Response

from renderer import STATE_COLORS_HEX
from db import list_snapshots, load_snapshot_by_id, load_previous_items, get_ai_fixes, diff_items
from ai_fix import process_new_bugs
from utils import get_logger

logger = get_logger(__name__)

# ── 全局数据缓存（由 main.py 更新） ──
_data_lock = threading.Lock()
_cached_data: dict[str, Any] = {
    "iteration": {},
    "items": [],
    "diff_info": None,
    "last_update": "",
    "assigned_to": "",
    "team_name": "",
    "project": "",
    "offline": False,
    "error": "",
}

# ── 认证 token（由 main.py 在启动时设置） ──
_expected_token: str = ""

# ── 查询状态列表（供模板使用，由 main.py 在启动时设置） ──
_expected_query_states: list[str] = ["To Do", "In Progress", "Active", "New", "Committed"]

# ── AI 修复用的工作目录（由 main.py 在启动时设置） ──
_work_dir: str = "."


def set_web_work_dir(work_dir: str):
    """由 main.py 调用，设置 AI 修复用的工作目录"""
    global _work_dir
    _work_dir = work_dir or "."


def set_web_token(token: str):
    """由 main.py 调用，设置 Web 访问 token"""
    global _expected_token
    _expected_token = token


def set_web_query_states(states: list[str]):
    """由 main.py 调用，设置查询状态列表（供前端模板使用）"""
    global _expected_query_states
    _expected_query_states = list(states)


# ── Flask App ──
app = Flask(__name__)


# ── 认证中间件 ──

# 不需要认证的路由端点名
_AUTH_WHITELIST = {"health", "login_page", "login_submit", "static"}


def _get_request_token() -> str | None:
    """从请求中提取 Bearer token"""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip()
    # 也支持 URL 查询参数 ?token=...（方便首次在浏览器地址栏打开时使用）
    token = request.args.get("token", "")
    if token:
        return token
    return None


@app.before_request
def _check_auth():
    """在每次请求前检查 token 认证（/health 和静态文件除外）"""
    if not _expected_token:
        # 未配置 token，不启用认证
        return None
    if request.endpoint in _AUTH_WHITELIST:
        return None
    req_token = _get_request_token()
    if req_token != _expected_token:
        # 浏览器页面请求：重定向到 /login，让用户输入 token
        if "text/html" in (request.headers.get("Accept") or ""):
            from flask import redirect
            from urllib.parse import urlencode
            next_path = request.path
            if request.query_string:
                next_path = request.path + "?" + request.query_string.decode()
            params = urlencode({"next": next_path}) if next_path != "/" else ""
            login_url = "/login" + ("?" + params if params else "")
            return redirect(login_url, 302)
        return jsonify({"error": "Unauthorized", "message": "缺少或无效的访问 token"}), 401


# ── 数据读写 ──

def update_cached_data(
    iteration: dict,
    items: list[dict],
    diff_info: dict | None,
    assigned_to: str | None = None,
    team_name: str = "",
    project: str = "",
    offline: bool = False,
    error: str = "",
):
    """由 main.py 调用，更新全局缓存"""
    with _data_lock:
        _cached_data["iteration"] = iteration
        _cached_data["items"] = items
        _cached_data["diff_info"] = diff_info
        _cached_data["last_update"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        _cached_data["assigned_to"] = assigned_to or ""
        _cached_data["team_name"] = team_name
        _cached_data["project"] = project
        _cached_data["offline"] = offline
        _cached_data["error"] = error


def get_cached_data() -> dict:
    with _data_lock:
        return copy.deepcopy(_cached_data)


# ── API 路由 ──

@app.route("/health")
def health():
    """健康检查端点，用于容器编排、Kubernetes 探针、负载均衡器检测"""
    data = get_cached_data()
    status = "error" if data["error"] else "ok"
    return jsonify({
        "status": status,
        "last_update": data["last_update"],
        "offline": data["offline"],
    })


@app.route("/api/data")
def api_data():
    """返回 Sprint 数据 JSON

    支持查询参数：
    - view=me 或 view=all: 个人视图/全量视图
    """
    data = get_cached_data()
    view_mode = request.args.get("view", "all")
    items = data["items"]
    diff_info = data["diff_info"]

    if view_mode == "me" and data["assigned_to"]:
        user_lower = data["assigned_to"].lower()
        items = [it for it in items if it.get("assignedTo", "").lower() == user_lower]
        # diff_info 也需要过滤到个人维度
        if diff_info:
            def _filter_by_user(item_list: list[dict]) -> list[dict]:
                return [it for it in (item_list or [])
                        if it.get("assignedTo", "").lower() == user_lower]
            filtered_diff = dict(diff_info)
            filtered_diff["new_items"] = _filter_by_user(diff_info.get("new_items", []))
            filtered_diff["continuing_items"] = _filter_by_user(diff_info.get("continuing_items", []))
            filtered_diff["gone_items"] = _filter_by_user(diff_info.get("gone_items", []))
            diff_info = filtered_diff

    return jsonify({
        "iteration": data["iteration"],
        "items": items,
        "diff_info": diff_info,
        "last_update": data["last_update"],
        "assigned_to": data["assigned_to"],
        "team_name": data["team_name"],
        "project": data["project"],
        "offline": data["offline"],
        "error": data["error"],
        "view_mode": view_mode,
    })


@app.route("/api/fixes")
def api_fixes():
    """返回 AI 修复建议列表"""
    fixes = get_ai_fixes()
    return jsonify(fixes)


@app.route("/api/fixes/run", methods=["POST"])
def api_fixes_run():
    """触发 AI 修复建议生成：对当前 diff 中的新 Bug 调用 AI agent"""
    data = get_cached_data()
    diff_info = data.get("diff_info")
    if not diff_info or not diff_info.get("new_items"):
        return jsonify({"ok": True, "results": [], "message": "没有新的 Work Item 可分析"})
    new_bugs = [it for it in diff_info["new_items"] if it.get("type") == "Bug"]
    if not new_bugs:
        return jsonify({"ok": True, "results": [], "message": "新增条目中没有 Bug"})
    try:
        results = process_new_bugs(new_bugs, _work_dir)
        return jsonify({
            "ok": True,
            "results": [
                {"bug_id": r[0], "bug_title": r[1], "response": r[2]}
                for r in results
            ],
            "message": f"已为 {len(results)}/{len(new_bugs)} 个 Bug 生成修复建议",
        })
    except Exception as e:
        logger.error("AI 修复建议生成失败: %s", e)
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/history")
def api_history():
    """返回历史快照列表，自动按当前团队过滤"""
    try:
        data = get_cached_data()
        team_name = data.get("team_name", "") or None
        snapshots = list_snapshots(team_name=team_name)
        return jsonify(snapshots)
    except Exception as e:
        logger.error("获取历史快照失败: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/export")
def api_export():
    """导出 Work Items 为 CSV 文件

    查询参数：
    - format=csv: 导出格式
    - view=me 或 view=all: 个人视图/全量视图
    """
    fmt = request.args.get("format", "csv")
    if fmt != "csv":
        return jsonify({"error": f"不支持导出格式: {fmt}"}), 400

    view_mode = request.args.get("view", "all")

    data = get_cached_data()
    items = data["items"]

    # 个人视图过滤
    if view_mode == "me":
        data = get_cached_data()
        assigned_to = data.get("assigned_to", "")
        if assigned_to:
            user_lower = assigned_to.lower()
            items = [it for it in items if it.get("assignedTo", "").lower() == user_lower]

    # 生成 CSV
    columns = ["id", "title", "state", "type", "assignedTo", "description"]
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_ALL)
    writer.writerow(columns)
    for it in items:
        row = [it.get(col, "") for col in columns]
        writer.writerow(row)

    csv_content = output.getvalue()
    filename = f"sprint_items_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        csv_content,
        mimetype="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/csv; charset=utf-8",
        },
    )


@app.route("/api/history/diff/<int:id1>/<int:id2>")
def api_history_diff(id1: int, id2: int):
    """对比两个历史快照的差异"""
    try:
        result1 = load_snapshot_by_id(id1)
        result2 = load_snapshot_by_id(id2)
        if result1 is None:
            return jsonify({"error": f"快照 #{id1} 不存在"}), 404
        if result2 is None:
            return jsonify({"error": f"快照 #{id2} 不存在"}), 404
        items1, meta1 = result1
        items2, meta2 = result2
        # id1 作为旧快照 (previous), id2 作为新快照 (current)
        previous = {it["id"]: it for it in items1}
        new_items, continuing_items, gone_items = diff_items(items2, previous)
        return jsonify({
            "snapshot_a": meta1,
            "snapshot_b": meta2,
            "diff": {
                "new_items": new_items,
                "continuing_items": continuing_items,
                "gone_items": gone_items,
            },
        })
    except Exception as e:
        logger.error("对比快照 %d vs %d 失败: %s", id1, id2, e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/history/<int:snapshot_id>")
def api_history_detail(snapshot_id: int):
    """返回指定历史快照的 Work Items"""
    try:
        result = load_snapshot_by_id(snapshot_id)
        if result is None:
            return jsonify({"error": "快照不存在"}), 404
        items, meta = result
        return jsonify({
            "meta": meta,
            "items": items,
        })
    except Exception as e:
        logger.error("获取快照 %d 失败: %s", snapshot_id, e)
        return jsonify({"error": str(e)}), 500


# ── 页面路由 ──

@app.route("/favicon.ico")
def favicon():
    """返回一个 1x1 透明 ICO"""
    import struct
    from flask import Response
    bmp_data = struct.pack("<IiiHHIIiiII", 40, 1, 2, 1, 32, 0, 0, 0, 0, 0, 0) + b"\x00\x00\x00\x00"
    ico_header = struct.pack("<HHH", 0, 1, 1)
    ico_entry = struct.pack("<BBBBHHII", 1, 1, 0, 0, 1, 32, len(bmp_data), 22)
    return Response(ico_header + ico_entry + bmp_data, mimetype="image/x-icon")


@app.route("/")
def index():
    import json as _json
    incomplete_states_json = _json.dumps(_expected_query_states, ensure_ascii=False)
    state_colors_json = _json.dumps(STATE_COLORS_HEX, ensure_ascii=False)
    # 将 token 注入前端，以便 JS 在 fetch 请求中携带
    web_token_json = _json.dumps(_expected_token) if _expected_token else "null"
    return render_template(
        "index.html",
        incomplete_states=incomplete_states_json,
        state_colors=state_colors_json,
        web_token=web_token_json,
    )


@app.route("/login", methods=["GET"])
def login_page():
    """登录页面：提供 token 输入表单"""
    next_path = request.args.get("next", "/")
    return render_template("login.html", next_path=next_path)


@app.route("/login", methods=["POST"])
def login_submit():
    """登录提交：验证 token 并返回结果"""
    if not _expected_token:
        return jsonify({"ok": True})
    data = request.get_json(silent=True) or {}
    submitted_token = data.get("token", "").strip()
    if submitted_token == _expected_token:
        return jsonify({"ok": True})
    return jsonify({"ok": False, "error": "Token 错误，请重试"}), 401


# ── 服务器启动 ──

def run_web_server(start_port: int = 8080, debug: bool = False, max_attempts: int = 100, host: str = "127.0.0.1"):
    """启动 Flask Web 服务器（阻塞），端口占用时自动顺延重试

    优先级：waitress > flask 开发服务器
    不再依赖提前端口检测，直接尝试绑定，被占用则 +1 重试，
    从根本上消除 TOCTOU 竞态条件。

    host 默认 127.0.0.1（仅本地访问），通过 --public 参数可改为 0.0.0.0
    """

    # ── 预先判断使用 waitress 还是 Flask 开发服务器（只需一次） ──
    use_waitress = False
    try:
        from waitress import serve
        import logging as _logging
        _logging.getLogger("waitress").setLevel(_logging.WARNING)
        use_waitress = True
    except ImportError:
        logger.debug("waitress 未安装，使用 Flask 开发服务器")
        if not debug:
            os.environ.setdefault("FLASK_ENV", "production")
            warnings.filterwarnings("ignore", message=".*development server.*")

    # ── 自动重试循环：端口占用时顺延 ──
    port = start_port
    for attempt in range(max_attempts):
        try:
            if use_waitress:
                logger.info("使用 waitress 启动 Web 服务器: %s:%d", host, port)
                serve(app, host=host, port=port, threads=4)
            else:
                logger.info("使用 Flask 开发服务器启动: %s:%d", host, port)
                app.run(host=host, port=port, debug=debug, use_reloader=False)
            return  # 服务正常退出时到达（通常不会，因为 serve/run 是阻塞的）
        except OSError as e:
            err_msg = str(e).lower()
            if "address already in use" in err_msg or "address in use" in err_msg:
                if port != start_port:
                    logger.info("端口 %d 已被占用，尝试 %d", port, port + 1)
                else:
                    logger.info("端口 %d 已被占用，已自动顺延", start_port)
                port += 1
                continue
            raise

    raise RuntimeError(
        f"在 {start_port}-{start_port + max_attempts - 1} 范围内未找到可用端口"
    )
