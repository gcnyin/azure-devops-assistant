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
  onCardClick: (item: WorkItem) => void;
  onTriggerFix?: (bugId: number) => void;
  visibleCount?: number;
}

const DEFAULT_VISIBLE = 15;

export function KanbanColumn({
  state, items, stateColors, rowType,
  selectedItemId, dimmedItemIds,
  onCardClick, onTriggerFix,
  visibleCount = DEFAULT_VISIBLE,
}: KanbanColumnProps) {
  const sc = getStateColor(state, stateColors);
  const [showAll, setShowAll] = useState(false);
  const displayItems = showAll ? items : items.slice(0, visibleCount);
  const hiddenCount = items.length - visibleCount;

  return (
    <div className="flex flex-col bg-[var(--color-kanban-col)] border border-hairline rounded-xl min-w-[260px] w-[280px] max-w-[320px] shrink-0">
      {/* Column header */}
      <div className="px-3 py-2.5 border-b border-hairline rounded-t-xl bg-[var(--color-kanban-col-header)]">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: sc }}
          />
          <span className="text-sm font-semibold text-ink-strong truncate">{state}</span>
          <span className="text-xs text-ink-muted tabular-nums ml-auto">{items.length}</span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2 scrollbar-thin">
        {displayItems.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-ink-soft italic">
            No items
          </div>
        ) : (
          displayItems.map((item) => (
            <KanbanCard
              key={item.id}
              item={item}
              rowType={rowType}
              stateColors={stateColors}
              isSelected={selectedItemId === item.id}
              isDimmed={dimmedItemIds.has(item.id)}
              onClick={() => onCardClick(item)}
              onTriggerFix={onTriggerFix}
            />
          ))
        )}

        {/* Show more / show less */}
        {hiddenCount > 0 && !showAll && (
          <button
            className="w-full text-xs text-ink-muted hover:text-ink py-2 text-center rounded-md hover:bg-canvas-card transition-colors"
            onClick={() => setShowAll(true)}
          >
            + {hiddenCount} more...
          </button>
        )}
        {showAll && hiddenCount > 0 && (
          <button
            className="w-full text-xs text-ink-muted hover:text-ink py-2 text-center rounded-md hover:bg-canvas-card transition-colors"
            onClick={() => setShowAll(false)}
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}
