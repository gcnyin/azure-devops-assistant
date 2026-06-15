import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useHistory } from "@/hooks/useApi";
import type { SnapshotItem } from "@/types/api";

export function HistoryView() {
  const { data: snaps } = useHistory();
  const navigate = useNavigate();
  const [cmp, setCmp] = useState(false);
  const [sel, setSel] = useState<number[]>([]);

  const toggle = (id: number) => setSel((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2));
  const compare = () => { if (sel.length === 2) { const [a, b] = sel.sort((x, y) => x - y); navigate(`/diff/${a}/${b}`); } };

  const prevMap: Record<number, number> = {};
  if (snaps) {
    const ls: Record<string, number> = {};
    for (let i = 0; i < snaps.length; i++) {
      const sp = snaps[i].sprint_name;
      if (sp in ls) prevMap[snaps[ls[sp]].id] = snaps[i].id;
      ls[sp] = i;
    }
  }

  return (
    <div className="table-wrap">
      <div className="flex items-center gap-3 px-4 sm:px-6 py-2 border-b border-hairline">
        {cmp ? (<>
          <span className="text-ink-muted text-sm">Compare mode: select 2 snapshots</span>
          <Button variant="ghost" size="sm" onClick={() => { setCmp(false); setSel([]); }}>Cancel</Button>
          {sel.length === 2 ? <Button size="sm" className="bg-primary text-primary-foreground font-semibold hover:bg-primary-active" onClick={compare}>Compare Now</Button>
            : <Button size="sm" disabled variant="ghost">Select {2 - sel.length} more...</Button>}
        </>) : <Button variant="ghost" size="sm" onClick={() => setCmp(true)}>Compare Snapshots</Button>}
      </div>
      <div className="px-5 pt-3 text-[13px] text-ink-muted">{cmp ? "Select two snapshots to compare" : "Click a snapshot to view its items"}</div>
      {!snaps ? <div className="text-center py-16 text-ink-muted">Loading...</div>
      : snaps.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-ink-muted">
          <div className="text-4xl mb-3 opacity-60">*</div>
          <div className="text-base text-ink-strong font-medium mb-2">No snapshots yet</div>
          <div className="text-sm max-w-[30ch] text-ink-soft">Snapshots are recorded automatically when the monitor fetches data.</div>
        </div>
      ) : snaps.map((s: SnapshotItem) => {
          const sid = s.id; const selC = sel.includes(sid); const pid = prevMap[sid];
          return (
            <div key={sid} className={`bg-canvas border border-hairline rounded-lg p-3 mb-2 mx-4 cursor-pointer transition-all flex justify-between items-center hover:bg-canvas-soft hover:border-hairline-soft ${selC ? "border-primary bg-primary/5" : ""}`}
              onClick={() => cmp ? toggle(sid) : navigate(`/history/${sid}`)}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {cmp && <Checkbox checked={selC} className="shrink-0" onClick={(e) => e.stopPropagation()} onCheckedChange={() => toggle(sid)} />}
                <div className="flex items-center gap-3 flex-wrap min-w-0">
                  <span className="text-ink font-medium">#{sid}</span>
                  <span className="text-primary font-medium">{s.sprint_name}</span>
                  <span className="text-ink-muted text-sm">{s.fetched_at}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-ink-muted text-[13px]">{s.item_count} items</span>
                {!cmp && pid && (
                  <Button variant="ghost" size="sm" className="text-[11px] h-auto py-0.5 px-2 text-ink-muted hover:text-primary hover:border-primary hover:bg-primary/10 border border-hairline rounded"
                    onClick={(e) => { e.stopPropagation(); navigate(`/diff/${pid}/${sid}`); }}>Diff prev</Button>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}
