import { useState, useMemo } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { useFixes, useFixesMutation, useCancelFixMutation } from "@/hooks/useApi";
import type { FixItem, FixRepoResult } from "@/types/api";

const STATUS_GROUPS = [
  { key: "running", label: "Running", dot: "bg-accent-amber animate-pulse" },
  { key: "pending", label: "Pending", dot: "bg-ink-muted/40" },
  { key: "failed", label: "Failed", dot: "bg-error" },
  { key: "completed", label: "Completed", dot: "bg-success" },
  { key: "cancelled", label: "Cancelled", dot: "bg-ink-muted/40" },
] as const;
const STATUS_DOT: Record<string, string> = {
  pending: "bg-ink-muted/40", running: "bg-accent-amber animate-pulse",
  completed: "bg-success", failed: "bg-error", cancelled: "bg-ink-muted/40",
};

function formatTime(ts: string | null) {
  if (!ts) return ""; const d = new Date(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
  return isNaN(d.getTime()) ? ts : d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}
function getDuration(s: string | null, f: string | null): string {
  if (!s || !f || !f.includes(":")) return "";
  const ms = new Date(f.replace(" ", "T") + "Z").getTime() - new Date(s.replace(" ", "T") + "Z").getTime();
  if (ms <= 0 || isNaN(ms)) return ""; const sec = Math.round(ms / 1000);
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
}
function RepoResults({ repoResults }: { repoResults: FixRepoResult[] }) {
  return (
    <div className="mt-3 space-y-2">
      {repoResults.map((rr, i) => (
        <div key={i} className="bg-canvas rounded-[12px] p-3 text-[13px]">
          <div className="flex items-center gap-2 flex-wrap"><span className="font-medium text-ink-strong">{rr.repo_name || rr.path}</span>{rr.branch && <span className="text-ink-muted text-xs font-mono">{rr.branch}</span>}</div>
          {rr.pr_url ? <a href={rr.pr_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-1 text-primary text-xs hover:underline">View PR &rarr;</a>
            : <span className="inline-block mt-1 text-ink-muted text-xs">{rr.push_error || rr.pr_error || "PR not created"}</span>}
          {rr.files_modified && rr.files_modified.length > 0 && (
            <div className="mt-1 text-ink-soft text-[11px] font-mono">{rr.files_modified.slice(0,5).map((fn,j)=><div key={j}>{fn}</div>)}{rr.files_modified.length>5&&<div>... {rr.files_modified.length} files</div>}</div>
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
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const { data: fixes } = useFixes(undefined, activeBugId);
  const fixesMutation = useFixesMutation();
  const cancelMutation = useCancelFixMutation();

  const clearBugId = () => { setSearchParams((p)=>{const n=new URLSearchParams(p);n.delete("bug_id");return n;});setSelectedId(null); };
  const filtered = useMemo(() => (!fixes ? [] : !q ? fixes : fixes.filter(f => String(f.bug_id).includes(q.toLowerCase()) || (f.bug_title||"").toLowerCase().includes(q.toLowerCase()) || (f.response||"").toLowerCase().includes(q.toLowerCase()) || (f.error||"").toLowerCase().includes(q.toLowerCase()))), [fixes, q]);
  const grouped = useMemo(() => { const g: Record<string, FixItem[]> = {}; for (const f of filtered) { if (!g[f.status]) g[f.status] = []; g[f.status].push(f); } return g; }, [filtered]);
  const selectedFix = useMemo(() => (selectedId !== null && fixes) ? fixes.find(f => f.id === selectedId) || null : null, [selectedId, fixes]);

  const effectiveOpen = openGroup !== null ? openGroup : Object.keys(grouped).find(k => grouped[k].length > 0) || "";

  return (
    <div className="flex gap-0 h-full min-h-0">
      <div className="flex flex-col min-w-0" style={selectedFix ? { width: "calc(100% - 480px)", maxWidth: "calc(100% - 480px)" } : { flex: 1 }}>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[160px] max-w-[300px]">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            </span>
            <Input className="pl-8 h-8 text-[13px]" placeholder="Search fixes..." value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {activeBugId && <span className="text-[13px] text-ink-muted">Bug #{activeBugId} · <button className="ml-1 underline hover:text-ink" onClick={clearBugId}>clear</button></span>}
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {!fixes ? <div className="text-center py-16 text-ink-muted text-[14px]">Loading...</div>
          : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-24 text-ink-muted">
              <div className="text-4xl mb-3 opacity-60">{q?"-":"*"}</div>
              <div className="text-[14px] font-medium text-ink-strong mb-1">{q?"No matches":"No fix tasks yet"}</div>
              <div className="text-[13px] text-ink-soft">{q?`No fixes match "${q}"`:activeBugId?`No fix tasks for Bug #${activeBugId}`:"Trigger fixes from the Board view."}</div>
            </div>
          ) : (
            <Accordion type="single" value={effectiveOpen} onValueChange={setOpenGroup}>
              {STATUS_GROUPS.map(group => {
                const items = grouped[group.key] || []; if (!items.length) return null;
                return (
                  <AccordionItem key={group.key} value={group.key}>
                    <AccordionTrigger>
                      <div className="flex items-center gap-2"><span className={`inline-block w-2 h-2 rounded-full ${group.dot}`} /><span className="text-[14px]">{group.label}</span><span className="text-[13px] text-ink-muted">({items.length})</span></div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-1">
                        {items.map(f => (
                          <button key={f.id} onClick={() => setSelectedId(f.id)}
                            className={`w-full text-left px-3 py-2 rounded-[8px] transition-colors ${selectedId===f.id?"bg-primary/10 border border-primary/30":"hover:bg-surface-card border border-transparent"}`}>
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[f.status]||"bg-ink-muted/20"}`} />
                              <span className="text-[14px] font-medium text-ink-strong">Bug #{f.bug_id}</span>
                              <span className="text-[12px] text-ink-muted truncate ml-auto">{formatTime(f.created_at)}</span>
                            </div>
                            <div className="text-[13px] text-ink-body truncate mt-0.5 ml-[22px]">{f.bug_title||"(untitled)"}</div>
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

      {selectedFix && (
        <div className="w-[480px] shrink-0 border-l border-hairline bg-canvas flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[selectedFix.status]||"bg-ink-muted/20"}`} />
              <span className="text-[14px] font-medium text-ink-strong">Bug #{selectedFix.bug_id}</span>
              <span className="text-[11px] text-ink-muted uppercase border border-hairline rounded-full px-1.5">{selectedFix.status}</span>
            </div>
            <button onClick={()=>setSelectedId(null)} className="p-1 rounded-[8px] text-ink-muted hover:text-ink hover:bg-surface-card transition-colors shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="px-4 py-2 border-b border-hairline shrink-0">
            <div className="text-[14px] text-ink-strong mb-1">{selectedFix.bug_title||"(untitled)"}</div>
            <div className="text-[12px] text-ink-muted">{selectedFix.agent_name&&<span>Agent: {selectedFix.agent_name} · </span>}Started {formatTime(selectedFix.started_at)}{selectedFix.finished_at&&<> · Took {getDuration(selectedFix.started_at,selectedFix.finished_at)}</>}</div>
          </div>
          <div className="px-4 py-2 border-b border-hairline shrink-0 flex items-center gap-2">
            {(selectedFix.status==="pending"||selectedFix.status==="running")&&<Button variant="ghost" size="sm" className="text-error hover:bg-error/10" disabled={cancellingId===selectedFix.id} onClick={()=>{setCancellingId(selectedFix.id);cancelMutation.mutate(selectedFix.id,{onSuccess:(r)=>{setCancellingId(null);toast[r.ok?"success":"error"](r.ok?`Task #${selectedFix.id} cancelled`:r.message||"Failed");},onError:()=>{setCancellingId(null);toast.error("Failed");}});}}>{cancellingId===selectedFix.id?"Cancelling...":"Cancel"}</Button>}
            {(selectedFix.status==="failed"||selectedFix.status==="completed")&&<Button variant="ghost" size="sm" onClick={()=>fixesMutation.mutate([selectedFix.bug_id],{onSuccess:(r)=>toast[r.ok?"success":"error"](r.ok?"Retry queued":r.error||"Failed"),onError:()=>toast.error("Failed")})}>Retry</Button>}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
            {selectedFix.status==="pending" ? <div className="text-[14px] text-ink-muted italic py-8 text-center">Waiting in queue...</div>
            : selectedFix.status==="running" ? <div className="text-[14px] text-ink-muted italic py-8 text-center">AI agent is analyzing the bug...</div>
            : selectedFix.status==="failed" ? <div className="bg-error/5 text-error rounded-[12px] p-4 whitespace-pre-wrap font-mono text-[14px] leading-relaxed">{selectedFix.error||"Unknown error"}</div>
            : (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                  code({node,className,children,...props}:any){const m=/language-(\w+)/.exec(className||"");return !m?<code className={className} {...props}>{children}</code>:<SyntaxHighlighter style={oneLight} language={m[1]} PreTag="div">{String(children).replace(/\n$/,"")}</SyntaxHighlighter>;},
                  a({node,children,...props}:any){return <a target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;}
                }}>{selectedFix.response||""}</ReactMarkdown>
                {selectedFix.repo_results&&selectedFix.repo_results.length>0&&<RepoResults repoResults={selectedFix.repo_results}/>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
