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
  density?: "compact" | "standard" | "comfortable";
}

const TYPE_COLORS: Record<string, string> = {
  bug: "#c64545", "user story": "#5db8a6", task: "#e8a55a",
  feature: "#a78bfa", epic: "#f472b6", issue: "#c64545",
};

function getTypeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] || "#6c6a64";
}

function FixButton({ item, onTriggerFix }: { item: WorkItem; onTriggerFix?: (bugId: number) => void }) {
  const isBug = (item.type || "").toLowerCase() === "bug";
  if (!isBug || !onTriggerFix) return null;
  const status = item.fix_status;
  const iconClass = !status
    ? "text-ink-muted/60 hover:text-primary"
    : status === "pending" ? "text-ink-muted/40"
    : status === "running" ? "text-accent-amber animate-pulse"
    : status === "completed" ? "text-success"
    : "text-error";

  const tooltip = !status ? "AI Fix" : status === "completed" ? "View fix" : status === "failed" ? "Retry fix" : `Fix ${status}`;

  return (
    <button
      className="ml-auto shrink-0 p-1 -mr-1 rounded hover:bg-surface-soft transition-colors"
      onClick={(e) => { e.stopPropagation(); onTriggerFix(item.id); }}
      title={tooltip}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    </button>
  );
}

export function KanbanCard({
  item, rowType, stateColors, isSelected, isDimmed, onClick, onTriggerFix,
  density = "comfortable",
}: KanbanCardProps) {
  const sc = getStateColor(item.state, stateColors);
  const typeColor = getTypeColor(item.type || "");
  const prev = item._prev_state;

  // Per-density sizing
  const densityStyles: Record<string, { pad: string; typeSize: string; idSize: string; titleClass: string; metaSize: string; dotSize: string }> = {
    compact:    { pad: "px-2.5 py-2", typeSize: "text-[10px] px-1.5", idSize: "text-[11px]", titleClass: "text-[12px] leading-snug line-clamp-2 mb-1.5", metaSize: "text-[10px]", dotSize: "w-1 h-1" },
    standard:   { pad: "px-3 py-2.5", typeSize: "text-[11px] px-1.5", idSize: "text-[12px]", titleClass: "text-[13px] leading-snug line-clamp-2 mb-1.5", metaSize: "text-[11px]", dotSize: "w-1.5 h-1.5" },
    comfortable:{ pad: "px-3.5 py-3", typeSize: "text-[11px] px-1.5", idSize: "text-[12px]", titleClass: "text-[14px] leading-snug line-clamp-3 mb-2", metaSize: "text-[12px]", dotSize: "w-1.5 h-1.5" },
  };
  const ds = densityStyles[density];

  return (
    <div
      className={`bg-surface-card rounded-[8px] cursor-pointer transition-all select-none border ${ds.pad} ${
        isSelected
          ? "border-primary ring-[3px] ring-primary/15"
          : isDimmed
            ? "opacity-35 border-hairline"
            : "border-hairline hover:border-hairline-soft hover:bg-canvas"
      } ${rowType === "new" ? "shadow-[inset_3px_0_0_0_var(--color-success)]" : ""}${
        rowType === "changed" ? "shadow-[inset_3px_0_0_0_var(--color-accent-amber)]" : ""}${
        rowType === "gone" ? "opacity-55" : ""}`}
      onClick={onClick}
      title={item.title}
    >
      {/* type tag + id + fix button */}
      <div className={`flex items-center ${density === "compact" ? "gap-1 mb-1.5" : "gap-1.5 mb-2"}`}>
        <span className={`font-medium py-px rounded-full uppercase tracking-wider shrink-0 ${ds.typeSize}`}
          style={{ background: `${typeColor}18`, color: typeColor }}>
          {item.type || "?"}
        </span>
        <span className={`text-ink-muted tabular-nums ${ds.idSize}`}>#{item.id}</span>
        {density !== "compact" && <FixButton item={item} onTriggerFix={onTriggerFix} />}
      </div>

      {/* Title */}
      <div className={`text-ink-body ${ds.titleClass}`}>
        {rowType === "new" && <span className="text-success font-medium">+ </span>}
        {rowType === "changed" && <span className="text-accent-amber font-medium">~ </span>}
        {rowType === "gone" && <span className="text-error">- </span>}
        {item.title}
      </div>

      {/* Bottom: state dot + owner + date */}
      <div className={`flex items-center gap-2 text-ink-muted ${ds.metaSize}`}>
        <span className={`inline-block rounded-full shrink-0 ${ds.dotSize}`} style={{ backgroundColor: sc }} />
        <span className="truncate">{item.assignedTo || "Unassigned"}</span>
        {density !== "compact" && item.createdDate && (
          <span className="tabular-nums ml-auto shrink-0">{item.createdDate.slice(0, 10)}</span>
        )}
      </div>

      {/* State transition — hidden in compact */}
      {density !== "compact" && rowType === "changed" && prev && (
        <div className="mt-2 flex items-center gap-1 text-[11px]">
          <span className="line-through text-ink-soft">{prev}</span>
          <span className="text-ink-soft">&rarr;</span>
          <span className="font-medium" style={{ color: sc }}>{item.state}</span>
        </div>
      )}
    </div>
  );
}
