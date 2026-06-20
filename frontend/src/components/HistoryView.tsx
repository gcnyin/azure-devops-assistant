import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { WorkItemsTable } from "@/components/WorkItemsTable";
import { StatsRow } from "@/components/StatsRow";
import { DetailModal } from "@/components/DetailModal";
import { useHistory, useSnapshot, useSnapshotDiff, useConfig } from "@/hooks/useApi";
import type { SnapshotItem, WorkItem, DiffSnapshotData } from "@/types/api";

export function HistoryView() {
  const navigate = useNavigate();
  const { data: snaps } = useHistory();
  const { data: config } = useConfig();
  const sc = config?.state_colors || {};
  const incSet = new Set((config?.incomplete_states || []).map((s) => s.toLowerCase()));

  const [cmpMode, setCmpMode] = useState(false);
  const [cmpSel, setCmpSel] = useState<number[]>([]);
  const [selectedSnapId, setSelectedSnapId] = useState<number | null>(null);
  const [selItem, setSelItem] = useState<WorkItem | null>(null);

  // Load selected snapshot
  const { data: snapDetail, isLoading: snapLoading } = useSnapshot(selectedSnapId ?? 0);

  // Load diff if 2 selected
  const [diffA, diffB] = cmpSel.length === 2 ? cmpSel.sort((a, b) => a - b) : [0, 0];
  const { data: diffData } = useSnapshotDiff(diffA, diffB);

  const toggleCmpSel = useCallback((id: number) => {
    setCmpSel((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2));
  }, []);

  const handleSnapClick = useCallback((sid: number) => {
    if (cmpMode) {
      toggleCmpSel(sid);
    } else {
      setSelectedSnapId(sid);
      setCmpSel([]);
    }
  }, [cmpMode, toggleCmpSel]);

  // Build prev-map for "Diff prev" button
  const prevMap: Record<number, number> = useMemo(() => {
    const map: Record<number, number> = {};
    if (!snaps) return map;
    const ls: Record<string, number> = {};
    for (let i = 0; i < snaps.length; i++) {
      const sp = snaps[i].sprint_name;
      if (sp in ls) map[snaps[ls[sp]].id] = snaps[i].id;
      ls[sp] = i;
    }
    return map;
  }, [snaps]);

  const closePanel = () => {
    setSelectedSnapId(null);
    setCmpSel([]);
  };

  const isPanelOpen = selectedSnapId !== null || (cmpMode && cmpSel.length === 2);

  return (
    <div className="flex gap-0 h-full min-h-0">
      {/* Left: snapshot list */}
      <div className="flex flex-col min-w-0" style={isPanelOpen ? { width: "calc(100% - 480px)", maxWidth: "calc(100% - 480px)" } : { flex: 1 }}>
        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {cmpMode ? (
            <>
              <span className="text-xs text-ink-muted">Compare mode: select 2 snapshots</span>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setCmpMode(false); setCmpSel([]); }}>Cancel</Button>
              {cmpSel.length === 2 ? (
                <Button size="sm" className="text-xs bg-primary text-primary-foreground hover:bg-primary-active"
                  onClick={() => { setSelectedSnapId(null); }}>
                  Compare Now
                </Button>
              ) : (
                <Button size="sm" disabled variant="ghost" className="text-xs">Select {2 - cmpSel.length} more...</Button>
              )}
            </>
          ) : (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setCmpMode(true)}>Compare Snapshots</Button>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {!snaps ? (
            <div className="text-center py-16 text-ink-muted text-sm">Loading...</div>
          ) : snaps.length === 0 ? (
            <div className="flex flex-col items-center py-24 text-ink-muted">
              <div className="text-4xl mb-3 opacity-60">*</div>
              <div className="text-sm font-medium text-ink-strong mb-1">No snapshots yet</div>
              <div className="text-xs text-ink-soft">Snapshots are recorded automatically when the monitor fetches data.</div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {snaps.map((s: SnapshotItem) => {
                const sid = s.id;
                const selC = cmpSel.includes(sid);
                const pid = prevMap[sid];
                const isActive = selectedSnapId === sid;
                return (
                  <div
                    key={sid}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${
                      isActive
                        ? "bg-primary/10 border-primary/30"
                        : selC
                          ? "bg-primary/5 border-primary/30"
                          : "border-transparent hover:bg-canvas-soft hover:border-hairline"
                    }`}
                    onClick={() => handleSnapClick(sid)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {cmpMode && (
                        <Checkbox checked={selC} className="shrink-0" onClick={(e) => e.stopPropagation()}
                          onCheckedChange={() => toggleCmpSel(sid)} />
                      )}
                      <span className="text-xs text-ink-muted tabular-nums shrink-0">#{sid}</span>
                      <span className="text-sm font-medium text-primary truncate">{s.sprint_name}</span>
                      <span className="text-xs text-ink-muted truncate">{s.fetched_at}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-ink-soft tabular-nums">{s.item_count} items</span>
                      {!cmpMode && pid && !isActive && (
                        <Button variant="ghost" size="sm" className="text-[10px] h-auto py-0.5 px-2 text-ink-muted hover:text-primary border border-hairline rounded"
                          onClick={(e) => { e.stopPropagation(); navigate(`/diff/${pid}/${sid}`); }}>
                          Diff prev
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: detail or diff panel */}
      {isPanelOpen && (
        <div className="w-[480px] shrink-0 border-l border-hairline bg-canvas-card flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
            <span className="text-sm font-semibold text-ink-strong">
              {cmpMode && cmpSel.length === 2
                ? `Diff: #${diffA} vs #${diffB}`
                : snapDetail
                  ? `Snapshot #${selectedSnapId}`
                  : "Snapshot"}
            </span>
            <button onClick={closePanel}
              className="p-1 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
            {cmpMode && cmpSel.length === 2 ? (
              <DiffPanel data={diffData || null} stateColors={sc} incSet={incSet} onItemClick={setSelItem}
                onViewFull={() => navigate(`/diff/${diffA}/${diffB}`)} />
            ) : snapLoading ? (
              <div className="text-center py-16 text-ink-muted text-sm">Loading...</div>
            ) : snapDetail ? (
              <SnapshotPanel detail={snapDetail} stateColors={sc} incSet={incSet} onItemClick={setSelItem} />
            ) : (
              <div className="text-center py-16 text-ink-muted text-sm">Select a snapshot to view details</div>
            )}
          </div>
          <DetailModal item={selItem} stateColors={sc} onClose={() => setSelItem(null)} />
        </div>
      )}
    </div>
  );
}

/* ── Snapshot detail panel ── */
function SnapshotPanel({ detail, stateColors, incSet: _incSet, onItemClick }: {
  detail: any; stateColors: Record<string, string>; incSet: Set<string>; onItemClick: (item: WorkItem) => void;
}) {
  const items = detail.items || [];
  const meta = detail.meta;
  let ic = 0, cc = 0;
  for (const it of items) {
    if (_incSet.has(it.state.toLowerCase())) ic++; else cc++;
  }

  return (
    <div>
      <div className="text-xs text-ink-muted mb-3">{meta.sprint_name} · {meta.fetched_at} · {meta.item_count} items</div>
      <div className="mb-4"><StatsRow total={items.length} open={ic} done={cc} /></div>
      {items.length === 0 ? (
        <div className="text-center py-8 text-ink-muted text-sm">No items in this snapshot</div>
      ) : (
        <WorkItemsTable items={items} onRowClick={onItemClick} stateColors={stateColors} />
      )}
    </div>
  );
}

/* ── Diff summary panel ── */
function DiffPanel({ data, stateColors, incSet: _incSet, onItemClick, onViewFull }: {
  data: DiffSnapshotData | null; stateColors: Record<string, string>; incSet: Set<string>; onItemClick: (item: WorkItem) => void; onViewFull: () => void;
}) {
  if (!data) return <div className="text-center py-16 text-ink-muted text-sm">Loading diff...</div>;

  const d = data.diff || {};
  const ni = d.new_items || [], ci = d.continuing_items || [], gi = d.gone_items || [];
  const ch = ci.filter((it: any) => it._state_changed);
  const tot = ni.length + ch.length + gi.length;

  return (
    <div>
      <div className="text-xs text-ink-muted mb-3">
        {data.snapshot_a.sprint_name} (#{data.snapshot_a.id}) vs {data.snapshot_b.sprint_name} (#{data.snapshot_b.id})
      </div>
      <div className="mb-4"><StatsRow total={tot} open={ni.length} done={gi.length} /></div>
      {tot === 0 ? (
        <div className="text-center py-8 text-ink-muted text-sm">No changes between snapshots</div>
      ) : (
        <div className="space-y-3">
          {ni.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-success mb-1">+ {ni.length} New</div>
              <WorkItemsTable items={ni.slice(0, 5)} rowType="new" showDiffColumn diffType="new" onRowClick={onItemClick} stateColors={stateColors} />
              {ni.length > 5 && <div className="text-[11px] text-ink-muted mt-1">... and {ni.length - 5} more</div>}
            </div>
          )}
          {ch.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-accent-amber mb-1">~ {ch.length} Changed</div>
              <WorkItemsTable items={ch.slice(0, 5)} rowType="changed" showDiffColumn diffType="changed" onRowClick={onItemClick} stateColors={stateColors} />
              {ch.length > 5 && <div className="text-[11px] text-ink-muted mt-1">... and {ch.length - 5} more</div>}
            </div>
          )}
          {gi.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-error mb-1">- {gi.length} Gone</div>
              <WorkItemsTable items={gi.slice(0, 5)} rowType="gone" showDiffColumn diffType="gone" onRowClick={onItemClick} stateColors={stateColors} />
              {gi.length > 5 && <div className="text-[11px] text-ink-muted mt-1">... and {gi.length - 5} more</div>}
            </div>
          )}
        </div>
      )}
      {tot > 0 && (
        <button onClick={onViewFull}
          className="w-full mt-4 text-xs text-primary hover:text-primary-active py-2 text-center border-t border-hairline pt-3 transition-colors">
          View Full Diff &rarr;
        </button>
      )}
    </div>
  );
}
