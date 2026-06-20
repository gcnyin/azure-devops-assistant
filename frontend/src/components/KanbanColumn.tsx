import { KanbanCard } from "@/components/KanbanCard";
import type { WorkItem, DiffFilterType } from "@/types/api";
import { getStateColor } from "@/lib/state-color";
import { useState } from "react";

interface KanbanColumnProps {
  state: string;
  items: WorkItem[];
  stateColors: Record<string, string>;
  rowType?: DiffFilterType;
  selectedItemId: number | null;
  dimmedItemIds: Set<number>;
  multiCol: boolean;
  onCardClick: (item: WorkItem) => void;
  onTriggerFix?: (bugId: number) => void;
  visibleCount?: number;
}

const DEFAULT_VISIBLE = 15;

export function KanbanColumn({
  state, items, stateColors, rowType,
  selectedItemId, dimmedItemIds,
  multiCol, onCardClick, onTriggerFix,
  visibleCount = DEFAULT_VISIBLE,
}: KanbanColumnProps) {
  const sc = getStateColor(state, stateColors);
  const [showAll, setShowAll] = useState(false);
  const displayItems = showAll ? items : items.slice(0, visibleCount);
  const hiddenCount = items.length - visibleCount;

  return (
    <div className="flex flex-col flex-1 min-w-[260px] max-w-[480px] border border-hairline rounded-[12px] overflow-hidden bg-canvas">
      {/* Column header — surface-cream-strong */}
      <div className="px-3 py-2.5" style={{ background: "var(--color-surface-cream-strong)" }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sc }} />
          <span className="text-[14px] font-medium text-ink-strong truncate">{state}</span>
          <span className="text-[13px] text-ink-muted tabular-nums ml-auto">{items.length}</span>
        </div>
      </div>

      {/* Cards */}
      <div className={`flex-1 overflow-y-auto px-3 py-3 scrollbar-thin ${multiCol ? "grid grid-cols-2 gap-2 content-start" : "space-y-2"}`}>
        {displayItems.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-[13px] text-ink-muted italic">
            No items
          </div>
        ) : (
          displayItems.map((item) => (
            <KanbanCard
              key={item.id} item={item} rowType={rowType} stateColors={stateColors}
              isSelected={selectedItemId === item.id} isDimmed={dimmedItemIds.has(item.id)}
              onClick={() => onCardClick(item)} onTriggerFix={onTriggerFix}
            />
          ))
        )}
        {hiddenCount > 0 && !showAll && (
          <button className="w-full text-[13px] text-ink-muted hover:text-ink py-2 text-center rounded-[8px] hover:bg-surface-card transition-colors"
            onClick={() => setShowAll(true)}>+ {hiddenCount} more...</button>
        )}
        {showAll && hiddenCount > 0 && (
          <button className="w-full text-[13px] text-ink-muted hover:text-ink py-2 text-center rounded-[8px] hover:bg-surface-card transition-colors"
            onClick={() => setShowAll(false)}>Show less</button>
        )}
      </div>
    </div>
  );
}
