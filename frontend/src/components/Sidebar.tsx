import { useNavigate, useLocation } from "react-router";
import { useCallback, useEffect, useState } from "react";

interface SidebarProps { collapsed: boolean; onToggle: () => void; }

const NAV_ITEMS = [
  { id: "board", path: "/", label: "Board", icon: BoardIcon },
  { id: "fixes", path: "/fixes", label: "AI Fixes", icon: FixesIcon },
  { id: "history", path: "/history", label: "History", icon: HistoryIcon },
  { id: "settings", path: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Below md (768px): always collapsed, ignore manual toggle
  const effectiveCollapsed = isMobile ? true : collapsed;

  const pathname = location.pathname;
  let activeId = "board";
  if (pathname.startsWith("/fixes")) activeId = "fixes";
  else if (pathname.startsWith("/history")) activeId = "history";
  else if (pathname.startsWith("/settings")) activeId = "settings";

  const handleNav = useCallback((path: string) => { navigate(path); }, [navigate]);

  return (
    <aside
      className={`flex flex-col bg-sidebar h-screen sticky top-0 transition-all duration-200 shrink-0 ${
        effectiveCollapsed ? "w-[56px]" : "w-[220px]"
      }`}
    >
      {/* Logo / Title */}
      <div className={`flex items-center h-14 px-3 ${isMobile ? "justify-center" : effectiveCollapsed ? "justify-center" : ""}`}>
        {!effectiveCollapsed ? (
          <>
            <img src="/logo.svg" alt="Logo" className="w-6 h-6 shrink-0" />
            <span className="text-sm font-medium text-on-dark truncate ml-2.5 flex-1">Sprint Monitor</span>
            {!isMobile && (
              <button
                onClick={onToggle}
                className="p-1.5 rounded-md text-on-dark-soft hover:text-on-dark hover:bg-sidebar-hover transition-colors"
                title="Collapse"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /><path d="M10 9l-3 3 3 3" />
                </svg>
              </button>
            )}
          </>
        ) : (
          !isMobile && (
            <button
              onClick={onToggle}
              className="p-1.5 rounded-md text-on-dark-soft hover:text-on-dark hover:bg-sidebar-hover transition-colors"
              title="Expand"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /><path d="M14 9l3 3-3 3" />
              </svg>
            </button>
          )
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.path)}
              className={`flex items-center gap-3 w-full rounded-[8px] text-[14px] font-medium transition-colors ${
                effectiveCollapsed ? "justify-center px-0 py-2.5" : "px-3 py-2"
              } ${
                isActive
                  ? "bg-sidebar-active text-primary"
                  : "text-on-dark-soft hover:text-on-dark hover:bg-sidebar-hover"
              }`}
              title={effectiveCollapsed ? item.label : undefined}
            >
              <item.icon active={isActive} />
              {!effectiveCollapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function BoardIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={active ? "text-primary" : ""}>
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function FixesIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={active ? "text-primary" : ""}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
function HistoryIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={active ? "text-primary" : ""}>
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={active ? "text-primary" : ""}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
