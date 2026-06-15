import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useHistory } from "@/hooks/useApi";
import type { SnapshotItem } from "@/types/api";

export function HistoryView() {
  const { data: snaps } = useHistory();
  const navigate = useNavigate();
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const next = [...prev, id];
      if (next.length > 2) next.shift();
      return next;
    });
  };

  const compareNow = () => {
    if (selectedIds.length === 2) {
      const [a, b] = selectedIds.sort((x, y) => x - y);
      navigate(`/diff/${a}/${b}`);
    }
  };

  const prevMap: Record<number, number> = {};
  if (snaps) {
    const lastSeen: Record<string, number> = {};
    for (let i = 0; i < snaps.length; i++) {
      const sprint = snaps[i].sprint_name;
      if (sprint in lastSeen) prevMap[snaps[lastSeen[sprint]].id] = snaps[i].id;
      lastSeen[sprint] = i;
    }
  }

  return (
    <div className="table-wrap">
      <div className="flex items-center gap-3 px-4 sm:px-6 py-2 border-b border-hairline">
        {compareMode ? (
          <>
            <span className="text-ink-mute text-sm">Compare mode: select 2 snapshots</span>
            <Button variant="ghost" size="sm" onClick={() => { setCompareMode(false); setSelectedIds([]); }}>
              Cancel
            </Button>
            {selectedIds.length === 2 ? (
              <Button size="sm" className="bg-primary text-primary-foreground font-semibold hover:bg-primary-deep"
                onClick={compareNow}>Compare Now</Button>
            ) : (
              <Button size="sm" disabled variant="ghost">Select {2 - selectedIds.length} more...</Button>
            )}
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setCompareMode(true)}>Compare Snapshots</Button>
        )}
      </div>

      <div className="px-5 pt-3 text-[13px] text-ink-mute">
        {compareMode ? "Select two snapshots to compare" : "Click a snapshot to view its items"}
      </div>

      {!snaps ? (
        <div className="text-center py-16 text-ink-mute">Loading...</div>
      ) : snaps.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-ink-mute">
          <div className="text-4xl mb-3 opacity-60">*</div>
          <div className="text-base text-ink-secondary font-medium mb-2">No snapshots yet</div>
          <div className="text-sm max-w-[30ch] text-ink-faint">
            Snapshots are recorded automatically when the monitor fetches data.
          </div>
        </div>
      ) : (
        snaps.map((s: SnapshotItem) => {
          const selected = selectedIds.includes(s.id);
          const prevId = prevMap[s.id];
          return (
            <div key={s.id}
              className={`bg-canvas border border-hairline rounded-lg p-3 mb-2 mx-4 cursor-pointer transition-all flex justify-between items-center hover:bg-canvas-soft hover:border-hairline-strong ${selected ? "border-primary bg-primary/5" : ""}`}
              onClick={() => compareMode ? toggleSelect(s.id) : navigate(`/history/${s.id}`)}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {compareMode && (
                  <Checkbox checked={selected} className="shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={() => toggleSelect(s.id)} />
                )}
                <div className="flex items-center gap-3 flex-wrap min-w-0">
                  <span className="text-ink font-medium">#{s.id}</span>
                  <span className="text-primary-deep font-medium">{s.sprint_name}</span>
                  <span className="text-ink-mute text-sm">{s.fetched_at}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-ink-mute text-[13px]">{s.item_count} items</span>
                {!compareMode && prevId && (
                  <Button variant="ghost" size="sm"
                    className="text-[11px] h-auto py-0.5 px-2 text-ink-mute hover:text-primary hover:border-primary hover:bg-primary/10 border border-hairline rounded"
                    onClick={(e) => { e.stopPropagation(); navigate(`/diff/${prevId}/${s.id}`); }}>
                    Diff prev
                  </Button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
