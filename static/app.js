let currentTab = 'board';
let allItems = [];
let historyItems = [];

// ── 搜索与过滤状态 ──
let searchQuery = '';
let stateFilter = 'all';

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
}


/* ══════════════════════════════════════════════════════════
   Tab switching
   ══════════════════════════════════════════════════════════ */
function switchTab(tab) {
    currentTab = tab;
    ['board', 'fixes', 'history'].forEach(function (t) {
        document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1))
            .classList.toggle('active', tab === t);
    });
    document.getElementById('boardPanel').style.display   = tab === 'board'   ? '' : 'none';
    document.getElementById('statsRow').style.display     = (tab === 'board' || tab === 'history') ? '' : 'none';
    document.getElementById('fixesPanel').style.display   = tab === 'fixes'   ? '' : 'none';
    document.getElementById('historyPanel').style.display = tab === 'history' ? '' : 'none';
    document.getElementById('diffSummary').style.display  = tab === 'board'   ? '' : 'none';
    document.getElementById('toolbar').style.display      = tab === 'board'   ? '' : 'none';

    if (tab === 'board') loadBoard();
    else if (tab === 'fixes') loadFixes();
    else if (tab === 'history') loadHistory();
}

function refresh() {
    if (currentTab === 'board') loadBoard();
    else if (currentTab === 'fixes') loadFixes();
    else if (currentTab === 'history') loadHistory();
}

/* ══════════════════════════════════════════════════════════
   搜索与过滤
   ══════════════════════════════════════════════════════════ */
function applyFilters() {
    searchQuery = document.getElementById('searchInput').value.trim().toLowerCase();
    var clearBtn = document.getElementById('searchClear');
    clearBtn.style.display = searchQuery ? '' : 'none';
    renderBoardTable();
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    searchQuery = '';
    document.getElementById('searchClear').style.display = 'none';
    renderBoardTable();
}

function setStateFilter(filter, el) {
    stateFilter = filter;
    document.querySelectorAll('.filter-chips .chip').forEach(function (c) {
        c.classList.remove('active');
    });
    el.classList.add('active');
    renderBoardTable();
}

function getFilteredItems() {
    var items = allItems;
    var incompleteSet = new Set((window.INCOMPLETE_STATES_RAW || []).map(function (s) { return s.toLowerCase(); }));

    // 状态过滤
    if (stateFilter === 'open') {
        items = items.filter(function (it) { return incompleteSet.has(it.state.toLowerCase()); });
    } else if (stateFilter === 'done') {
        items = items.filter(function (it) { return !incompleteSet.has(it.state.toLowerCase()); });
    } else if (stateFilter === 'bug') {
        items = items.filter(function (it) { return (it.type || '').toLowerCase() === 'bug'; });
    } else if (stateFilter !== 'all') {
        // 具体状态名
        items = items.filter(function (it) { return it.state.toLowerCase() === stateFilter; });
    }

    // 文本搜索
    if (searchQuery) {
        items = items.filter(function (it) {
            return (it.title || '').toLowerCase().indexOf(searchQuery) !== -1
                || String(it.id).indexOf(searchQuery) !== -1
                || (it.assignedTo || '').toLowerCase().indexOf(searchQuery) !== -1;
        });
    }

    return items;
}

/* ══════════════════════════════════════════════════════════
   Modal
   ══════════════════════════════════════════════════════════ */
function openDetailModal(item) {
    var desc = item.description || '';
    var descHtml = desc
        ? '<div class="wi-description">' + escapeHtml(desc) + '</div>'
        : '<div class="no-desc">No description available</div>';
    var url = item.htmlUrl || ('https://dev.azure.com/_workitems/edit/' + item.id);
    var stateColor = getStateColor(item.state);

    document.getElementById('modalContent').innerHTML =
        '<h3>' + escapeHtml(item.title) + '</h3>' +
        '<div class="wi-meta">' +
            '<span>#' + item.id + '</span>' +
            '<span>' + escapeHtml(item.type) + '</span>' +
            '<span class="state-badge" style="background:' + stateColor + '24;color:' + stateColor + '">' + escapeHtml(item.state) + '</span>' +
            '<span>' + escapeHtml(item.assignedTo || 'Unassigned') + '</span>' +
        '</div>' +
        descHtml +
        '<a class="wi-link" href="' + url + '" target="_blank" rel="noopener">Open in Azure DevOps</a>';
    document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal(e) {
    if (e && e.target !== document.getElementById('modalOverlay')) return;
    document.getElementById('modalOverlay').style.display = 'none';
}

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        document.getElementById('modalOverlay').style.display = 'none';
    }
    // ⌘K / Ctrl+K 聚焦搜索框
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('searchInput').focus();
    }
    // R 刷新（不在输入框内时）
    if (e.key === 'r' && !e.metaKey && !e.ctrlKey && document.activeElement !== document.getElementById('searchInput')) {
        refresh();
    }
});


/* ══════════════════════════════════════════════════════════
   Board
   ══════════════════════════════════════════════════════════ */
async function loadBoard() {
    try {
        var resp = await fetch('/api/data');
        var data = await resp.json();
        allItems = data.items || [];
        renderBoard(data);
    } catch (e) {
        document.getElementById('itemsBody').innerHTML =
            '<tr><td colspan="6"><div class="error-state">Failed to load: ' + escapeHtml(e.message) + '</div></td></tr>';
    }
}

function renderBoard(data) {
    // ── 保存 diff 数据供过滤后渲染 ──
    _lastDiff = data.diff_info || {};

    // ── Header ──
    document.getElementById('projectName').textContent = data.project || 'Azure DevOps';
    document.getElementById('sprintName').textContent =
        (data.iteration && data.iteration.name) ? data.iteration.name : '-';
    var dates = data.iteration
        ? (data.iteration.startDate || '').slice(0, 10) + ' - ' + (data.iteration.finishDate || '').slice(0, 10)
        : '';
    document.getElementById('sprintDates').textContent = dates || '';
    document.getElementById('assignedTo').textContent = data.assigned_to || 'All';
    document.getElementById('teamName').textContent = data.team_name || '-';
    document.getElementById('updateTime').textContent = data.last_update || '-';
    document.getElementById('offlineBadge').style.display = data.offline ? 'inline-flex' : 'none';

    // ── Stats (基于全部数据) ──
    var all = allItems;
    var incompleteSet = new Set((window.INCOMPLETE_STATES_RAW || []).map(function (s) { return s.toLowerCase(); }));
    var incCount = 0, compCount = 0;
    all.forEach(function (it) {
        if (incompleteSet.has(it.state.toLowerCase())) incCount++;
        else compCount++;
    });
    document.getElementById('statTotal').textContent = all.length;
    document.getElementById('statOpen').textContent = incCount;
    document.getElementById('statDone').textContent = compCount;

    // ── Diff Summary ──
    var diff = data.diff_info || {};
    var diffHtml = '';
    var nn = (diff.new_items || []).length;
    var nc = 0;
    (diff.continuing_items || []).forEach(function (it) { if (it._state_changed) nc++; });
    var ng = (diff.gone_items || []).length;
    if (nn > 0 || nc > 0 || ng > 0) {
        if (nn > 0) diffHtml += '<span class="diff-tag new">+' + nn + ' New</span>';
        if (nc > 0) diffHtml += '<span class="diff-tag changed">~' + nc + ' Changed</span>';
        if (ng > 0) diffHtml += '<span class="diff-tag gone">-' + ng + ' Gone</span>';
    }
    document.getElementById('diffSummary').innerHTML = diffHtml;
    document.getElementById('diffSummary').style.display = diffHtml ? '' : 'none';

    // ── 动态生成状态过滤胶囊 ──
    buildFilterChips(data);

    // ── 渲染表格 ──
    renderBoardTable();
}

function buildFilterChips(data) {
    var states = {};
    allItems.forEach(function (it) {
        var s = it.state;
        if (!states[s]) states[s] = 0;
        states[s]++;
    });
    var stateKeys = Object.keys(states).sort();
    var html = '';
    stateKeys.forEach(function (s) {
        html += '<button class="chip" data-filter="' + s.toLowerCase() + '" onclick="setStateFilter(\'' + s.toLowerCase() + '\', this)">'
            + s + ' <span style="color:var(--ash)">' + states[s] + '</span></button>';
    });
    document.getElementById('dynamicChips').innerHTML = html;
}

function renderBoardTable() {
    var items = getFilteredItems();
    var incompleteSet = new Set((window.INCOMPLETE_STATES_RAW || []).map(function (s) { return s.toLowerCase(); }));

    // 更新结果计数
    var countEl = document.getElementById('resultCount');
    if (searchQuery || stateFilter !== 'all') {
        var label = items.length === allItems.length ? 'all' : items.length;
        countEl.textContent = label + ' / ' + allItems.length + ' items';
    } else {
        countEl.textContent = '';
    }

    // 差异数据
    var diff = window._lastDiff || {};
    var newIds = new Set((diff.new_items || []).map(function (i) { return i.id; }));
    var changedIds = {};
    (diff.continuing_items || []).forEach(function (i) {
        if (i._state_changed) changedIds[i.id] = i._prev_state || '?';
    });

    var html = '';
    if (items.length === 0) {
        var msg = searchQuery ? 'No items match "' + escapeHtml(searchQuery) + '"' : 'No work items in this sprint.';
        html = '<tr><td colspan="6"><div class="empty-state">'
            + '<div class="empty-icon">-</div>'
            + '<div class="empty-title">No results</div>'
            + '<div class="empty-desc">' + msg + '</div>'
            + '</div></td></tr>';
    }

    items.forEach(function (it) {
        // 在 allItems 中查找原始索引
        var origIdx = allItems.indexOf(it);

        var rowClass = '';
        var prefix = '';
        var titleStyle = '';
        var stateHtml = '';

        if (newIds.has(it.id)) {
            rowClass = 'row-new';
            prefix = '<span class="diff-dot new-dot">+</span>';
            titleStyle = 'color:var(--accent-green);';
        } else if (it.id in changedIds) {
            rowClass = 'row-changed';
            prefix = '<span class="diff-dot changed-dot">~</span>';
            titleStyle = 'color:var(--accent-yellow);';
            var prev = changedIds[it.id];
            var prevColor = getStateColor(prev);
            var curColor = getStateColor(it.state);
            stateHtml = '<span class="state-badge text-strike" style="background:' + prevColor + '24;color:' + prevColor + '">'
                + prev + '</span> <span class="text-dim">-</span> '
                + '<span class="state-badge" style="background:' + curColor + '24;color:' + curColor + ';font-weight:700">'
                + it.state + '</span>';
        }

        var stateColor = getStateColor(it.state);
        if (!stateHtml) {
            stateHtml = '<span class="state-badge" style="background:' + stateColor + '24;color:' + stateColor + '">'
                + it.state + '</span>';
        }

        var rowNum = items.indexOf(it) + 1;

        html += '<tr class="' + rowClass + '" onclick="openDetailModal(allItems[' + origIdx + '])">'
            + '<td class="text-dim">' + rowNum + '</td>'
            + '<td><span class="wi-id">' + it.id + '</span></td>'
            + '<td style="' + titleStyle + '">' + prefix + escapeHtml(it.title) + '</td>'
            + '<td>' + escapeHtml(it.type) + '</td>'
            + '<td>' + stateHtml + '</td>'
            + '<td class="assigned-cell">' + escapeHtml(it.assignedTo || 'Unassigned') + '</td>'
            + '</tr>';
    });

    document.getElementById('itemsBody').innerHTML = html;
}

// 存储最后一次的 diff 数据供过滤后使用
var _lastDiff = {};


/* ══════════════════════════════════════════════════════════
   AI Fixes
   ══════════════════════════════════════════════════════════ */
async function loadFixes() {
    try {
        var resp = await fetch('/api/fixes');
        var fixes = await resp.json();
        var html = '';
        if (!fixes || fixes.length === 0) {
            html = '<div class="empty-state">'
                + '<div class="empty-icon">*</div>'
                + '<div class="empty-title">No AI fix suggestions yet</div>'
                + '<div class="empty-desc">Run with --ai-fix to generate fix suggestions when new bugs are found.</div>'
                + '</div>';
        } else {
            fixes.forEach(function (f) {
                html += '<div class="fix-card">'
                    + '<div><span class="bug-id">Bug #' + f.bug_id + '</span></div>'
                    + '<div class="bug-title">' + escapeHtml(f.bug_title || '(untitled)') + '</div>'
                    + '<div class="fix-time">' + (f.updated_at || '') + '</div>'
                    + '<div class="fix-content">' + escapeHtml(f.response || '') + '</div>'
                    + '</div>';
            });
        }
        document.getElementById('fixesContent').innerHTML = html;
    } catch (e) {
        document.getElementById('fixesContent').innerHTML =
            '<div class="error-state">Failed to load: ' + escapeHtml(e.message) + '</div>';
    }
}


/* ══════════════════════════════════════════════════════════
   History
   ══════════════════════════════════════════════════════════ */
async function loadHistory() {
    try {
        var resp = await fetch('/api/history');
        var snaps = await resp.json();
        var html = '';
        if (!snaps || snaps.length === 0) {
            html = '<div class="empty-state">'
                + '<div class="empty-icon">*</div>'
                + '<div class="empty-title">No snapshots yet</div>'
                + '<div class="empty-desc">Snapshots are recorded automatically when the monitor fetches data.</div>'
                + '</div>';
        } else {
            html += '<div style="padding:12px 20px 8px;color:var(--ash);font-size:0.8rem">Click a snapshot to view its items</div>';
            snaps.forEach(function (s) {
                html += '<div class="snapshot-item" onclick="loadSnapshotDetail(' + s.id + ', \'' + escapeHtml(s.sprint_name) + '\', \'' + (s.fetched_at || '') + '\')">'
                    + '<div><span class="snap-id">#' + s.id + '</span>'
                    + '<span class="snap-sprint">' + escapeHtml(s.sprint_name) + '</span>'
                    + '<span class="snap-time">' + (s.fetched_at || '') + '</span></div>'
                    + '<div class="snap-count">' + (s.item_count || 0) + ' items</div>'
                    + '</div>';
            });
        }
        document.getElementById('historyContent').innerHTML = html;
        document.getElementById('statTotal').textContent = '-';
        document.getElementById('statOpen').textContent = '-';
        document.getElementById('statDone').textContent = '-';
    } catch (e) {
        document.getElementById('historyContent').innerHTML =
            '<div class="error-state">Failed to load: ' + escapeHtml(e.message) + '</div>';
    }
}

async function loadSnapshotDetail(snapshotId, sprintName, fetchedAt) {
    try {
        var resp = await fetch('/api/history/' + snapshotId);
        var data = await resp.json();
        if (data.error) {
            alert(data.error);
            return;
        }
        historyItems = data.items || [];
        var items = historyItems;
        document.getElementById('sprintName').textContent = sprintName || '-';
        document.getElementById('updateTime').textContent = fetchedAt || '-';
        document.getElementById('sprintDates').textContent = '';
        document.getElementById('offlineBadge').style.display = 'none';
        document.getElementById('diffSummary').style.display = 'none';
        document.getElementById('toolbar').style.display = 'none';

        var incompleteSet = new Set((window.INCOMPLETE_STATES_RAW || []).map(function (s) { return s.toLowerCase(); }));
        var incCount = 0, compCount = 0;
        items.forEach(function (it) {
            if (incompleteSet.has(it.state.toLowerCase())) incCount++;
            else compCount++;
        });
        document.getElementById('statTotal').textContent = items.length;
        document.getElementById('statOpen').textContent = incCount;
        document.getElementById('statDone').textContent = compCount;

        var html = '';
        if (items.length === 0) {
            html = '<tr><td colspan="6"><div class="empty-state">'
                + '<div class="empty-icon">-</div>'
                + '<div class="empty-title">No items</div>'
                + '<div class="empty-desc">This snapshot contains no work items.</div>'
                + '</div></td></tr>';
        }
        items.forEach(function (it, idx) {
            var stateColor = getStateColor(it.state);
            html += '<tr onclick="openDetailModal(historyItems[' + idx + '])">'
                + '<td class="text-dim">' + (idx + 1) + '</td>'
                + '<td><span class="wi-id">' + it.id + '</span></td>'
                + '<td>' + escapeHtml(it.title) + '</td>'
                + '<td>' + escapeHtml(it.type) + '</td>'
                + '<td><span class="state-badge" style="background:' + stateColor + '24;color:' + stateColor + '">' + escapeHtml(it.state) + '</span></td>'
                + '<td class="assigned-cell">' + escapeHtml(it.assignedTo || 'Unassigned') + '</td>'
                + '</tr>';
        });
        document.getElementById('itemsBody').innerHTML = html;
        document.getElementById('historyPanel').style.display = 'none';
        document.getElementById('boardPanel').style.display = '';
        document.getElementById('statsRow').style.display = '';
    } catch (e) {
        alert('Snapshot load failed: ' + e.message);
    }
}


/* ══════════════════════════════════════════════════════════
   Initial load & auto-refresh
   ══════════════════════════════════════════════════════════ */
loadBoard();

setInterval(function () {
    if (currentTab === 'board') loadBoard();
}, 60000);
