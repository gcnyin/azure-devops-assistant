let currentTab = 'board';
let allItems = [];
let historyItems = [];

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };


function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
}


/* Tab switching */
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
    if (tab === 'board') loadBoard();
    else if (tab === 'fixes') loadFixes();
    else if (tab === 'history') loadHistory();
}

function refresh() {
    if (currentTab === 'board') loadBoard();
    else if (currentTab === 'fixes') loadFixes();
    else if (currentTab === 'history') loadHistory();
}


/* Modal */
function openDetailModal(item) {
    var desc = item.description || '';
    var descHtml = desc
        ? '<div class="wi-description">' + escapeHtml(desc) + '</div>'
        : '<div class="no-desc">No description available</div>';
    var url = item.htmlUrl || ('https://dev.azure.com/_workitems/edit/' + item.id);
    var stateColor = getStateColor(item.state);
    var icon = getTypeIcon(item.type);

    document.getElementById('modalContent').innerHTML =
        '<h3>' + icon + ' ' + escapeHtml(item.title) + '</h3>' +
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
});


/* Board */
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

    var items = data.items || [];
    var incompleteSet = new Set((window.INCOMPLETE_STATES_RAW || []).map(function (s) { return s.toLowerCase(); }));
    var incCount = 0, compCount = 0;
    items.forEach(function (it) {
        if (incompleteSet.has(it.state.toLowerCase())) incCount++;
        else compCount++;
    });
    document.getElementById('statTotal').textContent = items.length;
    document.getElementById('statOpen').textContent = incCount;
    document.getElementById('statDone').textContent = compCount;

    var diff = data.diff_info || {};
    var newIds = new Set((diff.new_items || []).map(function (i) { return i.id; }));
    var changedIds = {};
    (diff.continuing_items || []).forEach(function (i) {
        if (i._state_changed) changedIds[i.id] = i._prev_state || '?';
    });

    var html = '';
    if (items.length === 0) {
        html = '<tr><td colspan="6"><div class="empty-state">'
            + '<div class="empty-icon">-</div>'
            + '<div class="empty-title">No items found</div>'
            + '<div class="empty-desc">No work items match the current filters in this sprint.</div>'
            + '</div></td></tr>';
    }
    items.forEach(function (it, idx) {
        var rowClass = '';
        var prefix = '';
        var titleStyle = '';
        var stateHtml = '';
        if (newIds.has(it.id)) {
            rowClass = 'row-new';
            prefix = '<span style="color:var(--green)">+ </span>';
            titleStyle = 'color:var(--green);';
        } else if (it.id in changedIds) {
            rowClass = 'row-changed';
            prefix = '<span style="color:var(--yellow)">~ </span>';
            titleStyle = 'color:var(--yellow);';
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
        var icon = getTypeIcon(it.type);

        html += '<tr class="' + rowClass + '" onclick="openDetailModal(allItems[' + idx + '])">'
            + '<td class="text-dim">' + (idx + 1) + '</td>'
            + '<td><span class="wi-id">' + it.id + '</span></td>'
            + '<td style="' + titleStyle + '">' + prefix + escapeHtml(it.title) + '</td>'
            + '<td><span class="type-icon">' + icon + '</span> ' + escapeHtml(it.type) + '</td>'
            + '<td>' + stateHtml + '</td>'
            + '<td class="assigned-cell">' + escapeHtml(it.assignedTo || 'Unassigned') + '</td>'
            + '</tr>';
    });
    document.getElementById('itemsBody').innerHTML = html;
}


/* AI Fixes */
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


/* History */
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
            html += '<div style="padding:12px 20px 8px;color:var(--text-tertiary);font-size:0.8rem">Click a snapshot to view its items</div>';
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
            var icon = getTypeIcon(it.type);
            html += '<tr onclick="openDetailModal(historyItems[' + idx + '])">'
                + '<td class="text-dim">' + (idx + 1) + '</td>'
                + '<td><span class="wi-id">' + it.id + '</span></td>'
                + '<td>' + escapeHtml(it.title) + '</td>'
                + '<td><span class="type-icon">' + icon + '</span> ' + escapeHtml(it.type) + '</td>'
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


/* Initial load & auto-refresh */
loadBoard();

setInterval(function () {
    if (currentTab === 'board') loadBoard();
}, 60000);
