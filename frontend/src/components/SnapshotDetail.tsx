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
  const snapshotId = parseInt(id || "0", 10);
  const { data, isError } = useSnapshot(snapshotId);
  const { data: config } = useConfig();
  const { data: snapshots } = useHistory();
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);

  const stateColors = config?.state_colors || {};
  const incompleteStates = config?.incomplete_states || [];
  const incompleteSet = new Set(incompleteStates.map((s) => s.toLowerCase()));

  if (isError) {
    return <div className="text-center py-16 text-accent-tomato">Failed to load snapshot data.</div>;
  }

  if (!data) {
    return <div className="text-center py-16 text-ink-mute">Loading...</div>;
  }

  const items = data.items || [];
  const meta = data.meta;
  let incCount = 0, compCount = 0;
  for (const it of items) {
    if (incompleteSet.has(it.state.toLowerCase())) incCount++;
    else compCount++;
  }

  const snapList = snapshots || [];
  const currentIdx = snapList.findIndex((s) => s.id === snapshotId);
  const prevSnap = currentIdx > 0 ? snapList[currentIdx - 1] : null;
  const nextSnap = currentIdx < snapList.length - 1 ? snapList[currentIdx + 1] : null;

  return (
    <div>
      <div className="flex items-center gap-4 py-2 mb-2 flex-wrap">
        <Button variant="outline" size="sm" className="text-primary-deep text-[13px]"
          onClick={() => navigate("/history")}>&larr; Back to History</Button>
        <Button variant="outline" size="sm" className="text-ink-mute w-7 h-7 p-0"
          disabled={!prevSnap} onClick={() => prevSnap && navigate(`/history/${prevSnap.id}`)}>&lsaquo;</Button>
        <Button variant="outline" size="sm" className="text-ink-mute w-7 h-7 p-0"
          disabled={!nextSnap} onClick={() => nextSnap && navigate(`/history/${nextSnap.id}`)}>&rsaquo;</Button>
        <span className="text-[13px] text-ink-mute">
          Snapshot #{snapshotId} {meta.sprint_name} ({meta.fetched_at})
        </span>
      </div>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <StatsRow total={items.length} open={incCount} done={compCount} />
      </div>

      <div className="table-wrap">
        {items.length === 0 ? (
          <div className="flex flex-col items-center py-24 text-ink-mute">
            <div className="text-4xl mb-3 opacity-60">-</div>
            <div className="text-base text-ink-secondary font-medium mb-2">No items</div>
            <div className="text-sm max-w-[30ch] text-ink-faint">This snapshot contains no work items.</div>
          </div>
        ) : (
          <WorkItemsTable items={items} onRowClick={setSelectedItem} stateColors={stateColors} />
        )}
      </div>

      <DetailModal item={selectedItem} stateColors={stateColors} onClose={() => setSelectedItem(null)} />
    </div>
  );
}
