import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useFixes } from "@/hooks/useApi";
import type { FixItem } from "@/types/api";

function FixCard({ fix }: { fix: FixItem }) {
  return (
    <div className="bg-canvas border border-hairline rounded-xl p-6 mb-3 shadow-[inset_3px_0_0_0_var(--color-primary)]">
      <div className="text-primary font-semibold text-lg">Bug #{fix.bug_id}</div>
      <div className="text-ink mt-1 mb-3 text-base">{fix.bug_title || "(untitled)"}</div>
      <div className="text-ink-muted text-[13px]">{fix.updated_at || ""}</div>
      <div className="bg-surface-dark text-on-dark rounded-lg p-4 mt-3 whitespace-pre-wrap font-mono text-sm leading-relaxed max-h-[480px] overflow-y-auto">{fix.response || ""}</div>
    </div>
  );
}

export function FixesView() {
  const { data: fixes } = useFixes();
  const [q, setQ] = useState("");
  const filtered = (fixes || []).filter((f) => {
    if (!q) return true; const lq = q.toLowerCase();
    return String(f.bug_id).includes(lq) || (f.bug_title || "").toLowerCase().includes(lq) || (f.response || "").toLowerCase().includes(lq);
  });

  return (
    <div className="table-wrap">
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-hairline">
        <div className="relative flex-1 max-w-[360px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft pointer-events-none">S</span>
          <Input className="pl-[38px]" placeholder="Search fixes by ID, title or content..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div>
        {!fixes ? <div className="text-center py-16 text-ink-muted">Loading...</div>
        : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-24 text-ink-muted">
            <div className="text-4xl mb-3 opacity-60">{q ? "-" : "*"}</div>
            <div className="text-base text-ink-strong font-medium mb-2">{q ? "No matches" : "No AI fix suggestions yet"}</div>
            <div className="text-sm max-w-[30ch] text-ink-soft">{q ? `No fixes match "${q}"` : 'Click "Generate AI Fixes" in the diff summary when new bugs appear.'}</div>
          </div>
        ) : (<>
          {q && <div className="px-5 pt-3 text-[13px] text-ink-muted">{filtered.length} / {fixes.length} fixes match "{q}"</div>}
          {filtered.map((f) => <FixCard key={f.bug_id} fix={f} />)}
        </>)}
      </div>
    </div>
  );
}
