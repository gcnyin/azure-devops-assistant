import type { BoardData } from "@/types/api";

interface HeaderProps { data?: BoardData; }

export function Header({ data }: HeaderProps) {
  return (
    <header className="flex items-center h-12 px-4 border-b border-hairline bg-canvas shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-[14px] font-medium text-ink-strong truncate">{data?.project || "Azure DevOps"}</h1>
        <span className="text-hairline select-none">|</span>
        <span className="text-[13px] text-ink-muted truncate">{data?.iteration?.name || "-"}</span>
        <span className="text-hairline select-none">|</span>
        <span className="text-[13px] text-ink-muted truncate">{data?.assigned_to || "-"}</span>
        <span className="text-hairline select-none">|</span>
        <span className="text-[13px] text-ink-muted truncate">{data?.team_name || "-"}</span>
        <span className="text-[12px] text-ink-soft truncate hidden sm:inline">Updated {data?.last_update || "-"}</span>
        {data?.offline && (
          <span className="inline-flex items-center gap-1 bg-error/10 text-error px-1.5 py-px rounded-full text-[11px] font-medium">Offline</span>
        )}
      </div>
    </header>
  );
}
