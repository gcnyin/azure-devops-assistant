import type { WorkItem } from "@/types/api";
import { getStateColor } from "@/lib/state-color";

interface KanbanCardProps {
  item: WorkItem;
  rowType?: "new" | "changed" | "gone";
  stateColors: Record<string, string>;
  isSelected: boolean;
  isDimmed: boolean;
  onClick: () => void;
  onTriggerFix?: (bugId: number) => void;
}

const TYPE_COLORS: Record<string, string> = {
  bug: "#c64545", "user story": "#5db8a6", task: "#e8a55a",
  feature: "#a78bfa", epic: "#f472b6", issue: "#c64545",
};

function getTypeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] || "#6c6a64";
}

function FixDot({ item, onTriggerFix }: { item: WorkItem; onTriggerFix?: (bugId: number) => void }) {
  const isBug = (item.type || "").toLowerCase() === "bug";
  if (!isBug || !onTriggerFix) return null;
  const status = item.fix_status;
  const dotClass = !status
    ? "border border-dashed border-ink-muted/40 bg-transparent"
    : status === "pending" ? "bg-ink-muted/40"
    : status === "running" ? "bg-accent-amber animate-pulse"
    : status === "completed" ? "bg-success"
    : "bg-error";

  return (
    <button
      className="ml-auto shrink-0 p-1 -mr-1 rounded hover:bg-surface-soft transition-colors"
      onClick={(e) => { e.stopPropagation(); onTriggerFix(item.id); }}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} />
    </button>
  );
}

export function KanbanCard({ item, rowType, stateColors, isSelected, isDimmed, onClick, onTriggerFix }: KanbanCardProps) {
  const sc = getStateColor(item.state, stateColors);
  const typeColor = getTypeColor(item.type || "");
  const prev = item._prev_state;

  return (
    <div
      className={`bg-surface-card rounded-[12px] px-3.5 py-3 cursor-pointer transition-all select-none border ${
        isSelected
          ? "border-primary ring-[3px] ring-primary/15"
          : isDimmed
            ? "opacity-35 border-hairline"
            : "border-hairline hover:border-hairline-soft hover:bg-canvas"
      } ${rowType === "new" ? "shadow-[inset_3px_0_0_0_var(--color-success)]" : ""}${
        rowType === "changed" ? "shadow-[inset_3px_0_0_0_var(--color-accent-amber)]" : ""}${
        rowType === "gone" ? "opacity-55" : ""}`}
      onClick={onClick}
    >
      {/* type tag + id + fix dot */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[11px] font-medium px-1.5 py-px rounded-full uppercase tracking-wider shrink-0"
          style={{ background: `${typeColor}18`, color: typeColor }}>
          {item.type || "?"}
        </span>
        <span className="text-[12px] text-ink-muted tabular-nums">#{item.id}</span>
        <FixDot item={item} onTriggerFix={onTriggerFix} />
      </div>

      {/* Title */}
      <div className="text-[14px] text-ink-body leading-snug line-clamp-3 mb-2">
        {rowType === "new" && <span className="text-success font-medium">+ </span>}
        {rowType === "changed" && <span className="text-accent-amber font-medium">~ </span>}
        {rowType === "gone" && <span className="text-error">- </span>}
        {item.title}
      </div>

      {/* Bottom: state dot + owner + date */}
      <div className="flex items-center gap-2 text-[12px] text-ink-muted">
        <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: sc }} />
        <span className="truncate">{item.assignedTo || "Unassigned"}</span>
        {item.createdDate && (
          <span className="tabular-nums ml-auto shrink-0">{item.createdDate.slice(0, 10)}</span>
        )}
      </div>

      {rowType === "changed" && prev && (
        <div className="mt-2 flex items-center gap-1 text-[11px]">
          <span className="line-through text-ink-soft">{prev}</span>
          <span className="text-ink-soft">&rarr;</span>
          <span className="font-medium" style={{ color: sc }}>{item.state}</span>
        </div>
      )}
    </div>
  );
}
