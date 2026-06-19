import { useCallback, useState } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { WorkItemsTable } from "@/components/WorkItemsTable";
import { DetailModal } from "@/components/DetailModal";
import { ErrorBanner } from "@/components/ErrorBanner";
import { StatsRow } from "@/components/StatsRow";
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
  const view = searchParams.get("view") || "all";
  const searchQuery = searchParams.get("q") || "";
  const stateFilter = searchParams.get("state") || "all";
  const diffFilterParam = searchParams.get("diff") || "";

  const diffFilter: DiffFilterType | null =
    diffFilterParam === "new" || diffFilterParam === "changed" || diffFilterParam === "gone"
      ? diffFilterParam : null;

  const fixesMutation = useFixesMutation();
  const refreshMutation = useRefreshMutation();
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [searchText, setSearchText] = useState(searchQuery);

  const { permission, enabled, requestPermission, toggleEnabled } = useBrowserNotification(data);

  const allItems = data?.items || [];
  const diff = data?.diff_info || null;

  const filteredItems = useFilteredItems(allItems, diff, diffFilter, stateFilter, searchQuery, incompleteStates);

  const incompleteSet = new Set(incompleteStates.map((s) => s.toLowerCase()));
  let incCount = 0, compCount = 0;
  for (const it of allItems) {
    if (incompleteSet.has(it.state.toLowerCase())) incCount++; else compCount++;
  }

  const updateParam = useCallback((key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value && value !== "all") next.set(key, value); else next.delete(key);
      return next;
    });
  }, [setSearchParams]);

  const setView = (v: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === "me") next.set("view", "me"); else next.delete("view");
      return next;
    });
  };

  const handleSearch = (value: string) => {
    setSearchText(value);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("q", value); else next.delete("q");
      return next;
    });
  };

  const handleTriggerFix = (bugId: number) => {
    fixesMutation.mutate([bugId], {
      onSuccess: (result) => {
        if (result.ok) toast.success(result.message || "Fix task queued");
        else toast.error(result.error || "Failed to queue fix task");
      },
      onError: () => toast.error("Failed to queue fix task"),
    });
  };

  const handleViewFix = (bugId: number) => {
    navigate(`/fixes?bug_id=${bugId}`);
  };

  const nn = diff?.new_items?.length || 0;
  const nc = diff?.continuing_items?.filter((it) => it._state_changed).length || 0;
  const ng = diff?.gone_items?.length || 0;

  const stateMap: Record<string, number> = {};
  for (const it of allItems) stateMap[it.state] = (stateMap[it.state] || 0) + 1;
  let bugCount = 0;
  for (const it of allItems) { if ((it.type || "").toLowerCase() === "bug") bugCount++; }

  const handleRefresh = () => {
    refreshMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.ok) {
          const di = result.diff_info as DiffInfo | null | undefined;
          const nn2 = di?.new_items?.length || 0;
          const nc2 = di?.continuing_items?.filter((it) => it._state_changed).length || 0;
          const ng2 = di?.gone_items?.length || 0;
          const parts: string[] = [];
          if (nn2 > 0) parts.push(`+${nn2} new`);
          if (nc2 > 0) parts.push(`~${nc2} changed`);
          if (ng2 > 0) parts.push(`-${ng2} gone`);
          toast.success(parts.length ? `Data refreshed: ${parts.join(", ")}` : result.message || "Data refreshed");
        } else {
          toast.error(result.error || "Refresh failed");
        }
      },
      onError: () => toast.error("Refresh request failed"),
    });
  };

  return (
    <div>
      {data?.error && <ErrorBanner message={data.error} />}
      {isError && !data?.error && <ErrorBanner message={error?.message || "Failed to load board data"} />}

      <div className="flex items-center gap-1 mb-6">
        <span className="text-sm text-ink-muted mr-1">View:</span>
        <Button variant={view === "all" ? "secondary" : "ghost"} size="sm" className="rounded-lg"
          onClick={() => setView("all")}>All</Button>
        <Button variant={view === "me" ? "secondary" : "ghost"} size="sm" className="rounded-lg"
          onClick={() => setView("me")}>Me</Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg px-2"
                onClick={() => {
                  if (permission !== "granted") {
                    requestPermission();
                  } else {
                    toggleEnabled();
                  }
                }}
              >
                {permission === "unsupported" ? (
                  <span className="text-ink-soft text-sm">-</span>
                ) : permission === "denied" ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                ) : permission === "granted" && enabled ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-amber"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {permission === "unsupported"
                ? "此浏览器不支持通知"
                : permission === "denied"
                  ? "通知权限已被拒绝"
                  : permission !== "granted"
                    ? "点击开启浏览器通知"
                    : enabled
                      ? "通知已开启 — 点击关闭"
                      : "通知已暂停 — 点击开启"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="rounded-lg"
          disabled={refreshMutation.isPending}
          onClick={handleRefresh}
        >
          {refreshMutation.isPending ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap max-md:flex-col max-md:items-stretch max-md:gap-2">
        <div className="relative flex-[0_1_320px] min-w-[180px] max-md:flex-none max-md:w-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft pointer-events-none">S</span>
          <Input className="pl-[38px]" placeholder="Filter work items..." value={searchText}
            onChange={(e) => handleSearch(e.target.value)} />
        </div>

        <div className="flex items-center gap-1 flex-wrap max-md:overflow-x-auto max-md:flex-nowrap max-md:pb-1">
          <Button variant={stateFilter === "all" && !diffFilter ? "secondary" : "ghost"} size="sm" className="rounded-lg"
            onClick={() => updateParam("state", "all")}>All</Button>
          <Button variant={stateFilter === "open" ? "secondary" : "ghost"} size="sm" className="rounded-lg"
            onClick={() => updateParam("state", "open")}>Open <span className="text-ink-soft ml-1 text-xs">{incCount}</span></Button>
          <Button variant={stateFilter === "done" ? "secondary" : "ghost"} size="sm" className="rounded-lg"
            onClick={() => updateParam("state", "done")}>Done <span className="text-ink-soft ml-1 text-xs">{compCount}</span></Button>
          {bugCount > 0 && (
            <Button variant={stateFilter === "bug" ? "secondary" : "ghost"} size="sm" className="rounded-lg"
              onClick={() => updateParam("state", "bug")}>Bug <span className="text-ink-soft ml-1 text-xs">{bugCount}</span></Button>
          )}
          {Object.entries(stateMap)
            .filter(([st]) => {
              const lower = st.toLowerCase();
              return lower !== "open" && lower !== "done" && lower !== "bug" && lower !== "all";
            })
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([st, cnt]) => (
            <Button key={st} variant={stateFilter === st.toLowerCase() ? "secondary" : "ghost"} size="sm" className="rounded-lg"
              onClick={() => updateParam("state", st.toLowerCase())}>{st} <span className="text-ink-soft ml-1 text-xs">{cnt}</span></Button>
          ))}
        </div>

        <div className="flex-1 max-md:hidden" />
        <span className="text-[13px] text-ink-muted whitespace-nowrap max-md:self-start">
          {filteredItems.length !== allItems.length || searchQuery || diffFilter
            ? `${filteredItems.length} / ${allItems.length} items` : ""}
        </span>
      </div>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3 max-md:flex-col max-md:items-start max-md:gap-2">
        <StatsRow total={allItems.length} open={incCount} done={compCount} />
        <div className="flex items-center gap-2 flex-wrap">
          {nn > 0 && <Badge variant="outline"
            className={`diff-tag new cursor-pointer hover:brightness-110 select-none ${diffFilter === "new" ? "outline-2 outline-offset-1 outline-success" : ""}`}
            onClick={() => updateParam("diff", diffFilter === "new" ? "" : "new")}>+{nn} New</Badge>}
          {nc > 0 && <Badge variant="outline"
            className={`diff-tag changed cursor-pointer hover:brightness-110 select-none ${diffFilter === "changed" ? "outline-2 outline-offset-1 outline-accent-amber" : ""}`}
            onClick={() => updateParam("diff", diffFilter === "changed" ? "" : "changed")}>~{nc} Changed</Badge>}
          {ng > 0 && <Badge variant="outline"
            className={`diff-tag gone cursor-pointer hover:brightness-110 select-none ${diffFilter === "gone" ? "outline-2 outline-offset-1 outline-error" : ""}`}
            onClick={() => updateParam("diff", diffFilter === "gone" ? "" : "gone")}>-{ng} Gone</Badge>}
        </div>
      </div>

      <div className="table-wrap">
        {filteredItems.length === 0 && !data && !isError ? (
          <div className="text-center py-16 text-ink-muted">Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center py-24 text-ink-muted">
            <div className="text-4xl mb-3 opacity-60">-</div>
            <div className="text-base text-ink-strong font-medium mb-2">No results</div>
            <div className="text-sm max-w-[30ch] text-ink-soft">
              {diffFilter === "gone" ? "No items have disappeared from this sprint."
                : searchQuery ? `No items match "${searchQuery}"` : "No work items in this sprint."}
            </div>
          </div>
        ) : (
          <WorkItemsTable
            items={filteredItems}
            rowType={diffFilter || undefined}
            onRowClick={setSelectedItem}
            stateColors={stateColors}
            showFixColumn
            onTriggerFix={handleTriggerFix}
            onViewFix={handleViewFix}
          />
        )}
      </div>

      <DetailModal item={selectedItem} stateColors={stateColors} onClose={() => setSelectedItem(null)} />
    </div>
  );
}
