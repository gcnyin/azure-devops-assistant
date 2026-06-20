import { useMemo } from "react";
import { KanbanColumn } from "@/components/KanbanColumn";
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
}

export function KanbanBoard({
  items, incompleteStates, stateColors, diffFilter,
  selectedItemId, dimmedItemIds, onCardClick, onTriggerFix,
}: KanbanBoardProps) {
  // Group items by state into ordered columns
  const columns = useMemo(() => {
    const grouped: Record<string, WorkItem[]> = {};
    const doneStates = new Set(["done", "closed", "completed", "resolved", "removed"]);

    for (const item of items) {
      const key = item.state || "Unknown";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    }

    // Order: QUERY_STATES order first, then remaining alphabetically, then Done
    const ordered: { state: string; items: WorkItem[] }[] = [];

    // 1. Incomplete states in config order
    for (const st of incompleteStates) {
      // Find matching key (case-insensitive)
      const match = Object.keys(grouped).find(
        (k) => k.toLowerCase() === st.toLowerCase()
      );
      if (match) {
        ordered.push({ state: match, items: grouped[match] });
        delete grouped[match];
      } else {
        // Column exists even if empty (for incomplete states)
        ordered.push({ state: st, items: [] });
      }
    }

    // 2. Remaining states (not in incomplete and not done)
    const remaining = Object.entries(grouped)
      .filter(([k]) => !doneStates.has(k.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));
    for (const [state, stateItems] of remaining) {
      ordered.push({ state, items: stateItems });
      delete grouped[state];
    }

    // 3. Done/Closed/Completed merge into "Done"
    const doneItems: WorkItem[] = [];
    for (const [state, stateItems] of Object.entries(grouped)) {
      doneItems.push(...stateItems);
      delete grouped[state];
    }
    // Sort done items by ID descending
    doneItems.sort((a, b) => b.id - a.id);
    if (doneItems.length > 0 || ordered.length > 0) {
      ordered.push({ state: "Done", items: doneItems });
    }

    return ordered;
  }, [items, incompleteStates]);

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin" style={{ minHeight: "calc(100vh - 220px)" }}>
      {columns.map((col) => (
        <KanbanColumn
          key={col.state}
          state={col.state}
          items={col.items}
          stateColors={stateColors}
          rowType={diffFilter || undefined}
          selectedItemId={selectedItemId}
          dimmedItemIds={dimmedItemIds}
          onCardClick={onCardClick}
          onTriggerFix={onTriggerFix}
        />
      ))}
      {columns.length === 0 && (
        <div className="flex items-center justify-center w-full text-ink-muted text-sm">
          No work items found
        </div>
      )}
    </div>
  );
}
