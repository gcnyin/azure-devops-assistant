import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
}

export function WorkItemsTable({
  items, rowType, onRowClick, showDiffColumn, diffType, stateColors,
}: WorkItemsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns: ColumnDef<RowType>[] = [
    {
      id: "index", header: "#", size: 42,
      cell: ({ row }) => <span className="text-ink-faint">{row.index + 1}</span>,
      enableSorting: false,
    },
    {
      id: "id", header: "ID", size: 56,
      accessorFn: (row) => row.id,
      cell: ({ getValue }) => (
        <span className="text-ink font-medium tabular-nums">{String(getValue())}</span>
      ),
    },
    {
      id: "title", header: "Title",
      accessorFn: (row) => row.title,
      cell: ({ row: tableRow }) => {
        const item = tableRow.original;
        let prefix = "", titleClass = "";
        if (rowType === "new") { prefix = "+ "; titleClass = "text-primary-deep font-medium"; }
        else if (rowType === "changed") { prefix = "~ "; titleClass = "text-amber-600 font-medium"; }
        else if (rowType === "gone") { prefix = "- "; titleClass = "text-accent-tomato"; }
        return <span className={titleClass}>{prefix}{item.title}</span>;
      },
    },
    {
      id: "type", header: "Type", size: 72,
      accessorFn: (row) => row.type,
      cell: ({ getValue }) => <span className="text-ink-secondary">{String(getValue())}</span>,
    },
    {
      id: "state", header: "State", size: 120,
      accessorFn: (row) => row.state,
      cell: ({ row: tableRow }) => {
        const item = tableRow.original;
        const prev = item._prev_state;
        if (rowType === "changed" && prev) {
          const prevColor = getStateColor(prev, stateColors);
          const curColor = getStateColor(item.state, stateColors);
          return (
            <span className="inline-flex items-center gap-1">
              <span className="state-badge line-through" style={{ background: `${prevColor}24`, color: prevColor }}>{prev}</span>
              <span className="text-ink-faint text-xs">&rarr;</span>
              <span className="state-badge font-bold" style={{ background: `${curColor}24`, color: curColor }}>{item.state}</span>
            </span>
          );
        }
        const color = getStateColor(item.state, stateColors);
        return <span className="state-badge" style={{ background: `${color}24`, color: color }}>{item.state}</span>;
      },
    },
    {
      id: "assignedTo", header: "Owner", size: 96,
      accessorFn: (row) => row.assignedTo || "Unassigned",
      cell: ({ getValue }) => <span className="text-ink-secondary font-medium">{String(getValue())}</span>,
    },
  ];

  if (showDiffColumn) {
    columns.push({
      id: "change", header: "Change", size: 76,
      cell: () => {
        if (diffType === "new") return <span className="diff-tag new">New</span>;
        if (diffType === "changed") return <span className="diff-tag changed">Changed</span>;
        if (diffType === "gone") return <span className="diff-tag gone">Gone</span>;
        return null;
      },
      enableSorting: false,
    });
  }

  const table = useReactTable({
    data: items as RowType[],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (items.length === 0) return null;

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id} className="hover:bg-transparent cursor-default">
            {hg.headers.map((header) => (
              <TableHead key={header.id} style={{ width: header.getSize() }}
                className="cursor-pointer select-none"
                onClick={header.column.getToggleSortingHandler()}>
                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                {header.column.getIsSorted() === "asc" ? " \u2191"
                  : header.column.getIsSorted() === "desc" ? " \u2193" : ""}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => {
          let rowClass = "";
          if (rowType === "new") rowClass = "row-new";
          else if (rowType === "changed") rowClass = "row-changed";
          else if (rowType === "gone") rowClass = "row-gone";
          return (
            <TableRow key={row.id} className={rowClass}
              onClick={() => onRowClick?.(row.original)}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
