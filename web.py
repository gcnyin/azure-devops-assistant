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

from flask import Flask, jsonify, render_template_string

from config import Config
from renderer import state_color_hex, state_bg_hex, type_icon, STATE_COLORS_HEX, _TYPE_ICONS
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
    type_icons_json = _json.dumps(_TYPE_ICONS, ensure_ascii=False)
    return render_template_string(
        HTML_TEMPLATE,
        incomplete_states=incomplete_states_json,
        state_colors=state_colors_json,
        type_icons=type_icons_json,
    )


# ── HTML 模板 ──

HTML_TEMPLATE = r"""
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Azure DevOps Sprint 看板</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: #0f172a;
            color: #e2e8f0;
            min-height: 100vh;
        }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }

        /* Header */
        .header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 16px 24px; background: #1e293b;
            border-radius: 12px; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;
        }
        .header-left {
            display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
        }
        .header h1 { font-size: 1.5rem; font-weight: 700; color: #38bdf8; }
        .header .sprint-name { color: #f1f5f9; font-weight: 600; }
        .header .meta {
            font-size: 0.85rem; color: #94a3b8;
            display: flex; gap: 16px; flex-wrap: wrap;
        }
        .header .update-time { font-size: 0.8rem; color: #64748b; }
        .offline-badge {
            display: inline-block; background: #ef444420; color: #ef4444;
            padding: 3px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600;
        }
        .header-right { display: flex; gap: 8px; align-items: center; }
        .btn {
            padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer;
            font-size: 0.85rem; font-weight: 500; transition: all 0.2s;
        }
        .btn-refresh { background: #1d4ed8; color: #fff; }
        .btn-refresh:hover { background: #2563eb; }
        .btn-tab {
            background: #334155; color: #94a3b8;
        }
        .btn-tab.active { background: #1d4ed8; color: #fff; }
        .btn-tab:hover:not(.active) { background: #475569; }

        /* Stats */
        .stats {
            display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;
        }
        .stat {
            background: #1e293b; border-radius: 10px; padding: 14px 20px;
            min-width: 100px; flex: 1;
        }
        .stat-value { font-size: 1.6rem; font-weight: 700; }
        .stat-label { font-size: 0.8rem; color: #64748b; margin-top: 4px; }
        .stat.total .stat-value { color: #f1f5f9; }
        .stat.new .stat-value { color: #22c55e; }
        .stat.changed .stat-value { color: #eab308; }
        .stat.gone .stat-value { color: #ef4444; }
        .stat.incomplete .stat-value { color: #eab308; }
        .stat.done .stat-value { color: #22c55e; }

        /* Table */
        .table-wrap {
            background: #1e293b; border-radius: 12px; overflow: hidden;
        }
        .table-wrap.fixes { background: #1e293b; }
        table {
            width: 100%; border-collapse: collapse;
        }
        thead th {
            background: #0f2744; color: #93c5fd; font-weight: 600;
            padding: 12px 16px; text-align: left; font-size: 0.8rem;
            text-transform: uppercase; letter-spacing: 0.05em;
        }
        thead th:first-child { border-radius: 12px 0 0 0; }
        thead th:last-child { border-radius: 0 12px 0 0; }
        tbody td {
            padding: 10px 16px; border-bottom: 1px solid #1e293b;
            font-size: 0.9rem;
        }
        tbody tr { background: #1a2332; transition: background 0.15s; cursor: pointer; }
        tbody tr:hover { background: #243044; }
        tbody tr:last-child td:first-child { border-radius: 0 0 0 12px; }
        tbody tr:last-child td:last-child { border-radius: 0 0 12px 0; }

        .row-new { border-left: 3px solid #22c55e; }
        .row-changed { border-left: 3px solid #eab308; }
        .row-gone { border-left: 3px solid #ef4444; opacity: 0.7; }

        .state-badge {
            display: inline-block; padding: 3px 10px; border-radius: 20px;
            font-size: 0.8rem; font-weight: 600;
        }
        .type-icon { margin-right: 4px; }

        .id-link { color: #22d3ee; text-decoration: none; font-weight: 500; }
        .id-link:hover { text-decoration: underline; }

        .assigned { color: #c084fc; }
        .dim { color: #64748b; }
        .strike { text-decoration: line-through; }

        .empty {
            text-align: center; padding: 60px 20px; color: #64748b;
        }
        .empty .icon { font-size: 3rem; margin-bottom: 12px; }
        .empty .text { font-size: 1rem; }

        /* Fix card */
        .fix-card {
            background: #1a2332; border-radius: 10px; padding: 20px;
            margin-bottom: 16px; border-left: 3px solid #8b5cf6;
        }
        .fix-card .bug-id {
            color: #c084fc; font-weight: 700; font-size: 1.1rem;
        }
        .fix-card .bug-title {
            color: #e2e8f0; margin: 4px 0 12px;
        }
        .fix-card .fix-time { color: #64748b; font-size: 0.8rem; }
        .fix-card .fix-content {
            background: #0f172a; border-radius: 8px; padding: 16px;
            margin-top: 12px; white-space: pre-wrap; font-family: ui-monospace, monospace;
            font-size: 0.85rem; line-height: 1.6; color: #cbd5e1;
            max-height: 500px; overflow-y: auto;
        }

        /* History snapshot list */
        .snapshot-item {
            background: #1a2332; border-radius: 10px; padding: 14px 18px;
            margin-bottom: 10px; cursor: pointer; transition: background 0.15s;
            display: flex; justify-content: space-between; align-items: center;
            border-left: 3px solid #475569;
        }
        .snapshot-item:hover { background: #243044; }
        .snapshot-item .snap-id { color: #38bdf8; font-weight: 600; margin-right: 12px; }
        .snapshot-item .snap-time { color: #94a3b8; }
        .snapshot-item .snap-count { color: #64748b; font-size: 0.85rem; }
        .snapshot-item .snap-sprint { color: #c084fc; margin-right: 8px; }

        .loading { text-align: center; padding: 40px; color: #64748b; }
        .error { color: #ef4444; text-align: center; padding: 40px; }

        /* Modal */
        .modal-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.7);
            display: flex; align-items: center; justify-content: center;
            z-index: 1000; animation: fadeIn 0.15s;
        }
        @keyframes fadeIn { from { opacity: 0; } }
        .modal {
            background: #1e293b; border-radius: 14px; padding: 28px;
            max-width: 700px; width: 90%; max-height: 80vh; overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5); position: relative;
        }
        .modal-close {
            position: absolute; top: 12px; right: 16px;
            background: none; border: none; color: #64748b; font-size: 1.5rem;
            cursor: pointer; padding: 4px 8px; border-radius: 6px;
        }
        .modal-close:hover { background: #334155; color: #f1f5f9; }
        .modal h3 { font-size: 1.3rem; color: #f1f5f9; margin-bottom: 8px; }
        .modal .wi-meta {
            display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;
            font-size: 0.85rem; color: #94a3b8;
        }
        .modal .wi-description {
            background: #0f172a; border-radius: 8px; padding: 16px;
            white-space: pre-wrap; line-height: 1.6; color: #cbd5e1;
            font-size: 0.9rem; margin-bottom: 16px; max-height: 300px; overflow-y: auto;
        }
        .modal .wi-link {
            color: #38bdf8; text-decoration: none; font-size: 0.9rem;
        }
        .modal .wi-link:hover { text-decoration: underline; }
        .modal .no-desc { color: #64748b; font-style: italic; }

        /* Keyboard hint */
        .kbd-hint { font-size: 0.75rem; color: #475569; margin-left: 8px; }

        /* Responsive */
        @media (max-width: 768px) {
            .container { padding: 12px; }
            .header { padding: 12px 16px; }
            thead th, tbody td { padding: 8px 12px; font-size: 0.8rem; }
            .stat { min-width: 70px; padding: 10px 14px; }
            .stat-value { font-size: 1.3rem; }
            .modal { padding: 20px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="header-left">
                <h1>🔄 <span id="projectName">Azure DevOps</span></h1>
                <span class="sprint-name" id="sprintName">—</span>
                <span class="meta">
                    <span id="sprintDates"></span>
                    <span>👤 <span id="assignedTo">—</span></span>
                    <span>👥 <span id="teamName">—</span></span>
                </span>
                <span class="update-time">⏱ 更新: <span id="updateTime">—</span></span>
                <span class="offline-badge" id="offlineBadge" style="display:none;">⚠ 离线</span>
            </div>
            <div class="header-right">
                <button class="btn btn-tab active" id="tabBoard" onclick="switchTab('board')">📋 看板列表</button>
                <button class="btn btn-tab" id="tabFixes" onclick="switchTab('fixes')">🤖 AI 修复</button>
                <button class="btn btn-tab" id="tabHistory" onclick="switchTab('history')">📜 历史</button>
                <button class="btn btn-refresh" onclick="refresh()">🔄 刷新</button>
            </div>
        </div>

        <!-- Stats -->
        <div class="stats" id="statsRow">
            <div class="stat total"><div class="stat-value" id="statTotal">—</div><div class="stat-label">总计</div></div>
            <div class="stat new"><div class="stat-value" id="statNew">—</div><div class="stat-label">✨ 新增</div></div>
            <div class="stat changed"><div class="stat-value" id="statChanged">—</div><div class="stat-label">🔄 变化</div></div>
            <div class="stat gone"><div class="stat-value" id="statGone">—</div><div class="stat-label">👻 消失</div></div>
            <div class="stat incomplete"><div class="stat-value" id="statIncomplete">—</div><div class="stat-label">⏳ 未完成</div></div>
            <div class="stat done"><div class="stat-value" id="statDone">—</div><div class="stat-label">✅ 已完成</div></div>
        </div>

        <!-- Board Table -->
        <div class="table-wrap" id="boardPanel">
            <table>
                <thead>
                    <tr>
                        <th style="width:40px">#</th>
                        <th style="width:60px">ID</th>
                        <th>标题<span class="kbd-hint">点击查看详情</span></th>
                        <th style="width:80px">类型</th>
                        <th style="width:110px">状态</th>
                        <th style="width:100px">负责人</th>
                    </tr>
                </thead>
                <tbody id="itemsBody">
                    <tr><td colspan="6" class="loading">加载中...</td></tr>
                </tbody>
            </table>
        </div>

        <!-- Fixes Panel -->
        <div class="table-wrap fixes" id="fixesPanel" style="display:none;">
            <div id="fixesContent"><div class="loading">加载中...</div></div>
        </div>

        <!-- History Panel -->
        <div class="table-wrap fixes" id="historyPanel" style="display:none;">
            <div id="historyContent"><div class="loading">加载中...</div></div>
        </div>
    </div>

    <!-- Detail Modal -->
    <div class="modal-overlay" id="modalOverlay" style="display:none;" onclick="closeModal(event)">
        <div class="modal" id="modalBox" onclick="event.stopPropagation()">
            <button class="modal-close" onclick="closeModal()">&times;</button>
            <div id="modalContent"></div>
        </div>
    </div>

    <script>
        let currentTab = 'board';
        let allItems = [];  // Store loaded items for detail view
        const INCOMPLETE_STATES = {{ incomplete_states|safe }};

        function switchTab(tab) {
            currentTab = tab;
            ['board','fixes','history'].forEach(t => {
                document.getElementById('tab'+t.charAt(0).toUpperCase()+t.slice(1)).classList.toggle('active', tab === t);
            });
            document.getElementById('boardPanel').style.display = tab === 'board' ? '' : 'none';
            document.getElementById('statsRow').style.display = (tab === 'board' || tab === 'history') ? '' : 'none';
            document.getElementById('fixesPanel').style.display = tab === 'fixes' ? '' : 'none';
            document.getElementById('historyPanel').style.display = tab === 'history' ? '' : 'none';
            if (tab === 'board') loadBoard();
            else if (tab === 'fixes') loadFixes();
            else if (tab === 'history') loadHistory();
        }

        async function refresh() {
            if (currentTab === 'board') loadBoard();
            else if (currentTab === 'fixes') loadFixes();
            else if (currentTab === 'history') loadHistory();
        }

        function getStateColor(state) {
            const colors = {{ state_colors|safe }};
            return colors[state.toLowerCase()] || '#9ca3af';
        }

        function getTypeIcon(type) {
            const icons = {{ type_icons|safe }};
            return icons[type.toLowerCase()] || '📌';
        }

        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str || '';
            return div.innerHTML;
        }

        // ── Modal ──

        function openDetailModal(item) {
            const desc = item.description || '';
            const descHtml = desc ? '<div class="wi-description">' + escapeHtml(desc) + '</div>' :
                '<div class="no-desc">暂无详细描述</div>';
            const url = item.htmlUrl || ('https://dev.azure.com/_workitems/edit/' + item.id);
            const stateColor = getStateColor(item.state);

            document.getElementById('modalContent').innerHTML =
                '<h3><span class="type-icon">' + getTypeIcon(item.type) + '</span> ' + escapeHtml(item.title) + '</h3>' +
                '<div class="wi-meta">' +
                    '<span>🆔 <strong>' + item.id + '</strong></span>' +
                    '<span>📌 ' + escapeHtml(item.type) + '</span>' +
                    '<span class="state-badge" style="background:' + stateColor + '20;color:' + stateColor + '">' + escapeHtml(item.state) + '</span>' +
                    '<span>👤 ' + escapeHtml(item.assignedTo || 'Unassigned') + '</span>' +
                '</div>' +
                descHtml +
                '<a class="wi-link" href="' + url + '" target="_blank">🔗 在 Azure DevOps 中打开 →</a>';
            document.getElementById('modalOverlay').style.display = 'flex';
        }

        function closeModal(e) {
            if (e && e.target !== document.getElementById('modalOverlay')) return;
            document.getElementById('modalOverlay').style.display = 'none';
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                document.getElementById('modalOverlay').style.display = 'none';
            }
        });

        // ── Board ──

        async function loadBoard() {
            try {
                const resp = await fetch('/api/data');
                const data = await resp.json();
                allItems = data.items || [];
                if (!allItems.length) {
                    document.getElementById('itemsBody').innerHTML =
                        '<tr><td colspan="6" class="empty"><div class="icon">📭</div><div class="text">暂无数据</div></td></tr>';
                }
                renderBoard(data);
            } catch (e) {
                document.getElementById('itemsBody').innerHTML =
                    '<tr><td colspan="6" class="error">加载失败: ' + e.message + '</td></tr>';
            }
        }

        function renderBoard(data) {
            document.getElementById('projectName').textContent = data.project || 'Azure DevOps';
            document.getElementById('sprintName').textContent =
                (data.iteration && data.iteration.name) ? data.iteration.name : '—';
            const dates = data.iteration ?
                (data.iteration.startDate || '').slice(0,10) + ' → ' + (data.iteration.finishDate || '').slice(0,10) : '';
            document.getElementById('sprintDates').textContent = dates ? '(' + dates + ')' : '';
            document.getElementById('assignedTo').textContent = data.assigned_to || '全部';
            document.getElementById('teamName').textContent = data.team_name || '—';
            document.getElementById('updateTime').textContent = data.last_update || '—';
            document.getElementById('offlineBadge').style.display = data.offline ? '' : 'none';

            const items = data.items || [];
            const incompleteSet = new Set((INCOMPLETE_STATES || []).map(s => s.toLowerCase()));
            let incCount = 0, compCount = 0;
            items.forEach(it => {
                const s = it.state;
                if (incompleteSet.has(s.toLowerCase())) incCount++;
                else compCount++;
            });
            document.getElementById('statTotal').textContent = items.length;
            document.getElementById('statIncomplete').textContent = incCount;
            document.getElementById('statDone').textContent = compCount;

            const diff = data.diff_info || {};
            document.getElementById('statNew').textContent = diff.new_items ? diff.new_items.length : '—';
            const nc = diff.continuing_items ? diff.continuing_items.filter(i => i._state_changed).length : 0;
            document.getElementById('statChanged').textContent = nc || '—';
            document.getElementById('statGone').textContent = diff.gone_items ? diff.gone_items.length : '—';

            const newIds = new Set((diff.new_items || []).map(i => i.id));
            const changedIds = {};
            (diff.continuing_items || []).forEach(i => {
                if (i._state_changed) changedIds[i.id] = i._prev_state || '?';
            });

            let html = '';
            items.forEach((it, idx) => {
                let rowClass = '';
                let prefix = '';
                let titleStyle = '';
                let stateHtml = '';
                if (newIds.has(it.id)) {
                    rowClass = 'row-new';
                    prefix = '<span style="color:#22c55e">✨ </span>';
                    titleStyle = 'color:#86efac;';
                } else if (it.id in changedIds) {
                    rowClass = 'row-changed';
                    prefix = '<span style="color:#eab308">🔄 </span>';
                    titleStyle = 'color:#fde68a;';
                    const prev = changedIds[it.id];
                    const prevColor = getStateColor(prev);
                    const curColor = getStateColor(it.state);
                    stateHtml = '<span class="state-badge strike" style="background:' + prevColor + '20;color:' + prevColor + '">'
                        + prev + '</span> <span class="dim">→</span> '
                        + '<span class="state-badge" style="background:' + curColor + '20;color:' + curColor + ';font-weight:700">'
                        + it.state + '</span>';
                }
                const stateColor = getStateColor(it.state);
                if (!stateHtml) {
                    stateHtml = '<span class="state-badge" style="background:' + stateColor + '20;color:' + stateColor + '">'
                        + it.state + '</span>';
                }
                const icon = getTypeIcon(it.type);

                html += '<tr class="' + rowClass + '" onclick="openDetailModal(allItems[' + idx + '])">'
                    + '<td class="dim">' + (idx + 1) + '</td>'
                    + '<td><span class="id-link">' + it.id + '</span></td>'
                    + '<td style="' + titleStyle + '">' + prefix + escapeHtml(it.title) + '</td>'
                    + '<td><span class="type-icon">' + icon + '</span> ' + escapeHtml(it.type) + '</td>'
                    + '<td>' + stateHtml + '</td>'
                    + '<td class="assigned">' + escapeHtml(it.assignedTo || 'Unassigned') + '</td>'
                    + '</tr>';
            });
            document.getElementById('itemsBody').innerHTML = html;
        }

        // ── AI Fixes ──

        async function loadFixes() {
            try {
                const resp = await fetch('/api/fixes');
                const fixes = await resp.json();
                let html = '';
                if (!fixes || fixes.length === 0) {
                    html = '<div class="empty"><div class="icon">🤖</div><div class="text">暂无 AI 修复建议<br><span style="font-size:0.8rem">使用 --ai-fix 参数运行以生成修复建议</span></div></div>';
                } else {
                    fixes.forEach(f => {
                        html += '<div class="fix-card">'
                            + '<div><span class="bug-id">🐛 Bug #' + f.bug_id + '</span></div>'
                            + '<div class="bug-title">' + escapeHtml(f.bug_title || '') + '</div>'
                            + '<div class="fix-time">🕐 ' + (f.updated_at || '') + '</div>'
                            + '<div class="fix-content">' + escapeHtml(f.response || '') + '</div>'
                            + '</div>';
                    });
                }
                document.getElementById('fixesContent').innerHTML = html;
            } catch (e) {
                document.getElementById('fixesContent').innerHTML =
                    '<div class="error">加载失败: ' + e.message + '</div>';
            }
        }

        // ── History ──

        let historyItems = [];

        async function loadHistory() {
            try {
                const resp = await fetch('/api/history');
                const snaps = await resp.json();
                let html = '';
                if (!snaps || snaps.length === 0) {
                    html = '<div class="empty"><div class="icon">📜</div><div class="text">暂无历史快照<br><span style="font-size:0.8rem">定时拉取数据后会自动记录快照</span></div></div>';
                } else {
                    html += '<div style="padding:16px;color:#94a3b8;font-size:0.85rem">点击快照查看该时刻的卡片详情</div>';
                    snaps.forEach(s => {
                        html += '<div class="snapshot-item" onclick="loadSnapshotDetail(' + s.id + ', \'' + escapeHtml(s.sprint_name) + '\', \'' + (s.fetched_at || '') + '\')">'
                            + '<div><span class="snap-id">#' + s.id + '</span>'
                            + '<span class="snap-sprint">' + escapeHtml(s.sprint_name) + '</span>'
                            + '<span class="snap-time">' + (s.fetched_at || '') + '</span></div>'
                            + '<div class="snap-count">' + (s.item_count || 0) + ' 张卡片</div>'
                            + '</div>';
                    });
                }
                document.getElementById('historyContent').innerHTML = html;
                // Reset stats for history view
                document.getElementById('statTotal').textContent = '—';
                document.getElementById('statNew').textContent = '—';
                document.getElementById('statChanged').textContent = '—';
                document.getElementById('statGone').textContent = '—';
                document.getElementById('statIncomplete').textContent = '—';
                document.getElementById('statDone').textContent = '—';
            } catch (e) {
                document.getElementById('historyContent').innerHTML =
                    '<div class="error">加载失败: ' + e.message + '</div>';
            }
        }

        async function loadSnapshotDetail(snapshotId, sprintName, fetchedAt) {
            try {
                const resp = await fetch('/api/history/' + snapshotId);
                const data = await resp.json();
                if (data.error) {
                    alert(data.error);
                    return;
                }
                historyItems = data.items || [];
                const items = historyItems;
                // Update header
                document.getElementById('sprintName').textContent = sprintName || '—';
                document.getElementById('updateTime').textContent = fetchedAt || '—';
                document.getElementById('sprintDates').textContent = '';
                document.getElementById('offlineBadge').style.display = '';

                // Count states
                const stateCounts = {};
                const incompleteSet = new Set((INCOMPLETE_STATES || []).map(s => s.toLowerCase()));
                let incCount = 0, compCount = 0;
                items.forEach(it => {
                    const s = it.state;
                    stateCounts[s] = (stateCounts[s] || 0) + 1;
                    if (incompleteSet.has(s.toLowerCase())) incCount++;
                    else compCount++;
                });
                document.getElementById('statTotal').textContent = items.length;
                document.getElementById('statIncomplete').textContent = incCount;
                document.getElementById('statDone').textContent = compCount;
                document.getElementById('statNew').textContent = '—';
                document.getElementById('statChanged').textContent = '—';
                document.getElementById('statGone').textContent = '—';

                // Render items table without diff markers
                let html = '';
                items.forEach((it, idx) => {
                    const stateColor = getStateColor(it.state);
                    const icon = getTypeIcon(it.type);
                    html += '<tr onclick="openDetailModal(historyItems[' + idx + '])">'
                        + '<td class="dim">' + (idx + 1) + '</td>'
                        + '<td><span class="id-link">' + it.id + '</span></td>'
                        + '<td>' + escapeHtml(it.title) + '</td>'
                        + '<td><span class="type-icon">' + icon + '</span> ' + escapeHtml(it.type) + '</td>'
                        + '<td><span class="state-badge" style="background:' + stateColor + '20;color:' + stateColor + '">' + escapeHtml(it.state) + '</span></td>'
                        + '<td class="assigned">' + escapeHtml(it.assignedTo || 'Unassigned') + '</td>'
                        + '</tr>';
                });
                document.getElementById('itemsBody').innerHTML = html;
                // Show board panel
                document.getElementById('historyPanel').style.display = 'none';
                document.getElementById('boardPanel').style.display = '';
                document.getElementById('statsRow').style.display = '';
            } catch (e) {
                alert('加载快照详情失败: ' + e.message);
            }
        }

        // Initial load
        loadBoard();

        // Auto refresh every 60s (only when on board tab)
        setInterval(function() {
            if (currentTab === 'board') loadBoard();
        }, 60000);
    </script>
</body>
</html>
"""


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
