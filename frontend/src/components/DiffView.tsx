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
  const idANum = parseInt(idA || "0", 10);
  const idBNum = parseInt(idB || "0", 10);
  const { data, isError } = useSnapshotDiff(idANum, idBNum);
  const { data: config } = useConfig();
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);

  const stateColors = config?.state_colors || {};

  if (isError) {
    return <div className="text-center py-16 text-accent-tomato">Failed to load diff data.</div>;
  }

  if (!data) {
    return <div className="text-center py-16 text-ink-mute">Loading...</div>;
  }

  const diff = data.diff || {};
  const snapA = data.snapshot_a || {};
  const snapB = data.snapshot_b || {};
  const newItems = diff.new_items || [];
  const contItems = diff.continuing_items || [];
  const goneItems = diff.gone_items || [];

  const changedItems = contItems.filter((it) => it._state_changed);
  const unchangedItems = contItems.filter((it) => !it._state_changed);
  const total = newItems.length + changedItems.length + goneItems.length;

  return (
    <div>
      <div className="flex items-center gap-4 py-2 mb-2 flex-wrap">
        <Button variant="outline" size="sm" className="text-primary-deep text-[13px]"
          onClick={() => navigate("/history")}>&larr; Back to History</Button>
        <span className="text-[13px] text-ink-mute">
          Diff: #{snapA.id} vs #{snapB.id} ({snapB.sprint_name || ""})
        </span>
      </div>

      <div className="flex gap-6 mb-6 max-sm:w-full max-sm:justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-medium tabular-nums text-ink">{total}</span>
          <span className="text-[13px] text-ink-mute">Total</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-medium tabular-nums text-primary">{newItems.length}</span>
          <span className="text-[13px] text-ink-mute">New</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-medium tabular-nums text-accent-tomato">{goneItems.length}</span>
          <span className="text-[13px] text-ink-mute">Gone</span>
        </div>
      </div>

      <div className="table-wrap">
        {total === 0 ? (
          <div className="flex flex-col items-center py-24 text-ink-mute">
            <div className="text-4xl mb-3 opacity-60">=</div>
            <div className="text-base text-ink-secondary font-medium mb-2">No changes</div>
            <div className="text-sm max-w-[30ch] text-ink-faint">The two snapshots are identical.</div>
          </div>
        ) : (
          <>
            {newItems.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[13px] font-semibold text-ink-mute bg-canvas-soft border-b-2 border-hairline">
                  + {newItems.length} New items (in #{snapB.id} but not in #{snapA.id})
                </div>
                <WorkItemsTable items={newItems} rowType="new" showDiffColumn diffType="new"
                  onRowClick={setSelectedItem} stateColors={stateColors} />
              </div>
            )}

            {changedItems.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[13px] font-semibold text-ink-mute bg-canvas-soft border-b-2 border-hairline">
                  ~ {changedItems.length} Changed items (state changed between snapshots)
                </div>
                <WorkItemsTable items={changedItems} rowType="changed" showDiffColumn diffType="changed"
                  onRowClick={setSelectedItem} stateColors={stateColors} />
              </div>
            )}

            {goneItems.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[13px] font-semibold text-ink-mute bg-canvas-soft border-b-2 border-hairline">
                  - {goneItems.length} Gone items (in #{snapA.id} but not in #{snapB.id})
                </div>
                <WorkItemsTable items={goneItems} rowType="gone" showDiffColumn diffType="gone"
                  onRowClick={setSelectedItem} stateColors={stateColors} />
              </div>
            )}

            {unchangedItems.length > 0 && (
              <div className="px-4 py-2 text-[13px] font-normal text-ink-faint bg-canvas-soft border-b border-hairline">
                {unchangedItems.length} Unchanged items (same state in both snapshots)
              </div>
            )}
          </>
        )}
      </div>

      <DetailModal item={selectedItem} stateColors={stateColors} onClose={() => setSelectedItem(null)} />
    </div>
  );
}
