import { Search, X, List, User, Columns2, Table, Download, RefreshCw, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterDropdown } from "@/components/FilterDropdown";
import type { DiffInfo, DiffFilterType, KanbanSortKey } from "@/types/api";
import { KANBAN_SORT_OPTIONS } from "@/types/api";
import { useState, useEffect, useRef } from "react";

interface BoardFilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  availableTypes: { type: string; count: number }[];
  typeFilter: string | null;
  onTypeFilterChange: (t: string | null) => void;
  availableAssignees: { name: string; count: number }[];
  currentUser: string;
  assigneeFilter: string | null;
  onAssigneeFilterChange: (a: string | null) => void;
  diffInfo: DiffInfo | null;
  diffFilter: DiffFilterType | null;
  onDiffFilterChange: (f: DiffFilterType | null) => void;
  layoutMode: "kanban" | "table";
  onLayoutChange: (m: "kanban" | "table") => void;
  onExport: () => void;
  onRefresh: () => void;
  refreshPending: boolean;
  checkedBugCount: number;
  onBulkFix: () => void;
  bulkFixPending: boolean;
  stateFilter: string;
  onStateFilterChange: (f: string | null) => void;
  totalCount: number;
  openCount: number;
  doneCount: number;
  sortKey: KanbanSortKey;
  onSortChange: (key: KanbanSortKey | null) => void;
}

export function BoardFilterBar({
  searchQuery, onSearchChange,
  availableTypes, typeFilter, onTypeFilterChange,
  availableAssignees, currentUser,
  assigneeFilter, onAssigneeFilterChange,
  diffInfo, diffFilter, onDiffFilterChange,
  layoutMode, onLayoutChange, onExport, onRefresh, refreshPending,
  checkedBugCount, onBulkFix, bulkFixPending,
  stateFilter, onStateFilterChange,
  totalCount, openCount, doneCount,
  sortKey, onSortChange,
}: BoardFilterBarProps) {
  // ── Debounced search ──
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearchChange(value), 300);
  };

  const handleSearchClear = () => {
    setLocalSearch("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSearchChange("");
    inputRef.current?.focus();
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (localSearch) {
        handleSearchClear();
      } else {
        inputRef.current?.blur();
      }
    }
  };

  const nn = diffInfo?.new_items?.length || 0;
  const nc = diffInfo?.continuing_items?.filter((it) => it._state_changed).length || 0;
  const ng = diffInfo?.gone_items?.length || 0;

  // ── Type dropdown items ──
  const typeItems = availableTypes.map((t) => ({ key: t.type.toLowerCase(), label: t.type, count: t.count }));
  const assigneeItems = availableAssignees.map((a) => ({ key: a.name.toLowerCase(), label: a.name, count: a.count }));
  const sortItems = KANBAN_SORT_OPTIONS.map((opt) => ({ key: opt.key, label: opt.label }));

  return (
    <div className="space-y-2 pb-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search — full width on small screens */}
        <div className="relative flex-1 min-w-[160px] sm:max-w-[320px]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none">
            <Search size={14} />
          </span>
          <Input ref={inputRef} className="pl-8 pr-8 h-8 text-[13px]" placeholder="Search by title, ID, or keyword..." value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)} onKeyDown={handleSearchKeyDown} />
          {localSearch && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink p-0.5 rounded"
              onClick={handleSearchClear}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Type dropdown */}
        {availableTypes.length > 0 && (
          <FilterDropdown
            items={typeItems}
            selected={typeFilter?.toLowerCase() || null}
            onSelect={(k) => onTypeFilterChange(k)}
            placeholder="Type"
            icon={<List size={12} className="opacity-60" />}
          />
        )}

        {/* Assignee dropdown */}
        {availableAssignees.length > 0 && (
          <FilterDropdown
            items={assigneeItems}
            selected={assigneeFilter?.toLowerCase() || null}
            onSelect={(k) => onAssigneeFilterChange(k)}
            placeholder="Assigned"
            highlightKey={currentUser?.toLowerCase() || null}
            highlightTag="Me"
            icon={<User size={12} className="opacity-60" />}
          />
        )}

        {/* Diff badges */}
        {(nn > 0 || nc > 0 || ng > 0) && (
          <>
            <span className="text-hairline select-none mx-0.5">|</span>
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
          </>
        )}

        {/* Sort dropdown */}
        <FilterDropdown
          items={sortItems}
          selected={sortKey}
          onSelect={(k) => onSortChange(k as KanbanSortKey | null)}
          placeholder="Sort"
          icon={<ArrowUpDown size={12} className="opacity-60" />}
        />

        {/* Spacer — hidden on small screens */}
        <div className="flex-1 hidden sm:block" />

        {/* Stats */}
        <div className="flex items-center gap-2 sm:gap-3 text-[12px] sm:text-[13px] tabular-nums shrink-0">
          <span><span className="font-medium text-ink">{totalCount}</span> <span className="text-ink-muted">Total</span></span>
          <span className={`cursor-pointer select-none${stateFilter === "open" ? " ring-1 ring-accent-amber/40 rounded px-1 -mx-1" : ""}`}
            onClick={() => onStateFilterChange(stateFilter === "open" ? null : "open")}>
            <span className="font-medium text-accent-amber">{openCount}</span> <span className="text-ink-muted">Open</span>
          </span>
          <span className={`cursor-pointer select-none${stateFilter === "done" ? " ring-1 ring-success/40 rounded px-1 -mx-1" : ""}`}
            onClick={() => onStateFilterChange(stateFilter === "done" ? null : "done")}>
            <span className="font-medium text-success">{doneCount}</span> <span className="text-ink-muted">Done</span>
          </span>
        </div>

        {/* Layout toggle — icon-only on small screens */}
        <div className="flex items-center gap-0.5 bg-surface-card rounded-[8px] p-1 shrink-0">
          <button className={`p-1 rounded-[6px] transition-colors flex items-center gap-1 px-1.5 sm:px-2 ${layoutMode === "kanban" ? "bg-canvas text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
            onClick={() => onLayoutChange("kanban")} title="Kanban view">
            <Columns2 size={14} />
            <span className="text-[12px] font-medium hidden sm:inline">看板</span>
          </button>
          <button className={`p-1 rounded-[6px] transition-colors flex items-center gap-1 px-1.5 sm:px-2 ${layoutMode === "table" ? "bg-canvas text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
            onClick={() => onLayoutChange("table")} title="Table view">
            <Table size={14} />
            <span className="text-[12px] font-medium hidden sm:inline">表格</span>
          </button>
        </div>

        {/* Export */}
        <Button variant="default" size="sm" onClick={onExport} title="Export CSV" className="shrink-0">
          <Download size={14} />
        </Button>

        {/* Refresh */}
        <Button variant="default" size="sm" disabled={refreshPending} onClick={onRefresh} title="Refresh" className="shrink-0">
          <RefreshCw size={14} className={refreshPending ? "animate-spin" : ""} />
        </Button>

        {/* Bulk fix */}
        {checkedBugCount > 0 && (
          <Button variant="default" size="sm" disabled={bulkFixPending} onClick={onBulkFix} className="shrink-0">
            {bulkFixPending ? "Fixing..." : `Fix selected (${checkedBugCount})`}
          </Button>
        )}
      </div>
    </div>
  );
}
