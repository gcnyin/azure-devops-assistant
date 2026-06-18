const DEFAULT_COLORS: Record<string, string> = {
  done: "#59d499",
  closed: "#59d499",
  completed: "#59d499",
  resolved: "#3aad7f",
  "in progress": "#ffc533",
  active: "#ffc533",
  committed: "#e5a81c",
  "to do": "#57c1ff",
  new: "#57c1ff",
  removed: "#ff6161",
  blocked: "#ff6161",
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
