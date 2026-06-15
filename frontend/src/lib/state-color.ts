const DEFAULT_COLORS: Record<string, string> = {
  done: "#5db872",
  closed: "#5db872",
  completed: "#5db872",
  resolved: "#5db8a6",
  "in progress": "#e8a55a",
  active: "#e8a55a",
  committed: "#c4944a",
  "to do": "#cc785c",
  new: "#cc785c",
  removed: "#c64545",
  blocked: "#c64545",
};

const FALLBACK_COLOR = "#6c6a64";

export function getStateColor(
  state: string,
  colorMap?: Record<string, string>,
): string {
  if (colorMap) {
    return colorMap[state.toLowerCase()] || FALLBACK_COLOR;
  }
  return DEFAULT_COLORS[state.toLowerCase()] || FALLBACK_COLOR;
}
