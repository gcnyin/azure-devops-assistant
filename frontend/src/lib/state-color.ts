const DEFAULT_COLORS: Record<string, string> = {
  done: "#3ecf8e",
  closed: "#3ecf8e",
  completed: "#3ecf8e",
  resolved: "#24b47e",
  "in progress": "#ffdb13",
  active: "#ffdb13",
  committed: "#e2c800",
  "to do": "#054cff",
  new: "#054cff",
  removed: "#ff2201",
  blocked: "#ff2201",
};

const FALLBACK_COLOR = "#707070";

export function getStateColor(
  state: string,
  colorMap?: Record<string, string>,
): string {
  if (colorMap) {
    return colorMap[state.toLowerCase()] || FALLBACK_COLOR;
  }
  return DEFAULT_COLORS[state.toLowerCase()] || FALLBACK_COLOR;
}
