import { useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFixes, useFixesMutation } from "@/hooks/useApi";
import type { FixItem, FixRepoResult } from "@/types/api";

const STATUSES = ["all", "pending", "running", "completed", "failed"] as const;
type FixStatus = (typeof STATUSES)[number];

const STATUS_LABELS: Record<FixStatus, string> = {
  all: "All",
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

const STATUS_DOT: Record<string, string> = {
  pending: "bg-ink-soft/40",
  running: "bg-accent-amber animate-pulse",
  completed: "bg-success",
  failed: "bg-error",
};

function formatTime(ts: string | null) {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function getDuration(started: string | null, finished: string | null): string {
  if (!started || !finished || !finished.includes(":")) return "";
  // Handle SQLite datetime strings: "YYYY-MM-DD HH:MM:SS"
  const parse = (s: string) => new Date(s.replace(" ", "T") + "Z").getTime();
  const ms = parse(finished) - parse(started);
  if (ms <= 0 || isNaN(ms)) return "";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

function RepoResults({
  repoResults,
}: {
  repoResults: FixRepoResult[];
}) {
  return (
    <div className="mt-3 space-y-2">
      {repoResults.map((rr, i) => (
        <div
          key={i}
          className="bg-surface-card rounded-lg p-3 text-[13px]"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-ink-strong">
              {rr.repo_name || rr.path}
            </span>
            {rr.branch && (
              <span className="text-ink-muted text-xs font-mono">
                {rr.branch}
              </span>
            )}
          </div>
          {rr.pr_url ? (
            <a
              href={rr.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-1 text-primary text-xs hover:underline"
            >
              View PR &rarr;
            </a>
          ) : (
            <span className="inline-block mt-1 text-ink-muted text-xs">
              {rr.push_error || rr.pr_error || "PR not created"}
            </span>
          )}
          {rr.files_modified && rr.files_modified.length > 0 && (
            <div className="mt-1 text-ink-soft text-[11px] font-mono">
              {rr.files_modified.slice(0, 5).map((f, j) => (
                <div key={j}>{f}</div>
              ))}
              {rr.files_modified.length > 5 && (
                <div>... 共 {rr.files_modified.length} 个文件</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function FixCard({ fix, onRetry }: { fix: FixItem; onRetry: (bugId: number) => void }) {
  const status = fix.status;
  const dot = STATUS_DOT[status] || "bg-ink-soft/20";
  const duration = getDuration(fix.started_at, fix.finished_at);
  const retrying = false;

  return (
    <div className="bg-canvas border border-hairline rounded-xl p-6 mb-3 shadow-[inset_3px_0_0_0_var(--color-primary)]">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
        <span className="text-primary font-semibold text-lg">Bug #{fix.bug_id}</span>
        <span className="text-ink-muted/70 text-xs border border-hairline rounded px-1.5 py-px uppercase">{status}</span>
        {fix.agent_name && (
          <span className="text-ink-soft text-xs ml-auto">Agent: {fix.agent_name}</span>
        )}
      </div>
      <div className="text-ink mt-1 mb-2 text-base">{fix.bug_title || "(untitled)"}</div>
      <div className="text-ink-muted text-[13px] mb-3">
        {status === "completed" && (
          <>Started {formatTime(fix.started_at)} · Took {duration}</>
        )}
        {status === "failed" && (
          <>Started {formatTime(fix.started_at)} · Failed after {duration}</>
        )}
      </div>
      {(status === "pending" || status === "running") ? (
        <div className="bg-surface-card rounded-lg p-4 text-sm text-ink-muted italic">
          {status === "pending" ? "Waiting in queue..." : "AI agent is analyzing the bug..."}
        </div>
      ) : status === "failed" ? (
        <div className="bg-[#3d1a1a] text-error rounded-lg p-4 whitespace-pre-wrap font-mono text-sm leading-relaxed max-h-[480px] overflow-y-auto">
          {fix.error || "Unknown error"}
        </div>
      ) : (
        <div className="prose prose-base max-w-none bg-canvas rounded-lg p-4 mt-3 max-h-[480px] overflow-y-auto">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                const inline = !match;
                return !inline ? (
                  <SyntaxHighlighter
                    style={oneLight}
                    language={match[1]}
                    PreTag="div"
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
              a({ node, children, ...props }) {
                return (
                  <a target="_blank" rel="noopener noreferrer" {...props}>
                    {children}
                  </a>
                );
              },
            }}
          >
            {fix.response || ""}
          </ReactMarkdown>
          {fix.repo_results && fix.repo_results.length > 0 && (
            <RepoResults repoResults={fix.repo_results} />
          )}
        </div>
      )}
      {!fix.repo_results?.length && (status === "completed" || status === "failed") && (
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" size="sm" className="text-xs"
            onClick={() => onRetry(fix.bug_id)} disabled={retrying}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

export function FixesView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const bugIdParam = searchParams.get("bug_id");
  const activeBugId = bugIdParam ? parseInt(bugIdParam, 10) : undefined;
  const statusParam = (searchParams.get("status") || "all") as FixStatus;
  const activeStatus = STATUSES.includes(statusParam) ? statusParam : "all";

  const apiStatus = activeStatus === "all" ? undefined : activeStatus;
  const { data: fixes } = useFixes(apiStatus, activeBugId);
  const fixesMutation = useFixesMutation();
  const [q, setQ] = useState("");

  const setStatus = (s: FixStatus) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (s === "all") next.delete("status");
      else next.set("status", s);
      return next;
    });
  };

  const clearBugId = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("bug_id");
      return next;
    });
  };

  // Count by status from all tasks (unfiltered by status)
  const { data: allFixes } = useFixes(undefined, activeBugId);
  const counts: Record<string, number> = { all: 0, pending: 0, running: 0, completed: 0, failed: 0 };
  for (const f of allFixes || []) {
    counts.all++;
    counts[f.status] = (counts[f.status] || 0) + 1;
  }

  const filtered = (fixes || []).filter((f) => {
    if (!q) return true;
    const lq = q.toLowerCase();
    return String(f.bug_id).includes(lq)
      || (f.bug_title || "").toLowerCase().includes(lq)
      || (f.response || "").toLowerCase().includes(lq)
      || (f.error || "").toLowerCase().includes(lq);
  });

  const handleRetry = (bugId: number) => {
    fixesMutation.mutate([bugId], {
      onSuccess: (result) => {
        if (result.ok) toast.success("Retry task queued");
        else toast.error(result.error || "Failed to retry");
      },
      onError: () => toast.error("Failed to retry"),
    });
  };

  return (
    <div className="table-wrap">
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-hairline flex-wrap">
        <div className="relative flex-1 max-w-[360px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft pointer-events-none">S</span>
          <Input className="pl-[38px]" placeholder="Search fixes by ID, title or content..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {STATUSES.map((s) => (
            <Button key={s} variant={activeStatus === s ? "secondary" : "ghost"} size="sm" className="rounded-lg"
              onClick={() => setStatus(s)}>
              {STATUS_LABELS[s]} <span className="text-ink-soft ml-1 text-xs">{counts[s]}</span>
            </Button>
          ))}
        </div>
        {activeBugId && (
          <span className="text-[13px] text-ink-muted">
            Bug #{activeBugId} ·
            <button className="ml-1 underline hover:text-ink" onClick={clearBugId}>clear</button>
          </span>
        )}
      </div>
      <div className="p-4 sm:p-6">
        {!fixes ? (
          <div className="text-center py-16 text-ink-muted">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-24 text-ink-muted">
            <div className="text-4xl mb-3 opacity-60">{q ? "-" : "*"}</div>
            <div className="text-base text-ink-strong font-medium mb-2">{q ? "No matches" : "No fix tasks yet"}</div>
            <div className="text-sm max-w-[30ch] text-ink-soft">
              {q
                ? `No fixes match "${q}"`
                : activeBugId
                  ? `No fix tasks for Bug #${activeBugId}`
                  : 'Select bugs on the Board and click "Generate AI Fixes".'}
            </div>
          </div>
        ) : (
          <>
            {q && <div className="mb-3 text-[13px] text-ink-muted">{filtered.length} / {fixes.length} fixes match "{q}"</div>}
            {filtered.map((f) => <FixCard key={f.id} fix={f} onRetry={handleRetry} />)}
          </>
        )}
      </div>
    </div>
  );
}
