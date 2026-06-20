import { useState, useMemo } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { useFixes, useFixesMutation, useCancelFixMutation } from "@/hooks/useApi";
import type { FixItem, FixRepoResult } from "@/types/api";

const STATUS_GROUPS = [
  { key: "running", label: "Running", dot: "bg-accent-amber animate-pulse" },
  { key: "pending", label: "Pending", dot: "bg-ink-soft/40" },
  { key: "failed", label: "Failed", dot: "bg-error" },
  { key: "completed", label: "Completed", dot: "bg-success" },
  { key: "cancelled", label: "Cancelled", dot: "bg-ink-soft/40" },
] as const;

const STATUS_DOT: Record<string, string> = {
  pending: "bg-ink-soft/40",
  running: "bg-accent-amber animate-pulse",
  completed: "bg-success",
  failed: "bg-error",
  cancelled: "bg-ink-soft/40",
};

function formatTime(ts: string | null) {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function getDuration(started: string | null, finished: string | null): string {
  if (!started || !finished || !finished.includes(":")) return "";
  const parse = (s: string) => new Date(s.replace(" ", "T") + "Z").getTime();
  const ms = parse(finished) - parse(started);
  if (ms <= 0 || isNaN(ms)) return "";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

function RepoResults({ repoResults }: { repoResults: FixRepoResult[] }) {
  return (
    <div className="mt-3 space-y-2">
      {repoResults.map((rr, i) => (
        <div key={i} className="bg-canvas-soft rounded-lg p-3 text-[13px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-ink-strong">{rr.repo_name || rr.path}</span>
            {rr.branch && <span className="text-ink-muted text-xs font-mono">{rr.branch}</span>}
          </div>
          {rr.pr_url ? (
            <a href={rr.pr_url} target="_blank" rel="noopener noreferrer"
              className="inline-block mt-1 text-primary text-xs hover:underline">View PR &rarr;</a>
          ) : (
            <span className="inline-block mt-1 text-ink-muted text-xs">{rr.push_error || rr.pr_error || "PR not created"}</span>
          )}
          {rr.files_modified && rr.files_modified.length > 0 && (
            <div className="mt-1 text-ink-soft text-[11px] font-mono">
              {rr.files_modified.slice(0, 5).map((f, j) => <div key={j}>{f}</div>)}
              {rr.files_modified.length > 5 && <div>... {rr.files_modified.length} files total</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function FixesView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const bugIdParam = searchParams.get("bug_id");
  const activeBugId = bugIdParam ? parseInt(bugIdParam, 10) : undefined;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const { data: fixes } = useFixes(undefined, activeBugId);
  const fixesMutation = useFixesMutation();
  const cancelMutation = useCancelFixMutation();

  const clearBugId = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("bug_id");
      return next;
    });
    setSelectedId(null);
  };

  const filtered = useMemo(() => {
    if (!fixes) return [];
    if (!q) return fixes;
    const lq = q.toLowerCase();
    return fixes.filter((f) =>
      String(f.bug_id).includes(lq) ||
      (f.bug_title || "").toLowerCase().includes(lq) ||
      (f.response || "").toLowerCase().includes(lq) ||
      (f.error || "").toLowerCase().includes(lq)
    );
  }, [fixes, q]);

  // Group by status
  const grouped = useMemo(() => {
    const groups: Record<string, FixItem[]> = {};
    for (const f of filtered) {
      if (!groups[f.status]) groups[f.status] = [];
      groups[f.status].push(f);
    }
    return groups;
  }, [filtered]);

  const selectedFix = useMemo(() => {
    if (selectedId === null || !fixes) return null;
    return fixes.find((f) => f.id === selectedId) || null;
  }, [selectedId, fixes]);

  const handleRetry = (bugId: number) => {
    fixesMutation.mutate([bugId], {
      onSuccess: (result) => {
        if (result.ok) toast.success("Retry task queued");
        else toast.error(result.error || "Failed to retry");
      },
      onError: () => toast.error("Failed to retry"),
    });
  };

  const handleCancel = (taskId: number) => {
    setCancellingId(taskId);
    cancelMutation.mutate(taskId, {
      onSuccess: (result) => {
        setCancellingId(null);
        if (result.ok) toast.success(`Task #${taskId} cancelled`);
        else toast.error(result.message || "Failed to cancel");
      },
      onError: () => {
        setCancellingId(null);
        toast.error("Failed to cancel task");
      },
    });
  };

  return (
    <div className="flex gap-0 h-full min-h-0">
      {/* Left: task list */}
      <div className="flex flex-col min-w-0" style={selectedFix ? { width: "calc(100% - 480px)", maxWidth: "calc(100% - 480px)" } : { flex: 1 }}>
        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[160px] max-w-[300px]">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-soft pointer-events-none">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <Input className="pl-8 h-8 text-xs" placeholder="Search fixes..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {activeBugId && (
            <span className="text-xs text-ink-muted">
              Bug #{activeBugId} ·
              <button className="ml-1 underline hover:text-ink" onClick={clearBugId}>clear</button>
            </span>
          )}
        </div>

        {/* Grouped list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {!fixes ? (
            <div className="text-center py-16 text-ink-muted text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-24 text-ink-muted">
              <div className="text-4xl mb-3 opacity-60">{q ? "-" : "*"}</div>
              <div className="text-sm font-medium text-ink-strong mb-1">{q ? "No matches" : "No fix tasks yet"}</div>
              <div className="text-xs text-ink-soft">
                {q ? `No fixes match "${q}"` : activeBugId ? `No fix tasks for Bug #${activeBugId}` : "Trigger fixes from the Board view."}
              </div>
            </div>
          ) : (
            <Accordion type="single" value={Object.keys(grouped)[0] || ""} onValueChange={() => {}}>
              {STATUS_GROUPS.map((group) => {
                const items = grouped[group.key] || [];
                if (items.length === 0) return null;
                return (
                  <AccordionItem key={group.key} value={group.key}>
                    <AccordionTrigger>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${group.dot}`} />
                        <span>{group.label}</span>
                        <span className="text-xs text-ink-muted">({items.length})</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-1.5">
                        {items.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => setSelectedId(f.id)}
                            className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                              selectedId === f.id
                                ? "bg-primary/10 border border-primary/30"
                                : "hover:bg-canvas-soft border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[f.status] || "bg-ink-soft/20"}`} />
                              <span className="text-sm font-medium text-ink-strong">Bug #{f.bug_id}</span>
                              <span className="text-xs text-ink-muted truncate ml-auto">
                                {formatTime(f.created_at)}
                              </span>
                            </div>
                            <div className="text-xs text-ink-body truncate mt-0.5 ml-[22px]">
                              {f.bug_title || "(untitled)"}
                            </div>
                          </button>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </div>
      </div>

      {/* Right: detail panel */}
      {selectedFix && (
        <div className="w-[480px] shrink-0 border-l border-hairline bg-canvas-card flex flex-col overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[selectedFix.status] || "bg-ink-soft/20"}`} />
              <span className="text-sm font-semibold text-ink-strong">Bug #{selectedFix.bug_id}</span>
              <span className="text-[10px] text-ink-muted uppercase border border-hairline rounded px-1">{selectedFix.status}</span>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="p-1 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Meta */}
          <div className="px-4 py-2 border-b border-hairline shrink-0">
            <div className="text-sm text-ink-strong mb-1">{selectedFix.bug_title || "(untitled)"}</div>
            <div className="text-xs text-ink-muted">
              {selectedFix.agent_name && <span>Agent: {selectedFix.agent_name} · </span>}
              Started {formatTime(selectedFix.started_at)}
              {selectedFix.finished_at && <> · Took {getDuration(selectedFix.started_at, selectedFix.finished_at)}</>}
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 py-2 border-b border-hairline shrink-0 flex items-center gap-2">
            {(selectedFix.status === "pending" || selectedFix.status === "running") && (
              <Button variant="ghost" size="sm" className="text-xs text-error hover:bg-error/10"
                disabled={cancellingId === selectedFix.id}
                onClick={() => handleCancel(selectedFix.id)}>
                {cancellingId === selectedFix.id ? "Cancelling..." : "Cancel"}
              </Button>
            )}
            {(selectedFix.status === "failed" || selectedFix.status === "completed") && (
              <Button variant="ghost" size="sm" className="text-xs"
                onClick={() => handleRetry(selectedFix.bug_id)}>
                Retry
              </Button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
            {selectedFix.status === "pending" ? (
              <div className="text-sm text-ink-muted italic py-8 text-center">Waiting in queue...</div>
            ) : selectedFix.status === "running" ? (
              <div className="text-sm text-ink-muted italic py-8 text-center">AI agent is analyzing the bug...</div>
            ) : selectedFix.status === "failed" ? (
              <div className="bg-error/5 text-error rounded-lg p-4 whitespace-pre-wrap font-mono text-sm leading-relaxed">
                {selectedFix.error || "Unknown error"}
              </div>
            ) : (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ node, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || "");
                      const inline = !match;
                      return !inline ? (
                        <SyntaxHighlighter style={oneDark} language={match![1]} PreTag="div">
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>{children}</code>
                      );
                    },
                    a({ node, children, ...props }: any) {
                      return <a target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
                    },
                  }}
                >
                  {selectedFix.response || ""}
                </ReactMarkdown>
                {selectedFix.repo_results && selectedFix.repo_results.length > 0 && (
                  <RepoResults repoResults={selectedFix.repo_results} />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
