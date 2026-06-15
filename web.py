"""
Web UI — Flask server providing Sprint board, AI fixes, history snapshot APIs.
"""

import copy
import csv
import io
import os
import threading
import warnings
from datetime import datetime
from typing import Any

from flask import Flask, jsonify, request, Response, send_file

from renderer import STATE_COLORS_HEX
from db import (
    list_snapshots, load_snapshot_by_id, load_previous_items, diff_items,
    get_fix_tasks, get_bug_fix_status_map, ALL_STATUSES,
)
from ai_fix import enqueue_fix_tasks, set_work_dir as ai_set_work_dir, set_timeout as ai_set_timeout, add_finish_callback
from notifier import notify_fix_tasks_completed
from utils import get_logger

logger = get_logger(__name__)

# ── Global data cache (updated by main.py) ──
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

# ── Query states list (set by main.py at startup) ──
_expected_query_states: list[str] = ["To Do", "In Progress", "Active", "New", "Committed"]

# ── AI fix working directory (set by main.py at startup) ──
_work_dir: str = "."


def set_web_work_dir(work_dir: str):
    global _work_dir
    _work_dir = work_dir or "."
    ai_set_work_dir(_work_dir)


def set_web_query_states(states: list[str]):
    global _expected_query_states
    _expected_query_states = list(states)


# ── Flask App ──
app = Flask(__name__, static_folder="static", static_url_path="/static")


# ── Data read/write ──

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


# ── API Routes ──

@app.route("/health")
def health():
    data = get_cached_data()
    status = "error" if data["error"] else "ok"
    return jsonify({
        "status": status,
        "last_update": data["last_update"],
        "offline": data["offline"],
    })


@app.route("/api/config")
def api_config():
    return jsonify({
        "incomplete_states": _expected_query_states,
        "state_colors": STATE_COLORS_HEX,
    })


@app.route("/api/data")
def api_data():
    data = get_cached_data()
    view_mode = request.args.get("view", "all")
    items = data["items"]
    diff_info = data["diff_info"]

    if view_mode == "me" and data["assigned_to"]:
        user_lower = data["assigned_to"].lower()
        items = [it for it in items if it.get("assignedTo", "").lower() == user_lower]
        if diff_info:
            def _filter_by_user(item_list: list[dict]) -> list[dict]:
                return [it for it in (item_list or [])
                        if it.get("assignedTo", "").lower() == user_lower]
            filtered_diff = dict(diff_info)
            filtered_diff["new_items"] = _filter_by_user(diff_info.get("new_items", []))
            filtered_diff["continuing_items"] = _filter_by_user(diff_info.get("continuing_items", []))
            filtered_diff["gone_items"] = _filter_by_user(diff_info.get("gone_items", []))
            diff_info = filtered_diff

    # 附加每个 Bug 的修复状态
    fix_status_map = get_bug_fix_status_map()
    items_with_status = []
    for it in items:
        it_copy = dict(it)
        status_info = fix_status_map.get(it["id"])
        if status_info:
            it_copy["fix_status"] = status_info["status"]
            it_copy["fix_created_at"] = status_info["created_at"]
            it_copy["fix_started_at"] = status_info["started_at"]
        else:
            it_copy["fix_status"] = None
            it_copy["fix_created_at"] = None
            it_copy["fix_started_at"] = None
        items_with_status.append(it_copy)

    return jsonify({
        "iteration": data["iteration"],
        "items": items_with_status,
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
    status_str = request.args.get("status", "")
    bug_id_str = request.args.get("bug_id", "")

    status = None
    if status_str:
        parts = [s.strip() for s in status_str.split(",") if s.strip() in ALL_STATUSES]
        if len(parts) == 1:
            status = parts[0]
        elif len(parts) > 1:
            status = parts

    bug_id = int(bug_id_str) if bug_id_str else None

    tasks = get_fix_tasks(status=status, bug_id=bug_id)
    return jsonify(tasks)


@app.route("/api/fixes/run", methods=["POST"])
def api_fixes_run():
    body = request.get_json(silent=True) or {}
    bug_ids = body.get("bug_ids", [])

    if not bug_ids:
        return jsonify({"ok": True, "task_ids": [], "message": "No bug IDs provided"})

    data = get_cached_data()
    all_items = data.get("items", [])
    sprint_name = data.get("iteration", {}).get("name", "")

    items_by_id = {it["id"]: it for it in all_items}
    bugs = [items_by_id[bid] for bid in bug_ids if bid in items_by_id]

    if not bugs:
        return jsonify({"ok": True, "task_ids": [], "message": "No matching bugs found in current data"})

    try:
        task_ids = enqueue_fix_tasks(bugs, sprint_name=sprint_name)
        return jsonify({
            "ok": True,
            "task_ids": task_ids,
            "message": f"{len(task_ids)} fix tasks queued",
        })
    except Exception as e:
        logger.error("AI fix task creation failed: %s", e)
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/history")
def api_history():
    try:
        data = get_cached_data()
        team_name = data.get("team_name", "") or None
        snapshots = list_snapshots(team_name=team_name)
        return jsonify(snapshots)
    except Exception as e:
        logger.error("Failed to load history: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/export")
def api_export():
    fmt = request.args.get("format", "csv")
    if fmt != "csv":
        return jsonify({"error": f"Unsupported format: {fmt}"}), 400

    view_mode = request.args.get("view", "all")
    data = get_cached_data()
    items = data["items"]

    if view_mode == "me":
        assigned_to = data.get("assigned_to", "")
        if assigned_to:
            user_lower = assigned_to.lower()
            items = [it for it in items if it.get("assignedTo", "").lower() == user_lower]

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
    try:
        result1 = load_snapshot_by_id(id1)
        result2 = load_snapshot_by_id(id2)
        if result1 is None:
            return jsonify({"error": f"Snapshot #{id1} not found"}), 404
        if result2 is None:
            return jsonify({"error": f"Snapshot #{id2} not found"}), 404
        items1, meta1 = result1
        items2, meta2 = result2
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
        logger.error("Snapshot diff %d vs %d failed: %s", id1, id2, e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/history/<int:snapshot_id>")
def api_history_detail(snapshot_id: int):
    try:
        result = load_snapshot_by_id(snapshot_id)
        if result is None:
            return jsonify({"error": "Snapshot not found"}), 404
        items, meta = result
        return jsonify({
            "meta": meta,
            "items": items,
        })
    except Exception as e:
        logger.error("Snapshot %d load failed: %s", snapshot_id, e)
        return jsonify({"error": str(e)}), 500


# ── Page Routes ──

@app.route("/favicon.ico")
def favicon():
    import struct
    bmp_data = struct.pack("<IiiHHIIiiII", 40, 1, 2, 1, 32, 0, 0, 0, 0, 0, 0) + b"\x00\x00\x00\x00"
    ico_header = struct.pack("<HHH", 0, 1, 1)
    ico_entry = struct.pack("<BBBBHHII", 1, 1, 0, 0, 1, 32, len(bmp_data), 22)
    return Response(ico_header + ico_entry + bmp_data, mimetype="image/x-icon")


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_spa(path: str):
    """Serve the SPA for all non-API routes. Client-side routing handles the rest."""
    static_dir = os.path.join(app.root_path, "static")
    # If path points to an actual file, serve it
    if path:
        file_path = os.path.join(static_dir, path)
        if os.path.isfile(file_path):
            return send_file(file_path)
    # Otherwise serve index.html for client-side routing
    return send_file(os.path.join(static_dir, "index.html"))


# ── Server Start ──

def run_web_server(start_port: int = 8080, debug: bool = False, max_attempts: int = 100, host: str = "127.0.0.1"):
    use_waitress = False
    try:
        from waitress import serve
        import logging as _logging
        _logging.getLogger("waitress").setLevel(_logging.WARNING)
        use_waitress = True
    except ImportError:
        logger.debug("waitress not installed, using Flask dev server")
        if not debug:
            os.environ.setdefault("FLASK_ENV", "production")
            warnings.filterwarnings("ignore", message=".*development server.*")

    port = start_port
    for _attempt in range(max_attempts):
        try:
            if use_waitress:
                logger.info("Starting waitress: %s:%d", host, port)
                serve(app, host=host, port=port, threads=4)
            else:
                logger.info("Starting Flask dev server: %s:%d", host, port)
                app.run(host=host, port=port, debug=debug, use_reloader=False)
            return
        except OSError as e:
            err_msg = str(e).lower()
            if "address already in use" in err_msg or "address in use" in err_msg:
                logger.info("Port %d in use, trying %d", port, port + 1)
                port += 1
                continue
            raise

    raise RuntimeError(
        f"No available port in range {start_port}-{start_port + max_attempts - 1}"
    )
