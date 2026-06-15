import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { WorkItemsTable } from "@/components/WorkItemsTable";
import { DetailModal } from "@/components/DetailModal";
import { StatsRow } from "@/components/StatsRow";
import { useSnapshot, useHistory, useConfig } from "@/hooks/useApi";
import type { WorkItem } from "@/types/api";

export function SnapshotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sid = parseInt(id || "0", 10);
  const { data, isError } = useSnapshot(sid);
  const { data: config } = useConfig();
  const { data: snapshots } = useHistory();
  const [sel, setSel] = useState<WorkItem | null>(null);
  const sc = config?.state_colors || {};
  const incSet = new Set((config?.incomplete_states || []).map((s) => s.toLowerCase()));

  if (isError) return <div className="text-center py-16 text-error">Failed to load snapshot data.</div>;
  if (!data) return <div className="text-center py-16 text-ink-muted">Loading...</div>;

  const items = data.items || [];
  const meta = data.meta;
  let ic = 0, cc = 0;
  for (const it of items) { if (incSet.has(it.state.toLowerCase())) ic++; else cc++; }

  const sl = snapshots || [];
  const ci = sl.findIndex((s) => s.id === sid);
  const ps = ci > 0 ? sl[ci - 1] : null;
  const ns = ci < sl.length - 1 ? sl[ci + 1] : null;

  return (
    <div>
      <div className="flex items-center gap-4 py-2 mb-2 flex-wrap">
        <Button variant="outline" size="sm" className="text-primary text-[13px]" onClick={() => navigate("/history")}>&larr; Back to History</Button>
        <Button variant="outline" size="sm" className="text-ink-muted w-7 h-7 p-0" disabled={!ps} onClick={() => ps && navigate(`/history/${ps.id}`)}>&lsaquo;</Button>
        <Button variant="outline" size="sm" className="text-ink-muted w-7 h-7 p-0" disabled={!ns} onClick={() => ns && navigate(`/history/${ns.id}`)}>&rsaquo;</Button>
        <span className="text-[13px] text-ink-muted">Snapshot #{sid} {meta.sprint_name} ({meta.fetched_at})</span>
      </div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3"><StatsRow total={items.length} open={ic} done={cc} /></div>
      <div className="table-wrap">
        {items.length === 0 ? (
          <div className="flex flex-col items-center py-24 text-ink-muted"><div className="text-4xl mb-3 opacity-60">-</div><div className="text-base text-ink-strong font-medium mb-2">No items</div><div className="text-sm max-w-[30ch] text-ink-soft">This snapshot contains no work items.</div></div>
        ) : <WorkItemsTable items={items} onRowClick={setSel} stateColors={sc} />}
      </div>
      <DetailModal item={sel} stateColors={sc} onClose={() => setSel(null)} />
    </div>
  );
}
