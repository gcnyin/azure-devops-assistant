import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { WorkItemsTable } from "@/components/WorkItemsTable";
import { DetailModal } from "@/components/DetailModal";
import { useSnapshotDiff, useConfig } from "@/hooks/useApi";
import type { WorkItem } from "@/types/api";

export function DiffView() {
  const { idA, idB } = useParams<{ idA: string; idB: string }>();
  const navigate = useNavigate();
  const { data, isError } = useSnapshotDiff(parseInt(idA || "0", 10), parseInt(idB || "0", 10));
  const { data: config } = useConfig();
  const [sel, setSel] = useState<WorkItem | null>(null);
  const sc = config?.state_colors || {};

  if (isError) return <div className="text-center py-16 text-error">Failed to load diff data.</div>;
  if (!data) return <div className="text-center py-16 text-ink-muted">Loading...</div>;

  const d = data.diff || {}, sa = data.snapshot_a || {}, sb = data.snapshot_b || {};
  const ni = d.new_items || [], ci = d.continuing_items || [], gi = d.gone_items || [];
  const ch = ci.filter((it) => it._state_changed), un = ci.filter((it) => !it._state_changed);
  const tot = ni.length + ch.length + gi.length;

  return (
    <div>
      <div className="flex items-center gap-4 py-2 mb-2 flex-wrap">
        <Button variant="outline" size="sm" className="text-primary text-[13px]" onClick={() => navigate("/history")}>&larr; Back to History</Button>
        <span className="text-[13px] text-ink-muted">Diff: #{sa.id} vs #{sb.id} ({sb.sprint_name || ""})</span>
      </div>
      <div className="flex gap-6 mb-6 max-sm:w-full max-sm:justify-between">
        <div className="flex items-baseline gap-2"><span className="text-2xl font-medium tabular-nums text-ink">{tot}</span><span className="text-[13px] text-ink-muted">Total</span></div>
        <div className="flex items-baseline gap-2"><span className="text-2xl font-medium tabular-nums text-success">{ni.length}</span><span className="text-[13px] text-ink-muted">New</span></div>
        <div className="flex items-baseline gap-2"><span className="text-2xl font-medium tabular-nums text-error">{gi.length}</span><span className="text-[13px] text-ink-muted">Gone</span></div>
      </div>
      <div className="table-wrap">
        {tot === 0 ? (
          <div className="flex flex-col items-center py-24 text-ink-muted"><div className="text-4xl mb-3 opacity-60">=</div><div className="text-base text-ink-strong font-medium mb-2">No changes</div><div className="text-sm max-w-[30ch] text-ink-soft">The two snapshots are identical.</div></div>
        ) : (<>
          {ni.length > 0 && (<div><div className="px-4 py-2 text-[13px] font-semibold text-ink-muted bg-canvas-card border-b-2 border-hairline">+ {ni.length} New items (in #{sb.id} but not in #{sa.id})</div><WorkItemsTable items={ni} rowType="new" showDiffColumn diffType="new" onRowClick={setSel} stateColors={sc} /></div>)}
          {ch.length > 0 && (<div><div className="px-4 py-2 text-[13px] font-semibold text-ink-muted bg-canvas-card border-b-2 border-hairline">~ {ch.length} Changed items (state changed between snapshots)</div><WorkItemsTable items={ch} rowType="changed" showDiffColumn diffType="changed" onRowClick={setSel} stateColors={sc} /></div>)}
          {gi.length > 0 && (<div><div className="px-4 py-2 text-[13px] font-semibold text-ink-muted bg-canvas-card border-b-2 border-hairline">- {gi.length} Gone items (in #{sa.id} but not in #{sb.id})</div><WorkItemsTable items={gi} rowType="gone" showDiffColumn diffType="gone" onRowClick={setSel} stateColors={sc} /></div>)}
          {un.length > 0 && (<div className="px-4 py-2 text-[13px] font-normal text-ink-soft bg-canvas-card border-b border-hairline">{un.length} Unchanged items (same state in both snapshots)</div>)}
        </>)}
      </div>
      <DetailModal item={sel} stateColors={sc} onClose={() => setSel(null)} />
    </div>
  );
}
