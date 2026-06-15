import {
  useReactTable, getCoreRowModel, getSortedRowModel, flexRender,
  type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
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
  selectedBugIds?: Set<number>;
  onBugToggle?: (bugId: number) => void;
  onFixDotClick?: (e: React.MouseEvent, bugId: number) => void;
}

function FixDot({ status }: { status?: string | null }) {
  if (!status) return <span className="inline-block w-2 h-2 rounded-full bg-ink-soft/20 flex-shrink-0" />;
  const map: Record<string, string> = {
    pending: "bg-ink-soft/40",
    running: "bg-accent-amber animate-pulse",
    completed: "bg-success",
    failed: "bg-error",
  };
  const color = map[status] || "bg-ink-soft/20";
  return <span className={`inline-block w-2 h-2 rounded-full ${color} flex-shrink-0`}
    title={`Fix: ${status}`} />;
}

export function WorkItemsTable({
  items, rowType, onRowClick, showDiffColumn, diffType, stateColors,
  showFixColumn, selectedBugIds, onBugToggle, onFixDotClick,
}: WorkItemsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns: ColumnDef<RowType>[] = [];

  // 修复状态列（圆点 + checkbox）
  if (showFixColumn) {
    columns.push({
      id: "fix", header: "", size: 44, enableSorting: false,
      cell: ({ row: tr }) => {
        const it = tr.original;
        const isBug = (it.type || "").toLowerCase() === "bug";
        if (!isBug) return <span className="w-8" />;
        const isSelected = selectedBugIds?.has(it.id) ?? false;
        return (
          <span className="inline-flex items-center gap-2">
            <span onClick={(e) => onFixDotClick?.(e, it.id)}>
              <FixDot status={it._fix_status} />
            </span>
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onBugToggle?.(it.id)}
              onClick={(e) => e.stopPropagation()}
            />
          </span>
        );
      },
    });
  }

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
