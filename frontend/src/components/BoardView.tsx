import { useCallback, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { toast } from "sonner";
import { WorkItemsTable } from "@/components/WorkItemsTable";
import { KanbanBoard } from "@/components/KanbanBoard";
import { BoardFilterBar } from "@/components/BoardFilterBar";
import { RightPanel } from "@/components/RightPanel";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useFixesMutation, useRefreshMutation } from "@/hooks/useApi";
import { useFilteredItems } from "@/hooks/useFilteredItems";
import { useBrowserNotification } from "@/hooks/useBrowserNotification";
import type { BoardData, WorkItem, DiffInfo, DiffFilterType } from "@/types/api";

interface BoardViewProps {
  data?: BoardData;
  incompleteStates: string[];
  stateColors: Record<string, string>;
  isError?: boolean;
  error?: Error | null;
}

export function BoardView({ data, incompleteStates, stateColors, isError, error }: BoardViewProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const view = (searchParams.get("view") || "all") as "all" | "me";
  const searchQuery = searchParams.get("q") || "";
  const diffFilterParam = searchParams.get("diff") || "";
  const layoutParam = searchParams.get("layout") || "kanban";
  const selectedParam = searchParams.get("selected");

  const diffFilter: DiffFilterType | null =
    diffFilterParam === "new" || diffFilterParam === "changed" || diffFilterParam === "gone"
      ? diffFilterParam : null;

  const layoutMode = (layoutParam === "table" ? "table" : "kanban") as "kanban" | "table";

  const fixesMutation = useFixesMutation();
  const refreshMutation = useRefreshMutation();
  const [checkedBugIds, setCheckedBugIds] = useState<Set<number>>(new Set());

  const handleNotifyNavigate = useCallback((params: Record<string, string>) => {
    const search = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(params)) {
      if (v) search.set(k, v); else search.delete(k);
    }
    const qs = search.toString();
    navigate(`/${qs ? `?${qs}` : ""}`);
  }, [navigate]);

  const { notifyRefresh } = useBrowserNotification(data, handleNotifyNavigate);

  const allItems = data?.items || [];
  const diff = data?.diff_info || null;

  const filteredItems = useFilteredItems(allItems, diff, diffFilter, "all", searchQuery, incompleteStates);

  // Selected item for right panel
  const selectedItem = useMemo(() => {
    if (!selectedParam) return null;
    const id = parseInt(selectedParam, 10);
    if (isNaN(id)) return null;
    return allItems.find((it) => it.id === id) || null;
  }, [selectedParam, allItems]);

  const setView = useCallback((v: "all" | "me") => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === "me") next.set("view", "me"); else next.delete("view");
      return next;
    });
  }, [setSearchParams]);

  const handleSearch = useCallback((value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("q", value); else next.delete("q");
      return next;
    });
  }, [setSearchParams]);

  const handleDiffFilter = useCallback((f: DiffFilterType | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (f) next.set("diff", f); else next.delete("diff");
      return next;
    });
  }, [setSearchParams]);

  const handleLayoutChange = useCallback((m: "kanban" | "table") => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (m === "table") next.set("layout", "table"); else next.delete("layout");
      return next;
    });
  }, [setSearchParams]);

  const handleCardClick = useCallback((item: WorkItem) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("selected", String(item.id));
      return next;
    });
  }, [setSearchParams]);

  const handleClosePanel = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("selected");
      return next;
    });
  }, [setSearchParams]);

  const handleTriggerFix = useCallback((bugId: number) => {
    fixesMutation.mutate([bugId], {
      onSuccess: (result) => {
        if (result.ok) toast.success(result.message || "Fix task queued");
        else toast.error(result.error || "Failed to queue fix task");
      },
      onError: () => toast.error("Failed to queue fix task"),
    });
  }, [fixesMutation]);

  const handleBulkFix = useCallback(() => {
    const ids = Array.from(checkedBugIds);
    if (ids.length === 0) return;
    fixesMutation.mutate(ids, {
      onSuccess: (result) => {
        if (result.ok) {
          toast.success(result.message || `Queued fix for ${ids.length} bugs`);
          setCheckedBugIds(new Set());
        } else {
          toast.error(result.error || "Failed to queue fix tasks");
        }
      },
      onError: () => toast.error("Failed to queue fix tasks"),
    });
  }, [checkedBugIds, fixesMutation]);

  const toggleBugCheck = useCallback((bugId: number) => {
    setCheckedBugIds((prev) => {
      const next = new Set(prev);
      if (next.has(bugId)) next.delete(bugId); else next.add(bugId);
      return next;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    refreshMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.ok) {
          const di = result.diff_info as DiffInfo | null | undefined;
          if (di) notifyRefresh(di);
          const nn = di?.new_items?.length || 0;
          const nc = di?.continuing_items?.filter((it) => it._state_changed).length || 0;
          const ng = di?.gone_items?.length || 0;
          const parts: string[] = [];
          if (nn > 0) parts.push(`+${nn} new`);
          if (nc > 0) parts.push(`~${nc} changed`);
          if (ng > 0) parts.push(`-${ng} gone`);
          toast.success(parts.length ? `Data refreshed: ${parts.join(", ")}` : result.message || "Data refreshed");
        } else {
          toast.error(result.error || "Refresh failed");
        }
      },
      onError: () => toast.error("Refresh request failed"),
    });
  }, [refreshMutation, notifyRefresh]);

  // Dimmed item IDs for search filtering in kanban
  const dimmedItemIds = useMemo(() => {
    if (!searchQuery) return new Set<number>();
    const q = searchQuery.toLowerCase();
    const matching = allItems.filter((it) =>
      String(it.id).includes(q) ||
      (it.title || "").toLowerCase().includes(q) ||
      (it.assignedTo || "").toLowerCase().includes(q) ||
      (it.state || "").toLowerCase().includes(q)
    );
    const matchingIds = new Set(matching.map((it) => it.id));
    const dimmed = new Set<number>();
    for (const it of allItems) {
      if (!matchingIds.has(it.id)) dimmed.add(it.id);
    }
    return dimmed;
  }, [searchQuery, allItems]);

  const isPanelOpen = selectedItem !== null;

  return (
    <div className="flex gap-0 h-full min-h-0">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0" style={isPanelOpen ? { maxWidth: "calc(100% - 480px)" } : undefined}>
        {data?.error && <ErrorBanner message={data.error} />}
        {isError && !data?.error && <ErrorBanner message={error?.message || "Failed to load board data"} />}

        <BoardFilterBar
          view={view}
          onViewChange={setView}
          searchQuery={searchQuery}
          onSearchChange={handleSearch}
          diffInfo={diff}
          diffFilter={diffFilter}
          onDiffFilterChange={handleDiffFilter}
          layoutMode={layoutMode}
          onLayoutChange={handleLayoutChange}
          onRefresh={handleRefresh}
          refreshPending={refreshMutation.isPending}
          checkedBugCount={checkedBugIds.size}
          onBulkFix={handleBulkFix}
          bulkFixPending={fixesMutation.isPending}
        />

        <div className="flex-1 min-h-0">
          {filteredItems.length === 0 && !data && !isError ? (
            <div className="flex items-center justify-center h-64 text-ink-muted text-sm">Loading...</div>
          ) : filteredItems.length === 0 && data ? (
            <div className="flex flex-col items-center justify-center h-64 text-ink-muted">
              <div className="text-4xl mb-3 opacity-60">-</div>
              <div className="text-sm font-medium text-ink-strong mb-1">No results</div>
              <div className="text-xs text-ink-soft">
                {searchQuery ? `No items match "${searchQuery}"` : "No work items in this sprint."}
              </div>
            </div>
          ) : layoutMode === "kanban" ? (
            <KanbanBoard
              items={filteredItems}
              incompleteStates={incompleteStates}
              stateColors={stateColors}
              diffFilter={diffFilter}
              selectedItemId={selectedItem?.id ?? null}
              dimmedItemIds={searchQuery ? dimmedItemIds : new Set()}
              onCardClick={handleCardClick}
              onTriggerFix={handleTriggerFix}
            />
          ) : (
            <div className="table-wrap">
              <WorkItemsTable
                items={filteredItems}
                rowType={diffFilter || undefined}
                onRowClick={handleCardClick}
                stateColors={stateColors}
                showFixColumn
                onTriggerFix={handleTriggerFix}
                onViewFix={(bugId) => navigate(`/fixes?bug_id=${bugId}`)}
                checkedBugIds={checkedBugIds}
                onToggleBugCheck={toggleBugCheck}
              />
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      {isPanelOpen && (
        <RightPanel
          item={selectedItem}
          stateColors={stateColors}
          onClose={handleClosePanel}
          onTriggerFix={handleTriggerFix}
        />
      )}
    </div>
  );
}
