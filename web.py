"""
Web UI — Flask 服务器，提供 Sprint 看板、AI 修复建议、历史快照浏览的 Web 界面。
"""

import json
import os
import sqlite3
import threading
import warnings
from datetime import datetime
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template

from config import Config
from renderer import state_color_hex, state_bg_hex, STATE_COLORS_HEX
from db import list_snapshots, load_snapshot_by_id, load_previous_items
from utils import get_logger

logger = get_logger(__name__)

DB_PATH = Path(__file__).parent / "sprint_history.db"

# 预计算 QUERY_STATES 供模板使用
Config_QUERY_STATES = Config.QUERY_STATES

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
}

# ── Flask App ──
app = Flask(__name__)


# ── 数据读写 ──

def update_cached_data(
    iteration: dict,
    items: list[dict],
    diff_info: dict | None,
    assigned_to: str | None = None,
    team_name: str = "",
    project: str = "",
    offline: bool = False,
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


def get_cached_data() -> dict:
    with _data_lock:
        return dict(_cached_data)


def get_all_fixes() -> list[dict]:
    """获取所有 AI 修复建议"""
    db = sqlite3.connect(str(DB_PATH))
    db.row_factory = sqlite3.Row
    try:
        rows = db.execute("SELECT * FROM ai_fixes ORDER BY updated_at DESC").fetchall()
    except sqlite3.OperationalError:
        rows = []
    db.close()
    return [dict(r) for r in rows]


# ── API 路由 ──

@app.route("/api/data")
def api_data():
    """返回 Sprint 数据 JSON"""
    data = get_cached_data()
    return jsonify({
        "iteration": data["iteration"],
        "items": data["items"],
        "diff_info": data["diff_info"],
        "last_update": data["last_update"],
        "assigned_to": data["assigned_to"],
        "team_name": data["team_name"],
        "project": data["project"],
        "offline": data["offline"],
    })


@app.route("/api/fixes")
def api_fixes():
    """返回 AI 修复建议列表"""
    fixes = get_all_fixes()
    return jsonify(fixes)


@app.route("/api/history")
def api_history():
    """返回历史快照列表"""
    try:
        snapshots = list_snapshots()
        return jsonify(snapshots)
    except Exception as e:
        logger.error("获取历史快照失败: %s", e)
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
    incomplete_states_json = _json.dumps(Config_QUERY_STATES, ensure_ascii=False)
    state_colors_json = _json.dumps(STATE_COLORS_HEX, ensure_ascii=False)
    return render_template(
        "index.html",
        incomplete_states=incomplete_states_json,
        state_colors=state_colors_json,
    )


# ── 服务器启动 ──

def run_web_server(start_port: int = 8080, debug: bool = False):
    """启动 Flask Web 服务器（阻塞），start_port 应为已确认可用的端口

    优先级：waitress > flask 开发服务器
    """
    host = "0.0.0.0"

    try:
        from waitress import serve
        import logging as _logging
        _logging.getLogger("waitress").setLevel(_logging.WARNING)
        logger.info("使用 waitress 启动 Web 服务器: %s:%d", host, start_port)
        serve(app, host=host, port=start_port, threads=4)
        return
    except ImportError:
        logger.debug("waitress 未安装，使用 Flask 开发服务器")

    if not debug:
        os.environ.setdefault("FLASK_ENV", "production")
        warnings.filterwarnings("ignore", message=".*development server.*")
    logger.info("使用 Flask 开发服务器启动: %s:%d", host, start_port)
    app.run(host=host, port=start_port, debug=debug, use_reloader=False)
