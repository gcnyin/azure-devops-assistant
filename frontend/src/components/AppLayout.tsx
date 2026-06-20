import { useState, useCallback } from "react";
import { useSearchParams, Outlet } from "react-router";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { useBoardData, useConfig } from "@/hooks/useApi";

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchParams] = useSearchParams();
  const sprintParam = searchParams.get("sprint") || "";
  const { data: boardData, isError: boardError, error: boardErrorDetail } = useBoardData("all", sprintParam);
  const { data: config } = useConfig();

  const toggleSidebar = useCallback(() => setSidebarCollapsed((prev) => !prev), []);
  const handleExport = useCallback(() => {
    const params = new URLSearchParams({ format: "csv", view: "all" });
    if (sprintParam) params.set("sprint", sprintParam);
    const link = document.createElement("a"); link.href = `/api/export?${params}`; link.download = "";
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  }, [sprintParam]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header data={boardData} onExport={handleExport} />
        <main className="flex-1 overflow-auto bg-canvas">
          <div className="px-4 py-3">
            <Outlet context={{ incompleteStates: config?.incomplete_states || [], stateColors: config?.state_colors || {}, boardData, boardError, boardErrorDetail }} />
          </div>
        </main>
      </div>
    </div>
  );
}
