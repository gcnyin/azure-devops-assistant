import { useNavigate, useLocation } from "react-router";
import { useBoardData, useSprints } from "@/hooks/useApi";
import { useCallback } from "react";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const NAV_ITEMS = [
  { id: "board", path: "/", label: "Board", icon: BoardIcon },
  { id: "fixes", path: "/fixes", label: "AI Fixes", icon: FixesIcon },
  { id: "history", path: "/history", label: "History", icon: HistoryIcon },
  { id: "settings", path: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: sprintsData } = useSprints();
  const activeSprint = sprintsData?.current_sprint || "";
  const { data: boardData } = useBoardData("all", "");

  const pathname = location.pathname;
  let activeId = "board";
  if (pathname.startsWith("/fixes")) activeId = "fixes";
  else if (pathname.startsWith("/history")) activeId = "history";
  else if (pathname.startsWith("/settings")) activeId = "settings";

  // Sprint stats
  const allItems = boardData?.items || [];
  const incCount = allItems.filter(
    (it) => !["done", "closed", "completed", "resolved", "removed"].includes(it.state.toLowerCase())
  ).length;
  const doneCount = allItems.length - incCount;
  const sprintName = boardData?.iteration?.name || activeSprint || "-";

  const handleNav = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  return (
    <aside
      className={`flex flex-col bg-[var(--sidebar)] border-r border-hairline h-screen sticky top-0 transition-all duration-200 shrink-0 ${
        collapsed ? "w-[56px]" : "w-[220px]"
      }`}
    >
      {/* Toggle button */}
      <div className="flex items-center h-14 px-3 border-b border-hairline">
        {!collapsed && (
          <span className="text-sm font-semibold text-ink-strong truncate flex-1">Sprint Monitor</span>
        )}
        <button
          onClick={onToggle}
          className={`p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-sidebar-hover transition-colors ${
            collapsed ? "mx-auto" : ""
          }`}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? (
              <>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
                <path d="M14 9l3 3-3 3" />
              </>
            ) : (
              <>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
                <path d="M10 9l-3 3 3 3" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-2 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.path)}
              className={`flex items-center gap-3 w-full rounded-lg text-sm transition-colors ${
                collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2"
              } ${
                isActive
                  ? "bg-sidebar-active text-primary font-medium"
                  : "text-ink-muted hover:text-ink hover:bg-sidebar-hover"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon active={isActive} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Sprint summary (only when expanded) */}
      {!collapsed && (
        <div className="px-3 py-3 border-t border-hairline space-y-2">
          <div className="text-[11px] text-ink-muted uppercase tracking-wider font-semibold">Current Sprint</div>
          <div className="text-xs text-ink-strong font-medium truncate">{sprintName}</div>
          <div className="flex items-center gap-3 text-xs">
            <span className="tabular-nums">
              <span className="text-ink font-semibold">{allItems.length}</span>
              <span className="text-ink-muted ml-1">Total</span>
            </span>
            <span className="tabular-nums">
              <span className="text-accent-amber font-semibold">{incCount}</span>
              <span className="text-ink-muted ml-1">Open</span>
            </span>
            <span className="tabular-nums">
              <span className="text-success font-semibold">{doneCount}</span>
              <span className="text-ink-muted ml-1">Done</span>
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ── Nav icons ── */
function BoardIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={active ? "text-primary" : "text-ink-muted"}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function FixesIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={active ? "text-primary" : "text-ink-muted"}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function HistoryIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={active ? "text-primary" : "text-ink-muted"}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={active ? "text-primary" : "text-ink-muted"}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
