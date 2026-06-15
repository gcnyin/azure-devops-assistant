let currentTab = 'board';
let currentView = 'all';
let allItems = [];
let historyItems = [];
let _snapshotList = [];
let _loadingBoard = false;  // 防止 loadBoard 并发调用导致竞态

// ── 认证 fetch 封装 ──
// 如果配置了 WEB_ACCESS_TOKEN，自动在所有 API 请求中携带 Authorization 头
function authFetch(url, options) {
    options = options || {};
    var headers = options.headers || {};
    if (window.WEB_ACCESS_TOKEN) {
        headers['Authorization'] = 'Bearer ' + window.WEB_ACCESS_TOKEN;
    }
    options.headers = headers;
    return fetch(url, options);
}

// ── 搜索与过滤状态 ──
let searchQuery = '';
let stateFilter = 'all';
let diffFilter = null;  // null | 'new' | 'changed' | 'gone'
let allFixes = [];
let fixesSearchQuery = '';

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
}


/* ══════════════════════════════════════════════════════════
   Tab switching
   ══════════════════════════════════════════════════════════ */
function switchTab(tab) {
    _viewingSnapshot = null;
    _viewingDiffSnaps = null;
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
    document.getElementById('snapshotBackBar').style.display = 'none';
    document.getElementById('viewToggleBar').style.display  = tab === 'board' ? '' : 'none';

    if (tab === 'board') loadBoard();
    else if (tab === 'fixes') loadFixes();
    else if (tab === 'history') loadHistory();
}

var _viewingSnapshot = null;
var _viewingDiffSnaps = null;

function refresh() {
    if (_viewingDiffSnaps) {
        compareSnapshotsByIds(_viewingDiffSnaps[0], _viewingDiffSnaps[1]);
        return;
    }
    if (_viewingSnapshot) {
        loadSnapshotDetail(
            _viewingSnapshot.id,
            _viewingSnapshot.sprintName,
            _viewingSnapshot.fetchedAt
        );
        return;
    }
    if (currentTab === 'board') loadBoard();
    else if (currentTab === 'fixes') loadFixes();
    else if (currentTab === 'history') loadHistory();
}

/* ══════════════════════════════════════════════════════════
   View Mode Toggle — 全量/个人视图切换
   ══════════════════════════════════════════════════════════ */
function switchView(mode) {
    if (currentView === mode) return;
    currentView = mode;
    document.querySelectorAll('.view-btn').forEach(function (b) {
        b.classList.remove('active');
    });
    if (mode === 'all') {
        document.getElementById('btnViewAll').classList.add('active');
    } else {
        document.getElementById('btnViewMe').classList.add('active');
    }
    loadBoard();
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
    diffFilter = null;  // 切换状态过滤时清除差异过滤
    document.querySelectorAll('.filter-chips .chip').forEach(function (c) {
        c.classList.remove('active');
    });
    el.classList.add('active');
    // 清除差异标签的高亮
    document.querySelectorAll('.diff-tag.active').forEach(function (t) {
        t.classList.remove('active');
    });
    renderBoardTable();
}

function setDiffFilter(filter, el) {
    // 如果已经选中同一个过滤器，则取消（切换回全部）
    if (diffFilter === filter) {
        diffFilter = null;
        el.classList.remove('active');
        renderBoardTable();
        return;
    }
    diffFilter = filter;
    // 清除状态过滤胶囊的选中
    document.querySelectorAll('.filter-chips .chip').forEach(function (c) {
        c.classList.remove('active');
    });
    document.querySelector('.chip[data-filter="all"]').classList.add('active');
    stateFilter = 'all';
    // 高亮当前差异标签
    document.querySelectorAll('.diff-tag').forEach(function (t) {
        t.classList.toggle('active', t === el);
    });
    renderBoardTable();
}

function getFilteredItems() {
    var items = allItems;
    var incompleteSet = new Set((window.INCOMPLETE_STATES_RAW || []).map(function (s) { return s.toLowerCase(); }));

    // 差异过滤 -- 先于状态/搜索执行，保证三种差异模式（new/changed/gone）均能后续被搜索和状态过滤
    if (diffFilter) {
        var diff = window._lastDiff || {};
        if (diffFilter === 'new') {
            var newIds = new Set((diff.new_items || []).map(function (i) { return i.id; }));
            items = items.filter(function (it) { return newIds.has(it.id); });
        } else if (diffFilter === 'changed') {
            var changedIds = new Set();
            (diff.continuing_items || []).forEach(function (i) {
                if (i._state_changed) changedIds.add(i.id);
            });
            items = items.filter(function (it) { return changedIds.has(it.id); });
        } else if (diffFilter === 'gone') {
            // 消失的条目不在当前 allItems 中，直接从 diff 数据获取完整条目
            items = (diff.gone_items || []).slice();
        }
    }

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

    // 文本搜索 -- 覆盖标题、ID、负责人、类型、描述（常用搜索维度）
    if (searchQuery) {
        items = items.filter(function (it) {
            return (it.title || '').toLowerCase().indexOf(searchQuery) !== -1
                || String(it.id).indexOf(searchQuery) !== -1
                || (it.assignedTo || '').toLowerCase().indexOf(searchQuery) !== -1
                || (it.type || '').toLowerCase().indexOf(searchQuery) !== -1
                || (it.description || '').toLowerCase().indexOf(searchQuery) !== -1;
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
        ? '<div class="wi-description">' + escapeHtml(desc).replace(/\n/g, '<br>') + '</div>'
        : '<div class="no-desc">No description available</div>';
    var url = item.htmlUrl || ('https://dev.azure.com/_workitems/edit/' + item.id);
    var stateColor = getStateColor(item.state);

    // 查找状态变化信息：优先从 item 自身取值，其次从 _lastDiff 查找
    var prevState = item._prev_state || '';
    if (!prevState && window._lastDiff) {
        var contItems = window._lastDiff.continuing_items || [];
        for (var ci = 0; ci < contItems.length; ci++) {
            if (contItems[ci].id === item.id && contItems[ci]._state_changed) {
                prevState = contItems[ci]._prev_state || '';
                break;
            }
        }
    }

    // 构建状态历史行（如果存在上次状态）
    var stateTransitionHtml = '';
    if (prevState) {
        var prevColor = getStateColor(prevState);
        stateTransitionHtml = '<div class="wi-state-transition">' +
            '<span class="state-badge" style="background:' + prevColor + '24;color:' + prevColor + ';text-decoration:line-through">' + escapeHtml(prevState) + '</span>' +
            '<span class="text-dim" style="margin:0 6px">-></span>' +
            '<span class="state-badge" style="background:' + stateColor + '24;color:' + stateColor + ';font-weight:700">' + escapeHtml(item.state) + '</span>' +
            '</div>';
    }

    document.getElementById('modalContent').innerHTML =
        '<h3>' + escapeHtml(item.title) + '</h3>' +
        '<div class="wi-meta">' +
            '<span>#' + item.id + '</span>' +
            '<span>' + escapeHtml(item.type) + '</span>' +
            '<span class="state-badge" style="background:' + stateColor + '24;color:' + stateColor + '">' + escapeHtml(item.state) + '</span>' +
            '<span>' + escapeHtml(item.assignedTo || 'Unassigned') + '</span>' +
        '</div>' +
        stateTransitionHtml +
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
    // Cmd+K / Ctrl+K 聚焦搜索框
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
   CSV Export
   ══════════════════════════════════════════════════════════ */
function exportCsv() {
    var url = '/api/export?format=csv&view=' + currentView;
    // 在 URL 中携带 token（authFetch 在触发下载时不适用）
    if (window.WEB_ACCESS_TOKEN) {
        url += (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(window.WEB_ACCESS_TOKEN);
    }
    var link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


/* ══════════════════════════════════════════════════════════
   Board
   ══════════════════════════════════════════════════════════ */
async function loadBoard() {
    // 防止并发调用导致竞态：新数据覆盖旧数据，或 renderBoardTable 迭代过程中 allItems 被替换
    if (_loadingBoard) return;
    _loadingBoard = true;
    try {
        var url = '/api/data?view=' + currentView;
        var resp = await authFetch(url);
        if (resp.status === 401) {
            document.getElementById('itemsBody').innerHTML =
                '<tr><td colspan="6"><div class="error-state">Authentication required. Set WEB_ACCESS_TOKEN in .env and restart.</div></td></tr>';
            return;
        }
        var data = await resp.json();
        if (data.error) {
            document.getElementById('itemsBody').innerHTML =
                '<tr><td colspan="6"><div class="error-state">Failed to load: ' + escapeHtml(data.error) + '</div></td></tr>';
            return;
        }
        allItems = data.items || [];
        renderBoard(data);
    } catch (e) {
        document.getElementById('itemsBody').innerHTML =
            '<tr><td colspan="6"><div class="error-state">Failed to load: ' + escapeHtml(e.message) + '</div></td></tr>';
    } finally {
        _loadingBoard = false;
    }
}

function renderBoard(data) {
    // ── 保存 diff 数据供过滤后渲染 ──
    _lastDiff = data.diff_info || {};

    // ── 错误横幅 ──
    var errorBanner = document.getElementById('errorBanner');
    if (data.error) {
        document.getElementById('errorBannerText').textContent = data.error;
        errorBanner.style.display = 'flex';
    } else {
        errorBanner.style.display = 'none';
    }

    // ── Header ──
    document.getElementById('projectName').textContent = data.project || 'Azure DevOps';
    document.getElementById('sprintName').textContent =
        (data.iteration && data.iteration.name) ? data.iteration.name : '-';
    var dates = data.iteration
        ? (data.iteration.startDate || '').slice(0, 10) + ' - ' + (data.iteration.finishDate || '').slice(0, 10)
        : '';
    document.getElementById('sprintDates').textContent = dates || '';
    document.getElementById('assignedTo').textContent = (data.view_mode === 'all') ? 'All team' : (data.assigned_to || 'Me');
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
    diffFilter = null;  // 新数据到达时清除差异过滤
    var diffHtml = '';
    var nn = (diff.new_items || []).length;
    var nc = 0;
    (diff.continuing_items || []).forEach(function (it) { if (it._state_changed) nc++; });
    var ng = (diff.gone_items || []).length;
    if (nn > 0 || nc > 0 || ng > 0) {
        if (nn > 0) diffHtml += '<span class="diff-tag new clickable" onclick="setDiffFilter(\'new\', this)" title="Click to show only new items">+' + nn + ' New</span>';
        if (nc > 0) diffHtml += '<span class="diff-tag changed clickable" onclick="setDiffFilter(\'changed\', this)" title="Click to show only changed items">~' + nc + ' Changed</span>';
        if (ng > 0) diffHtml += '<span class="diff-tag gone clickable" onclick="setDiffFilter(\'gone\', this)" title="Gone items are no longer in this sprint">-' + ng + ' Gone</span>';
        // Generate AI Fixes button — only when there are new bugs
        var newBugs = (diff.new_items || []).filter(function (it) { return (it.type || '').toLowerCase() === 'bug'; });
        if (newBugs.length > 0) {
            diffHtml += '<button class="btn-tab ai-fix-btn" onclick="generateAiFixes()" title="Generate AI fix suggestions for new bugs">Generate AI Fixes (' + newBugs.length + ' new bugs)</button>';
        }
    }
    document.getElementById('diffSummary').innerHTML = diffHtml;
    document.getElementById('diffSummary').style.display = diffHtml ? '' : 'none';

    // ── 动态生成状态过滤胶囊 ──
    buildFilterChips(data);

    // ── 渲染表格 ──
    // Hide diff column header (used only in compare mode)
    var diffHeaders = document.querySelectorAll('.diff-col-header');
    for (var i = 0; i < diffHeaders.length; i++) diffHeaders[i].style.display = 'none';
    renderBoardTable();
}

function buildFilterChips(data) {
    var incompleteSet = new Set((window.INCOMPLETE_STATES_RAW || []).map(function (s) { return s.toLowerCase(); }));

    // 统计各维度数量
    var states = {};
    var incCount = 0, compCount = 0, bugCount = 0;
    allItems.forEach(function (it) {
        var s = it.state;
        if (!states[s]) states[s] = 0;
        states[s]++;
        if (incompleteSet.has(s.toLowerCase())) incCount++;
        else compCount++;
        if ((it.type || '').toLowerCase() === 'bug') bugCount++;
    });

    var html = '';

    // 按顺序生成胶囊：Open > Done > Bug > 各状态
    html += '<button class="chip" data-filter="open">'
        + 'Open <span style="color:var(--ash)">' + incCount + '</span></button>';

    html += '<button class="chip" data-filter="done">'
        + 'Done <span style="color:var(--ash)">' + compCount + '</span></button>';

    if (bugCount > 0) {
        html += '<button class="chip" data-filter="bug">'
            + 'Bug <span style="color:var(--ash)">' + bugCount + '</span></button>';
    }

    var stateKeys = Object.keys(states).sort();
    stateKeys.forEach(function (s) {
        html += '<button class="chip" data-filter="' + s.toLowerCase() + '">'
            + escapeHtml(s) + ' <span style="color:var(--ash)">' + states[s] + '</span></button>';
    });
    document.getElementById('dynamicChips').innerHTML = html;

    // 刷新后保持当前 stateFilter 的视觉选中状态
    var allChip = document.querySelector('.chip[data-filter="all"]');
    var matchChip = document.querySelector('.chip[data-filter="' + stateFilter.toLowerCase() + '"]');
    if (stateFilter === 'all') {
        if (allChip) allChip.classList.add('active');
    } else {
        if (allChip) allChip.classList.remove('active');
        if (matchChip) matchChip.classList.add('active');
    }
}

function renderBoardTable() {
    var items = getFilteredItems();
    var incompleteSet = new Set((window.INCOMPLETE_STATES_RAW || []).map(function (s) { return s.toLowerCase(); }));

    // 更新结果计数
    var countEl = document.getElementById('resultCount');
    if (searchQuery || stateFilter !== 'all' || diffFilter) {
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

    // 消失条目列表（不在 allItems 中），供 onclick 引用
    var goneItems = diffFilter === 'gone' ? (diff.gone_items || []) : [];
    window._goneItemsForModal = goneItems;

    var html = '';
    if (items.length === 0) {
        var msg;
        if (diffFilter === 'gone') {
            msg = 'No items have disappeared from this sprint.';
        } else if (searchQuery) {
            msg = 'No items match "' + escapeHtml(searchQuery) + '"';
        } else {
            msg = 'No work items in this sprint.';
        }
        html = '<tr><td colspan="6"><div class="empty-state">'
            + '<div class="empty-icon">-</div>'
            + '<div class="empty-title">No results</div>'
            + '<div class="empty-desc">' + msg + '</div>'
            + '</div></td></tr>';
    }

    items.forEach(function (it) {
        // 在 allItems 中查找原始索引
        var origIdx = allItems.indexOf(it);
        var isGone = (origIdx === -1);

        var rowClass = '';
        var prefix = '';
        var titleStyle = '';
        var stateHtml = '';

        if (isGone) {
            rowClass = 'row-gone';
            prefix = '<span class="diff-dot" style="color:var(--accent-red)">-</span>';
        } else if (newIds.has(it.id)) {
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

        var clickTarget;
        if (isGone) {
            var goneIdx = goneItems.indexOf(it);
            clickTarget = 'window._goneItemsForModal[' + goneIdx + ']';
        } else {
            clickTarget = 'allItems[' + origIdx + ']';
        }

        html += '<tr class="' + rowClass + '" onclick="openDetailModal(' + clickTarget + ')">'
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
        var resp = await authFetch('/api/fixes');
        if (resp.status === 401) {
            document.getElementById('fixesContent').innerHTML =
                '<div class="error-state">Authentication required.</div>';
            return;
        }
        var fixes = await resp.json();
        allFixes = fixes || [];
        fixesSearchQuery = '';
        var input = document.getElementById('fixesSearchInput');
        if (input) input.value = '';
        document.getElementById('fixesSearchClear').style.display = 'none';
        renderFixes();
    } catch (e) {
        document.getElementById('fixesContent').innerHTML =
            '<div class="error-state">Failed to load: ' + escapeHtml(e.message) + '</div>';
    }
}

async function generateAiFixes() {
    // 禁用按钮防止重复点击
    var btn = document.querySelector('.ai-fix-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Generating AI Fixes...';
    }
    try {
        var resp = await authFetch('/api/fixes/run', { method: 'POST' });
        if (resp.status === 401) {
            alert('Authentication required.');
            return;
        }
        var data = await resp.json();
        if (data.ok) {
            // 切换到 AI Fixes 标签页并刷新
            switchTab('fixes');
            loadFixes();
        } else {
            alert('AI Fixes generation failed: ' + (data.error || 'Unknown error'));
        }
    } catch (e) {
        alert('AI Fixes generation failed: ' + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = btn.textContent.replace('Generating AI Fixes...', 'Generate AI Fixes');
        }
    }
}

function renderFixes() {
    var fixes = allFixes;
    var q = fixesSearchQuery.trim().toLowerCase();
    if (q) {
        fixes = fixes.filter(function (f) {
            return String(f.bug_id).indexOf(q) !== -1
                || (f.bug_title || '').toLowerCase().indexOf(q) !== -1
                || (f.response || '').toLowerCase().indexOf(q) !== -1;
        });
    }
    var html = '';
    if (!fixes || fixes.length === 0) {
        if (q) {
            html = '<div class="empty-state">'
                + '<div class="empty-icon">-</div>'
                + '<div class="empty-title">No matches</div>'
                + '<div class="empty-desc">No fixes match "' + escapeHtml(fixesSearchQuery) + '"</div>'
                + '</div>';
        } else {
            html = '<div class="empty-state">'
                + '<div class="empty-icon">*</div>'
                + '<div class="empty-title">No AI fix suggestions yet</div>'
                + '<div class="empty-desc">Click "Generate AI Fixes" in the diff summary when new bugs appear.</div>'
                + '</div>';
        }
    } else {
        if (q) {
            html += '<div style="padding:8px 20px 4px;color:var(--ash);font-size:0.8rem">'
                + fixes.length + ' / ' + allFixes.length + ' fixes match "' + escapeHtml(fixesSearchQuery) + '"</div>';
        }
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
}

function applyFixesFilter() {
    fixesSearchQuery = document.getElementById('fixesSearchInput').value.trim();
    document.getElementById('fixesSearchClear').style.display = fixesSearchQuery ? '' : 'none';
    renderFixes();
}

function clearFixesSearch() {
    document.getElementById('fixesSearchInput').value = '';
    fixesSearchQuery = '';
    document.getElementById('fixesSearchClear').style.display = 'none';
    renderFixes();
}


/* ══════════════════════════════════════════════════════════
   History
   ══════════════════════════════════════════════════════════ */
var _compareMode = false;
var _selectedSnapshots = [];

function toggleCompareMode() {
    _compareMode = !_compareMode;
    _selectedSnapshots = [];
    loadHistory();
}

function toggleSnapshotSelect(snapshotId) {
    var idx = _selectedSnapshots.indexOf(snapshotId);
    if (idx >= 0) {
        _selectedSnapshots.splice(idx, 1);
    } else {
        if (_selectedSnapshots.length >= 2) {
            _selectedSnapshots.shift();
        }
        _selectedSnapshots.push(snapshotId);
    }
    renderHistoryList();
}

async function compareSnapshotsByIds(id1, id2) {
    try {
        var resp = await authFetch('/api/history/diff/' + id1 + '/' + id2);
        if (resp.status === 401) {
            alert('Authentication required.');
            return;
        }
        var data = await resp.json();
        if (data.error) {
            alert(data.error);
            return;
        }
        _diffData = data;
        renderDiffView(data);
    } catch (e) {
        alert('Compare failed: ' + e.message);
    }
}

async function compareSelectedSnapshots() {
    if (_selectedSnapshots.length !== 2) return;
    var id1 = _selectedSnapshots[0];
    var id2 = _selectedSnapshots[1];
    compareSnapshotsByIds(id1, id2);
}

var _diffData = null;

function renderDiffView(data) {
    var diff = data.diff || {};
    var snapA = data.snapshot_a || {};
    var snapB = data.snapshot_b || {};
    var newItems = diff.new_items || [];
    var contItems = diff.continuing_items || [];
    var goneItems = diff.gone_items || [];

    // Header info
    document.getElementById('sprintName').textContent = 'Compare';
    document.getElementById('sprintDates').textContent =
        '#' + snapA.id + ' (' + (snapA.fetched_at || '') + ')  vs  #' + snapB.id + ' (' + (snapB.fetched_at || '') + ')';
    document.getElementById('updateTime').textContent = '';
    document.getElementById('offlineBadge').style.display = 'none';
    document.getElementById('toolbar').style.display = 'none';
    document.getElementById('diffSummary').style.display = 'none';

    // Stats
    var total = newItems.length + contItems.length + goneItems.length;
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statOpen').textContent = newItems.length;
    document.getElementById('statDone').textContent = goneItems.length;

    var html = '';
    if (total === 0) {
        html = '<tr><td colspan="7"><div class="empty-state">'
            + '<div class="empty-icon">=</div>'
            + '<div class="empty-title">No changes</div>'
            + '<div class="empty-desc">The two snapshots are identical.</div>'
            + '</div></td></tr>';
    }
    var rowNum = 0;

    // New items section
    if (newItems.length > 0) {
        html += '<tr class="diff-section-header"><td colspan="7">+ ' + newItems.length + ' New items  (in #' + snapB.id + ' but not in #' + snapA.id + ')</td></tr>';
        newItems.forEach(function (it) {
            rowNum++;
            var stateColor = getStateColor(it.state);
            html += '<tr class="row-new">'
                + '<td class="text-dim">' + rowNum + '</td>'
                + '<td><span class="wi-id">' + it.id + '</span></td>'
                + '<td style="color:var(--accent-green)">+' + escapeHtml(it.title) + '</td>'
                + '<td>' + escapeHtml(it.type) + '</td>'
                + '<td><span class="state-badge" style="background:' + stateColor + '24;color:' + stateColor + '">' + escapeHtml(it.state) + '</span></td>'
                + '<td class="assigned-cell">' + escapeHtml(it.assignedTo || 'Unassigned') + '</td>'
                + '<td><span class="diff-tag new">New</span></td>'
                + '</tr>';
        });
    }

    // Changed items section
    var changedItems = contItems.filter(function (it) { return it._state_changed; });
    var unchangedItems = contItems.filter(function (it) { return !it._state_changed; });
    if (changedItems.length > 0) {
        html += '<tr class="diff-section-header"><td colspan="7">~ ' + changedItems.length + ' Changed items  (state changed between snapshots)</td></tr>';
        changedItems.forEach(function (it) {
            rowNum++;
            var prevColor = getStateColor(it._prev_state);
            var curColor = getStateColor(it.state);
            html += '<tr class="row-changed">'
                + '<td class="text-dim">' + rowNum + '</td>'
                + '<td><span class="wi-id">' + it.id + '</span></td>'
                + '<td style="color:var(--accent-yellow)">~' + escapeHtml(it.title) + '</td>'
                + '<td>' + escapeHtml(it.type) + '</td>'
                + '<td>'
                    + '<span class="state-badge text-strike" style="background:' + prevColor + '24;color:' + prevColor + '">' + escapeHtml(it._prev_state) + '</span>'
                    + ' <span class="text-dim">-></span> '
                    + '<span class="state-badge" style="background:' + curColor + '24;color:' + curColor + ';font-weight:700">' + escapeHtml(it.state) + '</span>'
                + '</td>'
                + '<td class="assigned-cell">' + escapeHtml(it.assignedTo || 'Unassigned') + '</td>'
                + '<td><span class="diff-tag changed">Changed</span></td>'
                + '</tr>';
        });
    }

    // Gone items section
    if (goneItems.length > 0) {
        html += '<tr class="diff-section-header"><td colspan="7">- ' + goneItems.length + ' Gone items  (in #' + snapA.id + ' but not in #' + snapB.id + ')</td></tr>';
        goneItems.forEach(function (it) {
            rowNum++;
            var stateColor = getStateColor(it.state);
            html += '<tr class="row-gone">'
                + '<td class="text-dim">' + rowNum + '</td>'
                + '<td><span class="wi-id">' + it.id + '</span></td>'
                + '<td style="color:var(--accent-red)">-' + escapeHtml(it.title) + '</td>'
                + '<td>' + escapeHtml(it.type) + '</td>'
                + '<td><span class="state-badge" style="background:' + stateColor + '24;color:' + stateColor + '">' + escapeHtml(it.state) + '</span></td>'
                + '<td class="assigned-cell">' + escapeHtml(it.assignedTo || 'Unassigned') + '</td>'
                + '<td><span class="diff-tag gone">Gone</span></td>'
                + '</tr>';
        });
    }

    // Unchanged items (collapsed summary)
    if (unchangedItems.length > 0) {
        html += '<tr class="diff-section-header unchanged"><td colspan="7">' + unchangedItems.length + ' Unchanged items  (same state in both snapshots)</td></tr>';
    }

    document.getElementById('itemsBody').innerHTML = html;
    document.getElementById('historyPanel').style.display = 'none';
    document.getElementById('boardPanel').style.display = '';
    document.getElementById('statsRow').style.display = '';
    document.getElementById('viewToggleBar').style.display = 'none';
    // Show diff column
    var diffHeaders = document.querySelectorAll('.diff-col-header');
    for (var i = 0; i < diffHeaders.length; i++) diffHeaders[i].style.display = '';

    // Snapshot back bar
    document.getElementById('snapshotBackInfo').textContent =
        'Diff: #' + snapA.id + ' vs #' + snapB.id
        + '  (' + (snapA.sprint_name || '') + ')';
    document.getElementById('snapshotBackBar').style.display = 'flex';
    _viewingSnapshot = { id: snapB.id, sprintName: snapB.sprint_name, fetchedAt: snapB.fetched_at };
    _viewingDiffSnaps = [snapA.id, snapB.id];
}

async function loadHistory() {
    // Clear diff view when going back to history list
    _diffData = null;
    try {
        var resp = await authFetch('/api/history');
        if (resp.status === 401) {
            document.getElementById('historyContent').innerHTML =
                '<div class="error-state">Authentication required.</div>';
            return;
        }
        var snaps = await resp.json();
        if (snaps.error) {
            document.getElementById('historyContent').innerHTML =
                '<div class="error-state">Failed to load: ' + escapeHtml(snaps.error) + '</div>';
            return;
        }
        _snapshotList = snaps || [];
        renderHistoryList();
        document.getElementById('statTotal').textContent = '-';
        document.getElementById('statOpen').textContent = '-';
        document.getElementById('statDone').textContent = '-';
    } catch (e) {
        document.getElementById('historyContent').innerHTML =
            '<div class="error-state">Failed to load: ' + escapeHtml(e.message) + '</div>';
    }
}

function renderHistoryList() {
    var snaps = _snapshotList;
    var html = '';

    // 为每个快照计算同一个 Sprint 下的上一个快照 ID
    var lastSeen = {};
    var prevMap = {};
    for (var i = 0; i < snaps.length; i++) {
        var sprint = snaps[i].sprint_name;
        if (sprint in lastSeen) {
            prevMap[snaps[lastSeen[sprint]].id] = snaps[i].id;
        }
        lastSeen[sprint] = i;
    }

    // Compare mode toggle bar
    html += '<div class="history-compare-bar">';
    if (_compareMode) {
        html += '<span style="color:var(--accent-yellow);font-size:0.85rem">Compare mode: select 2 snapshots</span>';
        html += '<button class="btn-tab" onclick="toggleCompareMode()" style="margin-left:12px">Cancel</button>';
        if (_selectedSnapshots.length === 2) {
            html += '<button class="btn-tab" onclick="compareSelectedSnapshots()" style="margin-left:8px;background:var(--accent-green);color:#000;font-weight:600">Compare Now</button>';
        } else {
            html += '<button class="btn-tab" disabled style="margin-left:8px;opacity:0.4">Select ' + (2 - _selectedSnapshots.length) + ' more...</button>';
        }
    } else {
        html += '<button class="btn-tab" onclick="toggleCompareMode()">Compare Snapshots</button>';
    }
    html += '</div>';

    if (!snaps || snaps.length === 0) {
        html += '<div class="empty-state">'
            + '<div class="empty-icon">*</div>'
            + '<div class="empty-title">No snapshots yet</div>'
            + '<div class="empty-desc">Snapshots are recorded automatically when the monitor fetches data.</div>'
            + '</div>';
    } else {
        var hint = _compareMode
            ? 'Select two snapshots to compare'
            : 'Click a snapshot to view its items';
        html += '<div style="padding:12px 20px 8px;color:var(--ash);font-size:0.8rem">' + hint + '</div>';
        snaps.forEach(function (s) {
            var selected = _selectedSnapshots.indexOf(s.id) >= 0;
            var selClass = selected ? ' snapshot-selected' : '';
            var prevId = prevMap[s.id];
            html += '<div class="snapshot-item' + selClass + '" data-snapshot-id="' + s.id + '">';
            if (_compareMode) {
                var checkClass = selected ? ' checkbox-checked' : '';
                html += '<span class="snapshot-checkbox' + checkClass + '">' + (selected ? 'X' : '') + '</span>';
            }
            html += '<div class="snapshot-info"><span class="snap-id">#' + s.id + '</span>'
                + '<span class="snap-sprint">' + escapeHtml(s.sprint_name) + '</span>'
                + '<span class="snap-time">' + (s.fetched_at || '') + '</span></div>';
            html += '<div class="snap-right">'
                + '<span class="snap-count">' + (s.item_count || 0) + ' items</span>';
            if (!_compareMode && prevId) {
                html += '<button class="snapshot-compare-prev" data-prev-id="' + prevId + '" title="Compare with previous snapshot">Diff prev</button>';
            }
            html += '</div>'
                + '</div>';
        });
    }
    document.getElementById('historyContent').innerHTML = html;
}

async function loadSnapshotDetail(snapshotId, sprintName, fetchedAt) {
    try {
        var resp = await authFetch('/api/history/' + snapshotId);
        if (resp.status === 401) {
            alert('Authentication required.');
            return;
        }
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
        document.getElementById('viewToggleBar').style.display = 'none';

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
        // Hide diff column header
        var diffHeaders = document.querySelectorAll('.diff-col-header');
        for (var i = 0; i < diffHeaders.length; i++) diffHeaders[i].style.display = 'none';

        // 记录当前快照上下文，使 R 刷新时重新加载此快照
        _viewingSnapshot = { id: snapshotId, sprintName: sprintName, fetchedAt: fetchedAt };

        // 显示返回导航（含前进/后退）
        document.getElementById('snapshotBackInfo').textContent = 'Snapshot #' + snapshotId + '  ' + (sprintName || '') + '  (' + (fetchedAt || '') + ')';
        document.getElementById('snapshotBackBar').style.display = 'flex';
        _updateSnapshotNav(snapshotId);
    } catch (e) {
        alert('Snapshot load failed: ' + e.message);
    }
}

function goBackToHistory() {
    _viewingSnapshot = null;
    _viewingDiffSnaps = null;
    document.getElementById('snapshotBackBar').style.display = 'none';
    switchTab('history');
}

function _updateSnapshotNav(snapshotId) {
    // 在快照列表中定位当前快照，更新前进/后退按钮状态
    var list = _snapshotList;
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === snapshotId) { idx = i; break; }
    }
    var prevBtn = document.getElementById('snapshotPrevBtn');
    var nextBtn = document.getElementById('snapshotNextBtn');
    if (prevBtn) {
        prevBtn.disabled = (idx <= 0);
    }
    if (nextBtn) {
        nextBtn.disabled = (idx >= list.length - 1);
    }
}

function navigateSnapshot(direction) {
    // 在快照列表中向前/向后翻页
    if (!_viewingSnapshot) return;
    var list = _snapshotList;
    if (!list || list.length === 0) return;
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === _viewingSnapshot.id) { idx = i; break; }
    }
    if (idx < 0) return;
    var newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= list.length) return;
    var snap = list[newIdx];
    loadSnapshotDetail(snap.id, snap.sprint_name, snap.fetched_at);
}


// 事件委托：过滤胶囊点击（替代内联 onclick，避免含特殊字符的状态名导致 JS 语法错误）
document.getElementById('filterChips').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    var filter = chip.getAttribute('data-filter');
    if (filter) {
        setStateFilter(filter, chip);
    }
});

// 事件委托：历史快照列表点击（替代内联 onclick，避免 sprint_name 含引号等特殊字符导致 JS 语法错误）
document.getElementById('historyContent').addEventListener('click', function (e) {
    // Compare with previous 按钮
    var prevBtn = e.target.closest('.snapshot-compare-prev');
    if (prevBtn) {
        e.stopPropagation();
        var prevId = parseInt(prevBtn.getAttribute('data-prev-id'), 10);
        var item = prevBtn.closest('.snapshot-item');
        var curId = item ? parseInt(item.getAttribute('data-snapshot-id'), 10) : 0;
        if (prevId && curId) {
            compareSnapshotsByIds(prevId, curId);
        }
        return;
    }
    // 如果在 compare mode 中点击了 checkbox，切换选中
    if (_compareMode) {
        var cb = e.target.closest('.snapshot-checkbox');
        if (cb) {
            e.stopPropagation();
            var item = cb.closest('.snapshot-item');
            if (item) {
                var sid = parseInt(item.getAttribute('data-snapshot-id'), 10);
                if (sid) toggleSnapshotSelect(sid);
            }
            return;
        }
    }
    var item = e.target.closest('.snapshot-item');
    if (!item) return;
    var sid = parseInt(item.getAttribute('data-snapshot-id'), 10);
    if (!sid) return;
    if (_compareMode) {
        // compare mode: clicking the item toggles selection
        toggleSnapshotSelect(sid);
        return;
    }
    // 从 _snapshotList 中查找对应的快照
    var snap = null;
    for (var i = 0; i < _snapshotList.length; i++) {
        if (_snapshotList[i].id === sid) { snap = _snapshotList[i]; break; }
    }
    if (snap) {
        loadSnapshotDetail(snap.id, snap.sprint_name, snap.fetched_at);
    }
});

/* ══════════════════════════════════════════════════════════
   Initial load & auto-refresh
   ══════════════════════════════════════════════════════════ */
// 加载 Board 数据（通过 switchTab 确保 UI 状态正确初始化）
switchTab('board');

// 自动刷新：使用 refresh() 统一入口，正确处理快照视图、所有标签页的刷新
setInterval(function () {
    refresh();
}, 60000);
