import { useMemo } from "react";
import type { WorkItem, DiffInfo, DiffFilterType } from "@/types/api";

function isIncomplete(item: WorkItem, incompleteSet: Set<string>): boolean {
  return incompleteSet.has(item.state.toLowerCase());
}

function matchesSearch(item: WorkItem, query: string): boolean {
  return (
    (item.title || "").toLowerCase().includes(query) ||
    String(item.id).includes(query) ||
    (item.assignedTo || "").toLowerCase().includes(query) ||
    (item.type || "").toLowerCase().includes(query) ||
    (item.description || "").toLowerCase().includes(query)
  );
}

export function useFilteredItems(
  allItems: WorkItem[],
  diff: DiffInfo | null,
  diffFilter: DiffFilterType | null,
  stateFilter: string,
  searchQuery: string,
  incompleteStates: string[],
) {
  return useMemo(() => {
    const incompleteSet = new Set(
      incompleteStates.map((s) => s.toLowerCase()),
    );

    let items = allItems;

    // Diff filter
    if (diffFilter && diff) {
      if (diffFilter === "new") {
        const newIds = new Set((diff.new_items || []).map((it) => it.id));
        items = items.filter((it) => newIds.has(it.id));
      } else if (diffFilter === "changed") {
        const changedIds = new Set(
          (diff.continuing_items || [])
            .filter((it) => it._state_changed)
            .map((it) => it.id),
        );
        items = items.filter((it) => changedIds.has(it.id));
      } else if (diffFilter === "gone") {
        items = (diff.gone_items || []).slice();
      }
    }

    // State filter
    if (stateFilter === "open") {
      items = items.filter((it) => isIncomplete(it, incompleteSet));
    } else if (stateFilter === "done") {
      items = items.filter((it) => !isIncomplete(it, incompleteSet));
    } else if (stateFilter === "bug") {
      items = items.filter((it) => (it.type || "").toLowerCase() === "bug");
    } else if (stateFilter !== "all") {
      items = items.filter(
        (it) => it.state.toLowerCase() === stateFilter.toLowerCase(),
      );
    }

    // Text search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter((it) => matchesSearch(it, q));
    }

    return items;
  }, [allItems, diff, diffFilter, stateFilter, searchQuery, incompleteStates]);
}
