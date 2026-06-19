import { useOutletContext } from "react-router";
import { BoardView } from "@/components/BoardView";
import type { BoardData } from "@/types/api";

interface RouteContext {
  incompleteStates: string[];
  stateColors: Record<string, string>;
  boardData?: BoardData;
  boardError: boolean;
  boardErrorDetail: Error | null;
}

export function BoardRoute() {
  const { incompleteStates, stateColors, boardData, boardError, boardErrorDetail } =
    useOutletContext<RouteContext>();

  return (
    <BoardView
      data={boardData}
      incompleteStates={incompleteStates}
      stateColors={stateColors}
      isError={boardError}
      error={boardErrorDetail}
    />
  );
}
