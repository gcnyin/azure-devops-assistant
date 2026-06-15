import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getStateColor } from "@/lib/state-color";
import type { WorkItem } from "@/types/api";

interface DetailModalProps { item: WorkItem | null; stateColors: Record<string, string>; onClose: () => void; }

export function DetailModal({ item, stateColors, onClose }: DetailModalProps) {
  if (!item) return null;
  const sc = getStateColor(item.state, stateColors);
  const prev = item._prev_state;
  const url = item.htmlUrl || `https://dev.azure.com/_workitems/edit/${item.id}`;

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[680px]">
        <DialogHeader><DialogTitle>{item.title}</DialogTitle></DialogHeader>
        <div className="flex gap-3 mb-6 flex-wrap text-sm text-ink-muted">
          <span>#{item.id}</span><span>{item.type}</span>
          <span className="state-badge" style={{ background: `${sc}24`, color: sc }}>{item.state}</span>
          <span>{item.assignedTo || "Unassigned"}</span>
        </div>
        {prev && (
          <div className="mb-4">
            <span className="state-badge line-through" style={{ background: `${getStateColor(prev, stateColors)}24`, color: getStateColor(prev, stateColors) }}>{prev}</span>
            <span className="mx-2 text-ink-muted">&rarr;</span>
            <span className="state-badge font-bold" style={{ background: `${sc}24`, color: sc }}>{item.state}</span>
          </div>
        )}
        {item.description ? (
          <div className="relative bg-canvas-soft border border-hairline rounded-lg mb-6">
            <div className="whitespace-pre-wrap leading-relaxed text-ink-body text-sm p-6 max-h-[300px] overflow-y-auto">
              {item.description}
            </div>
            <button
              className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-canvas border border-hairline text-ink-muted hover:text-ink hover:border-hairline-soft transition-colors text-xs"
              title="Copy description"
              onClick={async () => {
                await navigator.clipboard.writeText(item.description);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </button>
          </div>
        ) : <div className="text-ink-soft italic mb-6">No description available</div>}
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline text-base">Open in Azure DevOps</a>
      </DialogContent>
    </Dialog>
  );
}
