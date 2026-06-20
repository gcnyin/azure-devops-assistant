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
  const typeFilterParam = searchParams.get("type") || "";

  const diffFilter: DiffFilterType | null =
    diffFilterParam === "new" || diffFilterParam === "changed" || diffFilterParam === "gone" ? diffFilterParam : null;
  const layoutMode = (layoutParam === "table" ? "table" : "kanban") as "kanban" | "table";
  const typeFilter = typeFilterParam || null;

  const fixesMutation = useFixesMutation();
  const refreshMutation = useRefreshMutation();
  const [checkedBugIds, setCheckedBugIds] = useState<Set<number>>(new Set());

  const handleNotifyNavigate = useCallback((params: Record<string, string>) => {
    const search = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(params)) { if (v) search.set(k, v); else search.delete(k); }
    navigate(`/${search.toString() ? `?${search}` : ""}`);
  }, [navigate]);
  const { notifyRefresh } = useBrowserNotification(data, handleNotifyNavigate);

  const allItems = data?.items || [];
  const diff = data?.diff_info || null;
  const filteredItems = useFilteredItems(allItems, diff, diffFilter, "all", searchQuery, incompleteStates, typeFilter);

  const selectedItem = useMemo(() => {
    if (!selectedParam) return null;
    const id = parseInt(selectedParam, 10);
    return isNaN(id) ? null : allItems.find((it) => it.id === id) || null;
  }, [selectedParam, allItems]);

  const setView = useCallback((v: "all" | "me") => {
    setSearchParams((prev) => { const n = new URLSearchParams(prev); v === "me" ? n.set("view", "me") : n.delete("view"); return n; });
  }, [setSearchParams]);
  const handleSearch = useCallback((value: string) => {
    setSearchParams((prev) => { const n = new URLSearchParams(prev); value ? n.set("q", value) : n.delete("q"); return n; });
  }, [setSearchParams]);
  const handleDiffFilter = useCallback((f: DiffFilterType | null) => {
    setSearchParams((prev) => { const n = new URLSearchParams(prev); f ? n.set("diff", f) : n.delete("diff"); return n; });
  }, [setSearchParams]);
  const handleLayoutChange = useCallback((m: "kanban" | "table") => {
    setSearchParams((prev) => { const n = new URLSearchParams(prev); m === "table" ? n.set("layout", "table") : n.delete("layout"); return n; });
  }, [setSearchParams]);
  const handleTypeFilter = useCallback((t: string | null) => {
    setSearchParams((prev) => { const n = new URLSearchParams(prev); t ? n.set("type", t) : n.delete("type"); return n; });
  }, [setSearchParams]);
  const handleCardClick = useCallback((item: WorkItem) => {
    setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set("selected", String(item.id)); return n; });
  }, [setSearchParams]);
  const handleClosePanel = useCallback(() => {
    setSearchParams((prev) => { const n = new URLSearchParams(prev); n.delete("selected"); return n; });
  }, [setSearchParams]);

  const handleTriggerFix = useCallback((bugId: number) => {
    fixesMutation.mutate([bugId], { onSuccess: (r) => toast[r.ok ? "success" : "error"](r.ok ? r.message || "Fix queued" : r.error || "Failed"), onError: () => toast.error("Failed") });
  }, [fixesMutation]);
  const handleBulkFix = useCallback(() => {
    const ids = Array.from(checkedBugIds); if (!ids.length) return;
    fixesMutation.mutate(ids, { onSuccess: (r) => { if (r.ok) { toast.success(r.message || `Queued ${ids.length} bugs`); setCheckedBugIds(new Set()); } else toast.error(r.error || "Failed"); }, onError: () => toast.error("Failed") });
  }, [checkedBugIds, fixesMutation]);
  const toggleBugCheck = useCallback((bugId: number) => {
    setCheckedBugIds((prev) => { const next = new Set(prev); next.has(bugId) ? next.delete(bugId) : next.add(bugId); return next; });
  }, []);

  const handleRefresh = useCallback(() => {
    refreshMutation.mutate(undefined, { onSuccess: (r) => { if (r.ok) { const di = r.diff_info as DiffInfo | null; if (di) notifyRefresh(di); const nn = di?.new_items?.length || 0, nc = di?.continuing_items?.filter((it: any) => it._state_changed).length || 0, ng = di?.gone_items?.length || 0; const p: string[] = []; if (nn) p.push(`+${nn} new`); if (nc) p.push(`~${nc} changed`); if (ng) p.push(`-${ng} gone`); toast.success(p.length ? `Refreshed: ${p.join(", ")}` : r.message || "Refreshed"); } else toast.error(r.error || "Failed"); }, onError: () => toast.error("Failed") });
  }, [refreshMutation, notifyRefresh]);

  const dimmedItemIds = useMemo(() => {
    if (!searchQuery) return new Set<number>();
    const q = searchQuery.toLowerCase();
    const matching = allItems.filter((it) => String(it.id).includes(q) || (it.title||"").toLowerCase().includes(q) || (it.assignedTo||"").toLowerCase().includes(q) || (it.state||"").toLowerCase().includes(q));
    const mid = new Set(matching.map((i) => i.id)), dim = new Set<number>();
    for (const it of allItems) if (!mid.has(it.id)) dim.add(it.id);
    return dim;
  }, [searchQuery, allItems]);

  const isPanelOpen = selectedItem !== null;

  return (
    <div className="flex gap-0 h-full min-h-0">
      <div className="flex-1 flex flex-col min-w-0" style={isPanelOpen ? { maxWidth: "calc(100% - 480px)" } : undefined}>
        {data?.error && <ErrorBanner message={data.error} />}
        {isError && !data?.error && <ErrorBanner message={error?.message || "Failed to load"} />}

        <BoardFilterBar view={view} onViewChange={setView} searchQuery={searchQuery} onSearchChange={handleSearch}
          typeFilter={typeFilter} onTypeFilterChange={handleTypeFilter}
          diffInfo={diff} diffFilter={diffFilter} onDiffFilterChange={handleDiffFilter}
          layoutMode={layoutMode} onLayoutChange={handleLayoutChange}
          onRefresh={handleRefresh} refreshPending={refreshMutation.isPending}
          checkedBugCount={checkedBugIds.size} onBulkFix={handleBulkFix} bulkFixPending={fixesMutation.isPending} />

        <div className="flex-1 min-h-0">
          {filteredItems.length === 0 && !data && !isError ? (
            <div className="flex items-center justify-center h-64 text-ink-muted text-[14px]">Loading...</div>
          ) : filteredItems.length === 0 && data ? (
            <div className="flex flex-col items-center justify-center h-64 text-ink-muted">
              <div className="text-4xl mb-3 opacity-60">-</div>
              <div className="text-[14px] font-medium text-ink-strong mb-1">No results</div>
              <div className="text-[13px] text-ink-soft">{searchQuery ? `No items match "${searchQuery}"` : "No work items in this sprint."}</div>
            </div>
          ) : layoutMode === "kanban" ? (
            <KanbanBoard items={filteredItems} incompleteStates={incompleteStates} stateColors={stateColors}
              diffFilter={diffFilter} selectedItemId={selectedItem?.id ?? null}
              dimmedItemIds={searchQuery ? dimmedItemIds : new Set()}
              onCardClick={handleCardClick} onTriggerFix={handleTriggerFix} />
          ) : (
            <div className="table-wrap">
              <WorkItemsTable items={filteredItems} rowType={diffFilter || undefined} onRowClick={handleCardClick}
                stateColors={stateColors} showFixColumn onTriggerFix={handleTriggerFix}
                onViewFix={(bugId) => navigate(`/fixes?bug_id=${bugId}`)}
                checkedBugIds={checkedBugIds} onToggleBugCheck={toggleBugCheck} />
            </div>
          )}
        </div>
      </div>
      {isPanelOpen && <RightPanel item={selectedItem} stateColors={stateColors} onClose={handleClosePanel} onTriggerFix={handleTriggerFix} />}
    </div>
  );
}
