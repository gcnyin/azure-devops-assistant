import {
  useReactTable, getCoreRowModel, getSortedRowModel, flexRender,
  type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { getStateColor } from "@/lib/state-color";
import type { WorkItem, DiffFilterType } from "@/types/api";

type RowType = WorkItem & { _rowType?: DiffFilterType; _prevState?: string };

interface WorkItemsTableProps {
  items: WorkItem[];
  rowType?: DiffFilterType;
  onRowClick?: (item: WorkItem) => void;
  showDiffColumn?: boolean;
  diffType?: DiffFilterType;
  stateColors: Record<string, string>;
  showFixColumn?: boolean;
  onTriggerFix?: (bugId: number) => void;
  onViewFix?: (bugId: number) => void;
  checkedBugIds?: Set<number>;
  onToggleBugCheck?: (bugId: number) => void;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function elapsed(start: string | null | undefined, now: number): number {
  if (!start) return 0;
  const t = new Date(start.replace(" ", "T") + "Z").getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 1000));
}

function StatusDot({ className }: { className: string }) {
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${className}`} />;
}

function ClickableFix({ status, item, onTriggerFix, onViewFix }: {
  status: string | null | undefined;
  item: WorkItem;
  onTriggerFix?: (bugId: number) => void;
  onViewFix?: (bugId: number) => void;
}) {
  const isClickable = !status || status === "completed" || status === "failed";
  const Component = isClickable ? "button" : "span";
  const props: any = { className: "inline-flex items-center gap-1.5 text-[13px] group" };

  if (isClickable) {
    props.type = "button";
    props.onClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!status) onTriggerFix?.(item.id);
      else if (status === "completed") onViewFix?.(item.id);
      else if (status === "failed") onTriggerFix?.(item.id);
    };
  }

  const dotClass = !status
    ? "border border-dashed border-ink-soft/50 bg-transparent"
    : status === "pending"
      ? "bg-ink-soft/40"
      : status === "running"
        ? "bg-accent-amber animate-pulse w-2.5 h-2.5"
        : status === "completed"
          ? "bg-success"
          : "bg-error";

  const linkClass = "text-[13px] underline-offset-2 group-hover:underline cursor-pointer";

  if (!status) {
    return (
      <Component {...props}>
        <StatusDot className={dotClass} />
        <span className={linkClass}>Fix</span>
      </Component>
    );
  }

  if (status === "pending") {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
      const timer = setInterval(() => setNow(Date.now()), 60000);
      return () => clearInterval(timer);
    }, []);
    const sec = elapsed(item.fix_created_at, now);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Component {...props}>
            <StatusDot className={dotClass} />
            <span className="text-ink-soft text-[13px]">Waiting...</span>
          </Component>
        </TooltipTrigger>
        <TooltipContent>Queued for {formatDuration(sec)}</TooltipContent>
      </Tooltip>
    );
  }

  if (status === "running") {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
      const timer = setInterval(() => setNow(Date.now()), 60000);
      return () => clearInterval(timer);
    }, []);
    const sec = elapsed(item.fix_started_at, now);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Component {...props}>
            <StatusDot className={dotClass} />
            <span className="text-ink-soft text-[13px]">AI working...</span>
          </Component>
        </TooltipTrigger>
        <TooltipContent>AI working for {formatDuration(sec)}</TooltipContent>
      </Tooltip>
    );
  }

  if (status === "completed") {
    return (
      <Component {...props}>
        <StatusDot className={dotClass} />
        <span className={linkClass}>View fix</span>
      </Component>
    );
  }

  if (status === "failed") {
    return (
      <Component {...props}>
        <StatusDot className={dotClass} />
        <span className={linkClass}>Retry fix</span>
      </Component>
    );
  }

  return null;
}

function FixCell({ item, onTriggerFix, onViewFix }: {
  item: WorkItem;
  onTriggerFix?: (bugId: number) => void;
  onViewFix?: (bugId: number) => void;
}) {
  const isBug = (item.type || "").toLowerCase() === "bug";
  if (!isBug) return null;

  return (
    <TooltipProvider>
      <ClickableFix
        status={item.fix_status}
        item={item}
        onTriggerFix={onTriggerFix}
        onViewFix={onViewFix}
      />
    </TooltipProvider>
  );
}

export function WorkItemsTable({
  items, rowType, onRowClick, showDiffColumn, diffType, stateColors,
  showFixColumn, onTriggerFix, onViewFix,
  checkedBugIds, onToggleBugCheck,
}: WorkItemsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns: ColumnDef<RowType>[] = [];

  columns.push(
    { id: "id", header: "ID", size: 68, accessorFn: (r) => r.id,
      cell: ({ getValue }) => <span className="text-ink font-medium tabular-nums">{String(getValue())}</span> },
    { id: "title", header: "Title", accessorFn: (r) => r.title,
      cell: ({ row: tr }) => {
        const it = tr.original; let p = "", c = "";
        if (rowType === "new") { p = "+ "; c = "text-success font-medium"; }
        else if (rowType === "changed") { p = "~ "; c = "text-accent-amber font-medium"; }
        else if (rowType === "gone") { p = "- "; c = "text-error"; }
        return <span className={c}>{p}{it.title}</span>;
      }},
    { id: "type", header: "Type", size: 72, accessorFn: (r) => r.type,
      cell: ({ getValue }) => <span className="text-ink-body">{String(getValue())}</span> },
    { id: "state", header: "State", size: 120, accessorFn: (r) => r.state,
      cell: ({ row: tr }) => {
        const it = tr.original; const prev = it._prev_state;
        if (rowType === "changed" && prev) {
          const pc = getStateColor(prev, stateColors); const cc = getStateColor(it.state, stateColors);
          return <span className="inline-flex items-center gap-1">
            <span className="state-badge line-through" style={{ background: `${pc}24`, color: pc }}>{prev}</span>
            <span className="text-ink-soft text-xs">&rarr;</span>
            <span className="state-badge font-bold" style={{ background: `${cc}24`, color: cc }}>{it.state}</span>
          </span>;
        }
        const c = getStateColor(it.state, stateColors);
        return <span className="state-badge" style={{ background: `${c}24`, color: c }}>{it.state}</span>;
      }},
    { id: "assignedTo", header: "Owner", size: 96, accessorFn: (r) => r.assignedTo || "Unassigned",
      cell: ({ getValue }) => <span className="text-ink-body font-medium">{String(getValue())}</span> },
    { id: "createdDate", header: "Created", size: 88, accessorFn: (r) => r.createdDate || "",
      cell: ({ getValue }) => {
        const v = String(getValue());
        return <span className="text-ink-soft tabular-nums">{v ? v.slice(0, 10) : "-"}</span>;
      }},
  );

  if (showDiffColumn) {
    columns.push({ id: "change", header: "Change", size: 76,
      cell: () => {
        if (diffType === "new") return <span className="diff-tag new">New</span>;
        if (diffType === "changed") return <span className="diff-tag changed">Changed</span>;
        if (diffType === "gone") return <span className="diff-tag gone">Gone</span>;
        return null;
      }, enableSorting: false,
    });
  }

  if (showFixColumn) {
    columns.unshift({
      id: "select", header: "", size: 40, enableSorting: false,
      cell: ({ row: tr }) => {
        const it = tr.original;
        const isBug = (it.type || "").toLowerCase() === "bug";
        if (!isBug) return null;
        return (
          <input
            type="checkbox"
            className="cursor-pointer w-4 h-4"
            checked={checkedBugIds?.has(it.id) ?? false}
            onChange={(e) => {
              e.stopPropagation();
              onToggleBugCheck?.(it.id);
            }}
          />
        );
      },
    });
    columns.push({
      id: "fix", header: "AI Fix", size: 100, minSize: 110, enableSorting: false,
      cell: ({ row: tr }) => (
        <FixCell item={tr.original} onTriggerFix={onTriggerFix} onViewFix={onViewFix} />
      ),
    });
  }

  const table = useReactTable({
    data: items as RowType[], columns, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  if (items.length === 0) return null;

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id} className="hover:bg-transparent cursor-default">
            {hg.headers.map((h) => (
              <TableHead key={h.id} style={{ width: h.getSize() }}
                className={h.column.getCanSort() ? "cursor-pointer select-none" : ""}
                onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}>
                {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                {h.column.getIsSorted() === "asc" ? " \u2191" : h.column.getIsSorted() === "desc" ? " \u2193" : ""}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => {
          let rc = "";
          if (rowType === "new") rc = "row-new"; else if (rowType === "changed") rc = "row-changed"; else if (rowType === "gone") rc = "row-gone";
          return (
            <TableRow key={row.id} className={rc} onClick={() => onRowClick?.(row.original)}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
