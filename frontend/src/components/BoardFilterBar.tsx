import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

  const handleSearchChange = useCallback((value: string) => {
    onSearchChange(value);
  }, [onSearchChange]);

  return (
    <div className="flex items-center gap-2 py-2 flex-wrap">
      {/* View toggle */}
      <div className="flex items-center gap-0.5 bg-canvas-card border border-hairline rounded-lg p-0.5">
        <button
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            view === "all" ? "bg-primary text-primary-foreground" : "text-ink-muted hover:text-ink"
          }`}
          onClick={() => onViewChange("all")}
        >
          All
        </button>
        <button
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            view === "me" ? "bg-primary text-primary-foreground" : "text-ink-muted hover:text-ink"
          }`}
          onClick={() => onViewChange("me")}
        >
          Me
        </button>
      </div>

      {/* Search */}
      <div className="relative flex-1 min-w-[160px] max-w-[300px]">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-soft pointer-events-none">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <Input
          className="pl-8 h-8 text-xs"
          placeholder="Filter cards..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </div>

      {/* Diff badges */}
      {nn > 0 && (
        <Badge
          variant="outline"
          className={`diff-tag new cursor-pointer hover:brightness-110 select-none text-[11px] ${
            diffFilter === "new" ? "outline-2 outline-offset-1 outline-success" : ""
          }`}
          onClick={() => onDiffFilterChange(diffFilter === "new" ? null : "new")}
        >
          +{nn} New
        </Badge>
      )}
      {nc > 0 && (
        <Badge
          variant="outline"
          className={`diff-tag changed cursor-pointer hover:brightness-110 select-none text-[11px] ${
            diffFilter === "changed" ? "outline-2 outline-offset-1 outline-accent-amber" : ""
          }`}
          onClick={() => onDiffFilterChange(diffFilter === "changed" ? null : "changed")}
        >
          ~{nc} Changed
        </Badge>
      )}
      {ng > 0 && (
        <Badge
          variant="outline"
          className={`diff-tag gone cursor-pointer hover:brightness-110 select-none text-[11px] ${
            diffFilter === "gone" ? "outline-2 outline-offset-1 outline-error" : ""
          }`}
          onClick={() => onDiffFilterChange(diffFilter === "gone" ? null : "gone")}
        >
          -{ng} Gone
        </Badge>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bulk fix */}
      {checkedBugCount > 0 && (
        <Button
          variant="secondary"
          size="sm"
          className="text-xs h-7"
          disabled={bulkFixPending}
          onClick={onBulkFix}
        >
          {bulkFixPending ? "Fixing..." : `Fix selected (${checkedBugCount})`}
        </Button>
      )}

      {/* Layout toggle */}
      <div className="flex items-center gap-0.5 bg-canvas-card border border-hairline rounded-lg p-0.5">
        <button
          className={`p-1 rounded-md transition-colors ${
            layoutMode === "kanban" ? "bg-primary text-primary-foreground" : "text-ink-muted hover:text-ink"
          }`}
          onClick={() => onLayoutChange("kanban")}
          title="Kanban view"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="18" rx="1" />
            <rect x="14" y="3" width="7" height="10" rx="1" />
          </svg>
        </button>
        <button
          className={`p-1 rounded-md transition-colors ${
            layoutMode === "table" ? "bg-primary text-primary-foreground" : "text-ink-muted hover:text-ink"
          }`}
          onClick={() => onLayoutChange("table")}
          title="Table view"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
      </div>

      {/* Refresh */}
      <Button
        variant="ghost"
        size="sm"
        className="text-xs h-7"
        disabled={refreshPending}
        onClick={onRefresh}
      >
        {refreshPending ? "Refreshing..." : "Refresh"}
      </Button>
    </div>
  );
}
