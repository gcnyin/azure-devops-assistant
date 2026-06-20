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
      <DialogContent>
        <DialogHeader><DialogTitle>{item.title}</DialogTitle></DialogHeader>
        <div className="flex gap-3 mb-6 flex-wrap text-[13px] text-ink-muted">
          <span>#{item.id}</span><span>{item.type}</span>
          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: `${sc}18`, color: sc }}>{item.state}</span>
          <span>{item.assignedTo || "Unassigned"}</span>
        </div>
        {prev && (
          <div className="mb-4">
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium line-through" style={{ background: `${getStateColor(prev,stateColors)}18`, color: getStateColor(prev,stateColors) }}>{prev}</span>
            <span className="mx-2 text-ink-muted">&rarr;</span>
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: `${sc}18`, color: sc }}>{item.state}</span>
          </div>
        )}
        {item.description ? (
          <div className="relative bg-surface-card rounded-[12px] mb-6">
            <div className="whitespace-pre-wrap leading-relaxed text-ink-body text-[14px] p-6 max-h-[300px] overflow-y-auto">{item.description}</div>
            <button className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-[8px] bg-canvas border border-hairline text-ink-muted hover:text-ink transition-colors text-xs"
              onClick={async () => { await navigator.clipboard.writeText(item.description); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              Copy
            </button>
          </div>
        ) : <div className="text-ink-soft italic mb-6 text-[14px]">No description available</div>}
        <div className="flex justify-end mt-2">
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[8px] border border-hairline bg-surface-card text-ink-body text-[14px] font-medium hover:bg-surface-cream-strong hover:text-primary transition-colors">
            Open in Azure DevOps
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
