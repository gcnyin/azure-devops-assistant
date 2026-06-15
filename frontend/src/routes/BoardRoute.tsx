import { useOutletContext } from "react-router";
import { BoardView } from "@/components/BoardView";
import type { BoardData } from "@/types/api";

interface RouteContext {
  incompleteStates: string[];
  stateColors: Record<string, string>;
  boardData?: BoardData;
}

export function BoardRoute() {
  const { incompleteStates, stateColors, boardData } =
    useOutletContext<RouteContext>();

  return (
    <BoardView
      data={boardData}
      incompleteStates={incompleteStates}
      stateColors={stateColors}
    />
  );
}
