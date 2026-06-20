import { useNavigate, useLocation } from "react-router";
import { useCallback, useEffect, useState } from "react";
import { LayoutGrid, Wrench, Clock, Settings, PanelLeftClose, PanelLeftOpen } from "lucide-react";

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
                <PanelLeftClose size={16} />
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
              <PanelLeftOpen size={16} />
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
  return <LayoutGrid size={18} className={active ? "text-primary" : ""} />;
}
function FixesIcon({ active }: { active: boolean }) {
  return <Wrench size={18} className={active ? "text-primary" : ""} />;
}
function HistoryIcon({ active }: { active: boolean }) {
  return <Clock size={18} className={active ? "text-primary" : ""} />;
}
function SettingsIcon({ active }: { active: boolean }) {
  return <Settings size={18} className={active ? "text-primary" : ""} />;
}
