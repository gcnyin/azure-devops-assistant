import { useSearchParams, Outlet, useNavigate } from "react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Header } from "@/components/Header";
import { useBoardData, useConfig, useSprints } from "@/hooks/useApi";

export function AppLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const view = searchParams.get("view") || "all";
  const sprintParam = searchParams.get("sprint") || "";
  const pathname = window.location.pathname;
  const { data: boardData } = useBoardData(view, sprintParam);
  const { data: config } = useConfig();
  const { data: sprintsData } = useSprints();

  // 当 sprints 数据加载完成后，如果 URL 中没有 sprint 参数，自动设为当前 Sprint
  const activeSprint = sprintParam || sprintsData?.current_sprint || "";

  let activeTab = "board";
  if (pathname.startsWith("/fixes")) activeTab = "fixes";
  else if (pathname.startsWith("/history")) activeTab = "history";

  const handleSprintChange = (sprint: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (sprint === sprintsData?.current_sprint) {
        next.delete("sprint");
      } else {
        next.set("sprint", sprint);
      }
      return next;
    });
  };

  const handleExport = () => {
    const url = `/api/export?format=csv&view=${view}`;
    const link = document.createElement("a");
    link.href = url;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6 pb-24 sm:pt-6 sm:pb-16">
      <Header
        data={boardData}
        sprintsData={sprintsData}
        selectedSprint={activeSprint}
        onSprintChange={handleSprintChange}
        onExport={handleExport}
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          if (v === "board") navigate("/");
          else navigate(`/${v}`);
        }}
        className="mb-6"
      >
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="fixes">AI Fixes</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
      </Tabs>

      <Outlet
        context={{
          incompleteStates: config?.incomplete_states || [],
          stateColors: config?.state_colors || {},
          boardData,
        }}
      />
    </div>
  );
}
