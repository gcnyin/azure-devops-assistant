import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getStateColor } from "@/lib/state-color";
import { useFixes } from "@/hooks/useApi";
import { useNavigate } from "react-router";
import type { WorkItem, FixItem } from "@/types/api";

interface DetailModalProps {
  item: WorkItem | null;
  stateColors: Record<string, string>;
  onClose: () => void;
  onTriggerFix?: (bugId: number) => void;
  showFixesTab?: boolean;
}

const STATUS_DOT: Record<string, string> = {
  pending: "bg-ink-muted/40", running: "bg-accent-amber animate-pulse",
  completed: "bg-success", failed: "bg-error", cancelled: "bg-ink-muted/40",
};

function FixesTab({ fixes, bugId }: { fixes: FixItem[]; bugId: number }) {
  const navigate = useNavigate();

  if (fixes.length === 0) {
    return <div className="text-center py-8 text-ink-muted text-[14px]">No fix attempts yet for Bug #{bugId}</div>;
  }

  return (
    <div className="space-y-3">
      {fixes.map((fix) => {
        const dot = STATUS_DOT[fix.status] || "bg-ink-muted/20";
        const created = fix.created_at ? new Date(fix.created_at.replace(" ", "T") + "Z").toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
        return (
          <div key={fix.id} className="bg-surface-card rounded-[8px] p-3.5">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${dot}`} />
              <span className="text-[13px] font-medium text-ink-strong">{fix.agent_name || "AI Agent"}</span>
              <span className="text-[11px] text-ink-muted uppercase border border-hairline rounded-full px-1.5">{fix.status}</span>
              <span className="text-[11px] text-ink-muted ml-auto">{created}</span>
            </div>
            {fix.response && <div className="text-[13px] text-ink-body line-clamp-3 mt-2 leading-relaxed">{fix.response.slice(0, 200)}</div>}
            {fix.repo_results && fix.repo_results.length > 0 && (
              <div className="mt-2">
                {fix.repo_results.map((rr: any, i: number) => (
                  <div key={i} className="text-[12px] text-ink-muted">
                    {rr.repo_name || rr.path}: {rr.branch || "N/A"}
                    {rr.pr_url && <a href={rr.pr_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary hover:underline">PR</a>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <button onClick={() => navigate(`/fixes?bug_id=${bugId}`)} className="w-full text-[13px] text-primary hover:text-primary-active py-2 text-center transition-colors">
        View all fixes for Bug #{bugId} &rarr;
      </button>
    </div>
  );
}

export function DetailModal({ item, stateColors, onClose, onTriggerFix, showFixesTab }: DetailModalProps) {
  const isBug = item ? (item.type || "").toLowerCase() === "bug" : false;
  const { data: fixes } = useFixes(undefined, isBug && showFixesTab ? item?.id : undefined);

  if (!item) return null;

  const sc = getStateColor(item.state, stateColors);
  const prev = item._prev_state;
  const url = item.htmlUrl || `https://dev.azure.com/_workitems/edit/${item.id}`;

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item.title}</DialogTitle>
        </DialogHeader>

        {/* Meta row */}
        <div className="flex items-center gap-2 flex-wrap text-[13px] text-ink-muted">
          <span className="tabular-nums">#{item.id}</span>
          <span className="text-[11px] font-medium px-1.5 py-px rounded-full uppercase"
            style={{ background: `${sc}18`, color: sc }}>{item.type || "?"}</span>
          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: `${sc}18`, color: sc }}>{item.state}</span>
          <span>{item.assignedTo || "Unassigned"}</span>
          {isBug && onTriggerFix && (
            <button onClick={() => onTriggerFix(item.id)}
              className="ml-auto text-[13px] font-medium text-primary hover:text-primary-active border border-primary/30 hover:border-primary px-2.5 py-0.5 rounded-[8px] transition-colors">
              AI Fix
            </button>
          )}
        </div>

        {/* State transition */}
        {prev && (
          <div className="flex items-center gap-2 text-[13px] text-ink-muted">
            <span className="line-through" style={{ color: getStateColor(prev, stateColors) }}>{prev}</span>
            <span>&rarr;</span>
            <span style={{ color: sc }}>{item.state}</span>
          </div>
        )}

        {/* Description */}
        {item.description ? (
          <div className="relative bg-surface-card rounded-[8px]">
            <div className="whitespace-pre-wrap leading-snug text-ink-body text-[14px] p-6 max-h-[400px] overflow-y-auto">{item.description.replace(/\n{3,}/g, '\n\n').replace(/\r\n/g, '\n')}</div>
            <button className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-[8px] bg-canvas border border-hairline text-ink-muted hover:text-ink transition-colors text-xs"
              onClick={async () => { await navigator.clipboard.writeText(item.description); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              Copy
            </button>
          </div>
        ) : (
          <div className="text-ink-soft italic text-[14px] py-2">No description available</div>
        )}

        {/* AI Fixes tab */}
        {showFixesTab && isBug && (
          <div className="mt-2">
            <div className="text-[13px] font-medium text-ink-strong mb-3 pb-2 border-b border-hairline">AI Fixes</div>
            <FixesTab fixes={fixes || []} bugId={item.id} />
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end mt-2 pt-3 border-t border-hairline">
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
