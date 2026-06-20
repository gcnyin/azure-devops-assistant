import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterDropdown } from "@/components/FilterDropdown";
import type { DiffInfo, DiffFilterType } from "@/types/api";
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
  totalCount: number;
  openCount: number;
  doneCount: number;
}

export function BoardFilterBar({
  searchQuery, onSearchChange,
  availableTypes, typeFilter, onTypeFilterChange,
  availableAssignees, currentUser,
  assigneeFilter, onAssigneeFilterChange,
  diffInfo, diffFilter, onDiffFilterChange,
  layoutMode, onLayoutChange, onExport, onRefresh, refreshPending,
  checkedBugCount, onBulkFix, bulkFixPending,
  totalCount, openCount, doneCount,
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

  return (
    <div className="space-y-2 pb-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search — full width on small screens */}
        <div className="relative flex-1 min-w-[160px] sm:max-w-[320px]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <Input ref={inputRef} className="pl-8 pr-8 h-8 text-[13px]" placeholder="Search by title, ID, or keyword..." value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)} onKeyDown={handleSearchKeyDown} />
          {localSearch && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink p-0.5 rounded"
              onClick={handleSearchClear}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
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
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                <path d="M4 7h16M4 12h16M4 17h10" />
              </svg>
            }
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
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            }
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

        {/* Spacer — hidden on small screens */}
        <div className="flex-1 hidden sm:block" />

        {/* Stats */}
        <div className="flex items-center gap-2 sm:gap-3 text-[12px] sm:text-[13px] tabular-nums shrink-0">
          <span><span className="font-medium text-ink">{totalCount}</span> <span className="text-ink-muted">Total</span></span>
          <span><span className="font-medium text-accent-amber">{openCount}</span> <span className="text-ink-muted">Open</span></span>
          <span><span className="font-medium text-success">{doneCount}</span> <span className="text-ink-muted">Done</span></span>
        </div>

        {/* Layout toggle — icon-only on small screens */}
        <div className="flex items-center gap-0.5 bg-surface-card rounded-[8px] p-1 shrink-0">
          <button className={`p-1 rounded-[6px] transition-colors flex items-center gap-1 px-1.5 sm:px-2 ${layoutMode === "kanban" ? "bg-canvas text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
            onClick={() => onLayoutChange("kanban")} title="Kanban view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="10" rx="1" /></svg>
            <span className="text-[12px] font-medium hidden sm:inline">看板</span>
          </button>
          <button className={`p-1 rounded-[6px] transition-colors flex items-center gap-1 px-1.5 sm:px-2 ${layoutMode === "table" ? "bg-canvas text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
            onClick={() => onLayoutChange("table")} title="Table view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
            <span className="text-[12px] font-medium hidden sm:inline">表格</span>
          </button>
        </div>

        {/* Export */}
        <Button variant="default" size="sm" onClick={onExport} title="Export CSV" className="shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </Button>

        {/* Refresh */}
        <Button variant="default" size="sm" disabled={refreshPending} onClick={onRefresh} title="Refresh" className="shrink-0">
          {refreshPending ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          )}
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
