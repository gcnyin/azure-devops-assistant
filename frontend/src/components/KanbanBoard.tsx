import { useMemo } from "react";
import { KanbanColumn } from "@/components/KanbanColumn";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkItem, DiffFilterType } from "@/types/api";

interface KanbanBoardProps {
  items: WorkItem[];
  incompleteStates: string[];
  stateColors: Record<string, string>;
  diffFilter: DiffFilterType | null;
  selectedItemId: number | null;
  dimmedItemIds: Set<number>;
  onCardClick: (item: WorkItem) => void;
  onTriggerFix?: (bugId: number) => void;
  isLoading?: boolean;
}

function SkeletonBoard() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3 flex-1 min-h-0">
      {[1, 2, 3].map((col) => (
        <div key={col} className="flex flex-col flex-1 min-w-[260px] max-w-[480px]">
          <div className="px-3 py-2.5 rounded-t-[12px]" style={{ background: "var(--color-surface-cream-strong)" }}>
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex-1 px-2 py-2 space-y-2">
            {[1, 2, 3, 4, 5].map((card) => (
              <div key={card} className="bg-surface-card rounded-[8px] px-3.5 py-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-10 rounded-full" />
                  <Skeleton className="h-3 w-8" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex items-center gap-2 pt-1">
                  <Skeleton className="h-2 w-2 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-14 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function KanbanBoard({
  items, incompleteStates, stateColors, diffFilter,
  selectedItemId, dimmedItemIds, onCardClick, onTriggerFix,
  isLoading,
}: KanbanBoardProps) {
  const columns = useMemo(() => {
    const grouped: Record<string, WorkItem[]> = {};
    const doneStates = new Set(["done", "closed", "completed", "resolved", "removed"]);

    for (const item of items) {
      const key = item.state || "Unknown";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    }

    const ordered: { state: string; items: WorkItem[] }[] = [];

    // 1. Incomplete states in config order
    for (const st of incompleteStates) {
      const match = Object.keys(grouped).find((k) => k.toLowerCase() === st.toLowerCase());
      if (match) {
        ordered.push({ state: match, items: grouped[match] });
        delete grouped[match];
      } else {
        ordered.push({ state: st, items: [] });
      }
    }

    // 2. Remaining states alphabetical
    const remaining = Object.entries(grouped)
      .filter(([k]) => !doneStates.has(k.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));
    for (const [state, stateItems] of remaining) {
      ordered.push({ state, items: stateItems });
      delete grouped[state];
    }

    // 3. Done merge
    const doneItems: WorkItem[] = [];
    for (const [, stateItems] of Object.entries(grouped)) doneItems.push(...stateItems);
    doneItems.sort((a, b) => b.id - a.id);
    if (doneItems.length > 0 || ordered.length > 0) {
      ordered.push({ state: "Done", items: doneItems });
    }

    return ordered;
  }, [items, incompleteStates]);

  if (isLoading) return <SkeletonBoard />;

  // Filter: hide empty columns except Done (anchor column)
  const visibleColumns = columns.filter(
    (col) => col.items.length > 0 || col.state === "Done"
  );

  const useMultiCol = visibleColumns.length <= 3;

  return (
    <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin flex-1 min-h-0">
      {visibleColumns.map((col) => (
        <KanbanColumn
          key={col.state} state={col.state} items={col.items} stateColors={stateColors}
          multiCol={useMultiCol} rowType={diffFilter || undefined} selectedItemId={selectedItemId}
          dimmedItemIds={dimmedItemIds} onCardClick={onCardClick} onTriggerFix={onTriggerFix}
        />
      ))}
    </div>
  );
}
