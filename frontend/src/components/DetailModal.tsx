import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
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
        </div>

        {/* State transition */}
        {prev && (
          <div className="flex items-center gap-2 text-[13px] text-ink-muted">
            <span className="line-through" style={{ color: getStateColor(prev, stateColors) }}>{prev}</span>
            <span>&rarr;</span>
            <span style={{ color: sc }}>{item.state}</span>
          </div>
        )}

        {/* AI Fix CTA */}
        {isBug && onTriggerFix && (
          <div className="flex items-center justify-between bg-primary/[0.06] border border-primary/20 rounded-[12px] px-5 py-4 my-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 w-9 h-9 rounded-[8px] bg-primary/12 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                  <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                  <path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-ink-strong">AI Fix</div>
                <div className="text-[12px] text-ink-muted truncate">Let AI analyze the bug and propose a code fix</div>
              </div>
            </div>
            <Button variant="default" size="lg" onClick={() => onTriggerFix(item.id)} className="shrink-0 ml-4">
              AI Fix
            </Button>
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
            className={buttonVariants({ variant: "outline" })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            Open in Azure DevOps
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
