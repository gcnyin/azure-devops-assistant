import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DiffInfo, DiffFilterType } from "@/types/api";

interface BoardFilterBarProps {
  view: "all" | "me";
  onViewChange: (v: "all" | "me") => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  diffInfo: DiffInfo | null;
  diffFilter: DiffFilterType | null;
  onDiffFilterChange: (f: DiffFilterType | null) => void;
  layoutMode: "kanban" | "table";
  onLayoutChange: (m: "kanban" | "table") => void;
  onRefresh: () => void;
  refreshPending: boolean;
  checkedBugCount: number;
  onBulkFix: () => void;
  bulkFixPending: boolean;
}

export function BoardFilterBar({
  view, onViewChange, searchQuery, onSearchChange,
  diffInfo, diffFilter, onDiffFilterChange,
  layoutMode, onLayoutChange, onRefresh, refreshPending,
  checkedBugCount, onBulkFix, bulkFixPending,
}: BoardFilterBarProps) {
  const nn = diffInfo?.new_items?.length || 0;
  const nc = diffInfo?.continuing_items?.filter((it) => it._state_changed).length || 0;
  const ng = diffInfo?.gone_items?.length || 0;

  return (
    <div className="flex items-center gap-2 py-2 flex-wrap">
      {/* View toggle — category-tab style */}
      <div className="flex items-center gap-0.5 bg-surface-card rounded-[8px] p-1">
        <button className={`px-3 py-1.5 text-[14px] font-medium rounded-[6px] transition-colors ${view === "all" ? "bg-canvas text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
          onClick={() => onViewChange("all")}>All</button>
        <button className={`px-3 py-1.5 text-[14px] font-medium rounded-[6px] transition-colors ${view === "me" ? "bg-canvas text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
          onClick={() => onViewChange("me")}>Me</button>
      </div>

      {/* Search */}
      <div className="relative flex-1 min-w-[160px] max-w-[300px]">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <Input className="pl-8 h-8 text-[13px]" placeholder="Filter cards..." value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)} />
      </div>

      {/* Diff badges — pill style */}
      {nn > 0 && (
        <span className={`diff-tag cursor-pointer select-none ${diffFilter === "new" ? "diff-tag active-new" : ""}`}
          onClick={() => onDiffFilterChange(diffFilter === "new" ? null : "new")}>+{nn} New</span>
      )}
      {nc > 0 && (
        <span className={`diff-tag cursor-pointer select-none ${diffFilter === "changed" ? "diff-tag active-changed" : ""}`}
          onClick={() => onDiffFilterChange(diffFilter === "changed" ? null : "changed")}>~{nc} Changed</span>
      )}
      {ng > 0 && (
        <span className={`diff-tag cursor-pointer select-none ${diffFilter === "gone" ? "diff-tag active-gone" : ""}`}
          onClick={() => onDiffFilterChange(diffFilter === "gone" ? null : "gone")}>-{ng} Gone</span>
      )}

      <div className="flex-1" />

      {/* Bulk fix */}
      {checkedBugCount > 0 && (
        <Button variant="default" size="sm" disabled={bulkFixPending} onClick={onBulkFix}>
          {bulkFixPending ? "Fixing..." : `Fix selected (${checkedBugCount})`}
        </Button>
      )}

      {/* Layout toggle */}
      <div className="flex items-center gap-0.5 bg-surface-card rounded-[8px] p-1">
        <button className={`p-1 rounded-[6px] transition-colors ${layoutMode === "kanban" ? "bg-canvas text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
          onClick={() => onLayoutChange("kanban")} title="Kanban view">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="10" rx="1" /></svg>
        </button>
        <button className={`p-1 rounded-[6px] transition-colors ${layoutMode === "table" ? "bg-canvas text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
          onClick={() => onLayoutChange("table")} title="Table view">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
        </button>
      </div>

      {/* Refresh — Coral primary */}
      <Button variant="default" size="sm" disabled={refreshPending} onClick={onRefresh}>
        {refreshPending ? "Refreshing..." : "Refresh"}
      </Button>
    </div>
  );
}
