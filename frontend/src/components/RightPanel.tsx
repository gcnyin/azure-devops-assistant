import { X, Copy, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getStateColor } from "@/lib/state-color";
import { useFixes } from "@/hooks/useApi";
import type { WorkItem } from "@/types/api";

interface RightPanelProps {
  item: WorkItem | null;
  stateColors: Record<string, string>;
  onClose: () => void;
  onTriggerFix?: (bugId: number) => void;
}

const PANEL_WIDTH = 480;

export function RightPanel({ item, stateColors, onClose, onTriggerFix }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState("detail");
  const navigate = useNavigate();
  const isBug = item ? (item.type || "").toLowerCase() === "bug" : false;
  const { data: fixes } = useFixes(undefined, isBug ? item?.id : undefined);

  useEffect(() => { if (item) setActiveTab("detail"); }, [item?.id]);

  if (!item) return null;

  const sc = getStateColor(item.state, stateColors);
  const prev = item._prev_state;
  const url = item.htmlUrl || `https://dev.azure.com/_workitems/edit/${item.id}`;

  return (
    <div className="h-full border-l border-hairline bg-canvas flex flex-col shrink-0 overflow-hidden" style={{ width: PANEL_WIDTH }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] text-ink-muted tabular-nums shrink-0">#{item.id}</span>
          <span className="text-[14px] font-medium text-ink-strong truncate">{item.title}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-[8px] text-ink-muted hover:text-ink hover:bg-surface-card transition-colors shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* Meta bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-hairline shrink-0 flex-wrap">
        <span className="text-[11px] font-medium px-1.5 py-px rounded-full uppercase"
          style={{ background: `${sc}18`, color: sc }}>{item.type || "?"}</span>
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: `${sc}18`, color: sc }}>{item.state}</span>
        <span className="text-[13px] text-ink-muted">{item.assignedTo || "Unassigned"}</span>
        {isBug && (
          <button onClick={() => onTriggerFix?.(item.id)}
            className="ml-auto text-[13px] font-medium text-primary hover:text-primary-active border border-primary/30 hover:border-primary px-2.5 py-0.5 rounded-[8px] transition-colors">
            AI Fix
          </button>
        )}
      </div>

      {prev && (
        <div className="px-4 py-1.5 text-[13px] text-ink-muted shrink-0">
          <span className="line-through" style={{ color: getStateColor(prev, stateColors) }}>{prev}</span>
          <span className="mx-1.5">&rarr;</span>
          <span style={{ color: sc }}>{item.state}</span>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="shrink-0 px-4 pt-2">
        <TabsList>
          <TabsTrigger value="detail">Detail</TabsTrigger>
          {isBug && <TabsTrigger value="fixes">AI Fixes{fixes && fixes.length > 0 ? ` (${fixes.length})` : ""}</TabsTrigger>}
        </TabsList>
      </Tabs>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
        {activeTab === "detail" && (
          <>
            {item.description ? (
              <div className="relative bg-surface-card rounded-[12px] mb-4">
                <div className="whitespace-pre-wrap leading-snug text-ink-body text-[14px] p-4 max-h-[500px] overflow-y-auto">{item.description}</div>
                <button className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-[8px] bg-canvas border border-hairline text-ink-muted hover:text-ink transition-colors text-[12px]"
                  onClick={async () => { await navigator.clipboard.writeText(item.description); }}>
                  <Copy size={12} />
                  Copy
                </button>
              </div>
            ) : <div className="text-ink-muted italic text-[14px] mb-4">No description available</div>}
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[8px] border border-hairline bg-surface-card text-ink-body text-[14px] font-medium hover:bg-surface-cream-strong hover:border-primary/30 hover:text-primary transition-colors">
              Open in Azure DevOps
              <ExternalLink size={14} />
            </a>
          </>
        )}

        {activeTab === "fixes" && isBug && (
          <FixesTab fixes={fixes || []} bugId={item.id} onViewAll={() => navigate(`/fixes?bug_id=${item.id}`)} />
        )}
      </div>
    </div>
  );
}

function FixesTab({ fixes, bugId, onViewAll }: { fixes: any[]; bugId: number; onViewAll: () => void }) {
  if (fixes.length === 0) {
    return <div className="text-center py-8 text-ink-muted text-[14px]">No fix attempts yet for Bug #{bugId}</div>;
  }
  const STATUS_DOT: Record<string, string> = {
    pending: "bg-ink-muted/40", running: "bg-accent-amber animate-pulse",
    completed: "bg-success", failed: "bg-error", cancelled: "bg-ink-muted/40",
  };
  return (
    <div className="space-y-3">
      {fixes.map((fix) => {
        const dot = STATUS_DOT[fix.status] || "bg-ink-muted/20";
        const created = fix.created_at ? new Date(fix.created_at.replace(" ", "T") + "Z").toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
        return (
          <div key={fix.id} className="bg-surface-card rounded-[12px] p-3.5">
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
      <button onClick={onViewAll} className="w-full text-[13px] text-primary hover:text-primary-active py-2 text-center transition-colors">
        View all fixes for Bug #{bugId} &rarr;
      </button>
    </div>
  );
}
