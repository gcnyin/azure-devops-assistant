import { Button } from "@/components/ui/button";
import type { BoardData, SprintsResponse } from "@/types/api";

interface HeaderProps {
  data?: BoardData;
  sprintsData?: SprintsResponse;
  selectedSprint?: string;
  onSprintChange: (sprint: string) => void;
  onExport: () => void;
}

export function Header({ data, sprintsData, selectedSprint, onSprintChange, onExport }: HeaderProps) {
  return (
    <header className="flex items-center justify-between pb-4 mb-2 border-b border-hairline flex-wrap gap-3 max-md:flex-col max-md:items-stretch max-md:gap-2">
      <div className="flex items-center gap-3 flex-wrap max-md:flex-col max-md:items-start max-md:gap-2">
        <h1 className="text-lg font-medium text-ink whitespace-nowrap">
          {data?.project || "Azure DevOps"}
        </h1>
        {sprintsData && sprintsData.sprints.length > 1 ? (
          <select
            className="text-sm font-medium text-ink bg-canvas-card px-3 py-1 rounded-lg border-none outline-none cursor-pointer appearance-none"
            value={selectedSprint || ""}
            onChange={(e) => onSprintChange(e.target.value)}
          >
            {sprintsData.sprints.map((s) => (
              <option key={s.sprint_name} value={s.sprint_name}>
                {s.sprint_name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm font-medium text-ink bg-canvas-card px-3 py-1 rounded-lg">
            {data?.iteration?.name || "-"}
          </span>
        )}
        <span className="flex items-center gap-3 text-sm text-ink-muted flex-wrap">
          <span>
            {data?.iteration
              ? `${(data.iteration.startDate || "").slice(0, 10)} - ${(data.iteration.finishDate || "").slice(0, 10)}`
              : ""}
          </span>
          <span className="text-hairline select-none">|</span>
          <span>{data?.assigned_to || "-"}</span>
          <span className="text-hairline select-none">|</span>
          <span>{data?.team_name || "-"}</span>
        </span>
        <span className="text-[13px] text-ink-muted">Updated {data?.last_update || "-"}</span>
        {data?.offline && (
          <span className="inline-flex items-center gap-1 bg-error/10 text-error px-2 py-0.5 rounded text-xs font-semibold">
            Offline
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 max-sm:*:flex-1">
        <Button variant="default" onClick={onExport}>Export</Button>
      </div>
    </header>
  );
}
