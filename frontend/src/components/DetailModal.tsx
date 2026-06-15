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
          <div className="bg-canvas-soft border border-hairline rounded-lg p-6 whitespace-pre-wrap leading-relaxed text-ink-body text-sm mb-6 max-h-[300px] overflow-y-auto">{item.description}</div>
        ) : <div className="text-ink-soft italic mb-6">No description available</div>}
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline text-base">Open in Azure DevOps</a>
      </DialogContent>
    </Dialog>
  );
}
