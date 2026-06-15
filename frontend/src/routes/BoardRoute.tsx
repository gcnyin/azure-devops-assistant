import { useOutletContext } from "react-router";
import { BoardView } from "@/components/BoardView";
import type { BoardData } from "@/types/api";

interface RouteContext {
  incompleteStates: string[];
  stateColors: Record<string, string>;
  boardData?: BoardData;
  isBoardError: boolean;
}

export function BoardRoute() {
  const { incompleteStates, stateColors, boardData, isBoardError } =
    useOutletContext<RouteContext>();

  return (
    <BoardView
      data={boardData}
      isError={isBoardError}
      incompleteStates={incompleteStates}
      stateColors={stateColors}
    />
  );
}
