import { useCallback, useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkItemsTable } from "@/components/WorkItemsTable";
import { DetailModal } from "@/components/DetailModal";
import { ErrorBanner } from "@/components/ErrorBanner";
import { StatsRow } from "@/components/StatsRow";
import { useFixesMutation } from "@/hooks/useApi";
import { useFilteredItems } from "@/hooks/useFilteredItems";
import type { BoardData, WorkItem, DiffFilterType } from "@/types/api";

interface BoardViewProps {
  data?: BoardData;
  incompleteStates: string[];
  stateColors: Record<string, string>;
}

export function BoardView({ data, incompleteStates, stateColors }: BoardViewProps) {
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
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [searchText, setSearchText] = useState(searchQuery);

  useEffect(() => { if (fixesMutation.isSuccess) navigate("/fixes"); }, [fixesMutation.isSuccess, navigate]);

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

  const nn = diff?.new_items?.length || 0;
  const nc = diff?.continuing_items?.filter((it) => it._state_changed).length || 0;
  const ng = diff?.gone_items?.length || 0;
  const newBugs = diff?.new_items?.filter((it) => (it.type || "").toLowerCase() === "bug") || [];

  const stateMap: Record<string, number> = {};
  for (const it of allItems) stateMap[it.state] = (stateMap[it.state] || 0) + 1;
  let bugCount = 0;
  for (const it of allItems) { if ((it.type || "").toLowerCase() === "bug") bugCount++; }

  return (
    <div>
      {data?.error && <ErrorBanner message={data.error} />}

      <div className="flex items-center gap-1 mb-6">
        <span className="text-sm text-ink-muted mr-1">View:</span>
        <Button variant={view === "all" ? "secondary" : "ghost"} size="sm" className="rounded-lg"
          onClick={() => setView("all")}>All</Button>
        <Button variant={view === "me" ? "secondary" : "ghost"} size="sm" className="rounded-lg"
          onClick={() => setView("me")}>Me</Button>
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
          {Object.entries(stateMap).sort(([a], [b]) => a.localeCompare(b)).map(([st, cnt]) => (
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
          {newBugs.length > 0 && (
            <Button variant="secondary" size="sm"
              onClick={() => fixesMutation.mutate()} disabled={fixesMutation.isPending}>
              {fixesMutation.isPending ? "Generating..." : `Generate AI Fixes (${newBugs.length} new bugs)`}</Button>
          )}
        </div>
      </div>

      <div className="table-wrap">
        {filteredItems.length === 0 && !data ? (
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
          <WorkItemsTable items={filteredItems} rowType={diffFilter || undefined}
            onRowClick={setSelectedItem} stateColors={stateColors} />
        )}
      </div>

      <DetailModal item={selectedItem} stateColors={stateColors} onClose={() => setSelectedItem(null)} />
    </div>
  );
}
