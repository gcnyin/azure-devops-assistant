import { Button } from "@/components/ui/button";
import type { BoardData } from "@/types/api";

interface HeaderProps {
  data?: BoardData;
  onExport: () => void;
}

export function Header({ data, onExport }: HeaderProps) {
  return (
    <header className="flex items-center justify-between h-12 px-4 border-b border-hairline bg-canvas shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-sm font-semibold text-ink-strong truncate">
          {data?.project || "Azure DevOps"}
        </h1>
        <span className="text-hairline-soft select-none">|</span>
        <span className="text-xs text-ink-muted truncate">{data?.assigned_to || "-"}</span>
        <span className="text-hairline-soft select-none">|</span>
        <span className="text-xs text-ink-muted truncate">{data?.team_name || "-"}</span>
        <span className="text-[11px] text-ink-soft truncate hidden sm:inline">
          Updated {data?.last_update || "-"}
        </span>
        {data?.offline && (
          <span className="inline-flex items-center gap-1 bg-error/10 text-error px-1.5 py-px rounded text-[10px] font-semibold">
            Offline
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onExport}>
          Export
        </Button>
      </div>
    </header>
  );
}
