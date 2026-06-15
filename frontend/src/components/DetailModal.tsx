import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getStateColor } from "@/lib/state-color";
import type { WorkItem } from "@/types/api";

interface DetailModalProps {
  item: WorkItem | null;
  stateColors: Record<string, string>;
  onClose: () => void;
}

export function DetailModal({ item, stateColors, onClose }: DetailModalProps) {
  if (!item) return null;

  const stateColor = getStateColor(item.state, stateColors);
  const prevState = item._prev_state;
  const url = item.htmlUrl || `https://dev.azure.com/_workitems/edit/${item.id}`;

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{item.title}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-3 mb-6 flex-wrap text-sm text-ink-mute">
          <span>#{item.id}</span>
          <span>{item.type}</span>
          <span className="state-badge" style={{ background: `${stateColor}24`, color: stateColor }}>
            {item.state}
          </span>
          <span>{item.assignedTo || "Unassigned"}</span>
        </div>

        {prevState && (
          <div className="mb-4">
            <span className="state-badge line-through"
              style={{ background: `${getStateColor(prevState, stateColors)}24`, color: getStateColor(prevState, stateColors) }}>
              {prevState}
            </span>
            <span className="mx-2 text-ink-mute">&rarr;</span>
            <span className="state-badge font-bold" style={{ background: `${stateColor}24`, color: stateColor }}>
              {item.state}
            </span>
          </div>
        )}

        {item.description ? (
          <div className="bg-canvas-soft border border-hairline rounded-md p-6 whitespace-pre-wrap leading-relaxed text-ink-secondary text-sm mb-6 max-h-[300px] overflow-y-auto">
            {item.description}
          </div>
        ) : (
          <div className="text-ink-faint italic mb-6">No description available</div>
        )}

        <a href={url} target="_blank" rel="noopener noreferrer"
          className="text-ink font-medium hover:underline text-base">
          Open in Azure DevOps
        </a>
      </DialogContent>
    </Dialog>
  );
}
