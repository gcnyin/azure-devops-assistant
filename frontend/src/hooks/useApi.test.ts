import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useConfig,
  useBoardData,
  useSprints,
  useFixes,
  useHistory,
  useSnapshot,
  useSnapshotDiff,
} from "./useApi";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("useConfig", () => {
  it("fetches config from /api/config", async () => {
    const mockConfig = {
      incomplete_states: ["Active", "New"],
      state_colors: { Active: "#0052cc" },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConfig),
    } as Response);

    const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockConfig);
    expect(fetch).toHaveBeenCalledWith("/api/config");
  });

  it("handles HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    const { result } = renderHook(() => useConfig(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });
});

describe("useBoardData", () => {
  it("includes view and sprint in query key and URL", async () => {
    const mockData = {
      iteration: { id: "1", name: "Sprint 1", path: "\\", startDate: "", finishDate: "" },
      items: [],
      diff_info: null,
      last_update: "",
      assigned_to: "",
      team_name: "",
      project: "",
      offline: false,
      error: "",
      view_mode: "all" as const,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    } as Response);

    const { result } = renderHook(() => useBoardData("me", "Sprint 1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(fetch).toHaveBeenCalledWith("/api/data?view=me&sprint=Sprint+1");
  });

  it("omits sprint param when sprintName is undefined", async () => {
    const mockData = {
      iteration: { id: "1", name: "Sprint 1", path: "\\", startDate: "", finishDate: "" },
      items: [],
      diff_info: null,
      last_update: "",
      assigned_to: "",
      team_name: "",
      project: "",
      offline: false,
      error: "",
      view_mode: "all" as const,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    } as Response);

    const { result } = renderHook(() => useBoardData("all"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // sprint param should not be in URL
    expect(fetch).toHaveBeenCalledWith("/api/data?view=all");
  });
});

describe("useSprints", () => {
  it("fetches sprints from /api/sprints", async () => {
    const mockSprints = {
      sprints: [{ sprint_name: "Sprint 1", team_name: "Team A", snapshot_count: 3 }],
      current_sprint: "Sprint 1",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSprints),
    } as Response);

    const { result } = renderHook(() => useSprints(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockSprints);
  });
});

describe("useFixes", () => {
  it("fetches fixes and parses repo_results if string", async () => {
    const mockFixes = [
      {
        id: 1,
        bug_id: 100,
        bug_title: "Login bug",
        work_item_type: "Bug",
        sprint_name: "Sprint 1",
        status: "completed",
        agent_name: null,
        prompt: null,
        response: null,
        error: null,
        repo_results: JSON.stringify([{ path: "/repo", commit_sha: "abc123" }]),
        created_at: "2025-01-01T00:00:00Z",
        started_at: null,
        finished_at: null,
      },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFixes),
    } as Response);

    const { result } = renderHook(() => useFixes(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].repo_results).toEqual([{ path: "/repo", commit_sha: "abc123" }]);
  });

  it("keeps repo_results as-is if already an object", async () => {
    const mockFixes = [
      {
        id: 2,
        bug_id: 200,
        bug_title: "Bug 2",
        work_item_type: "Bug",
        sprint_name: "Sprint 1",
        status: "completed",
        agent_name: null,
        prompt: null,
        response: null,
        error: null,
        repo_results: [{ path: "/repo", commit_sha: "def456" }],
        created_at: "2025-01-01T00:00:00Z",
        started_at: null,
        finished_at: null,
      },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFixes),
    } as Response);

    const { result } = renderHook(() => useFixes(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0].repo_results).toEqual([{ path: "/repo", commit_sha: "def456" }]);
  });

  it("includes status and bug_id in query params", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    renderHook(() => useFixes("completed", 100), { wrapper: createWrapper() });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/fixes?status=completed&bug_id=100"),
    );
  });
});

describe("useHistory", () => {
  it("fetches history from /api/history", async () => {
    const mockSnapshots = [
      { id: 1, sprint_name: "Sprint 1", fetched_at: "", item_count: 10, team_name: "Team A" },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSnapshots),
    } as Response);

    const { result } = renderHook(() => useHistory(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockSnapshots);
  });
});

describe("useSnapshot", () => {
  it("fetches snapshot detail by id", async () => {
    const mockDetail = {
      meta: { id: 1, sprint_name: "Sprint 1", fetched_at: "", team_name: "Team A", item_count: 5 },
      items: [],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDetail),
    } as Response);

    const { result } = renderHook(() => useSnapshot(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockDetail);
    expect(fetch).toHaveBeenCalledWith("/api/history/1");
  });

  it("does not fetch when id is NaN", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    renderHook(() => useSnapshot(NaN), { wrapper: createWrapper() });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not fetch when id is 0 (falsy)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    renderHook(() => useSnapshot(0), { wrapper: createWrapper() });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("useSnapshotDiff", () => {
  it("fetches diff between two snapshot ids", async () => {
    const mockDiff = {
      snapshot_a: { id: 1, sprint_name: "Sprint 1", fetched_at: "" },
      snapshot_b: { id: 2, sprint_name: "Sprint 2", fetched_at: "" },
      diff: { prev_time: "", new_items: [], continuing_items: [], gone_items: [] },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDiff),
    } as Response);

    const { result } = renderHook(() => useSnapshotDiff(1, 2), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockDiff);
    expect(fetch).toHaveBeenCalledWith("/api/history/diff/1/2");
  });

  it("does not fetch when either id is falsy", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    renderHook(() => useSnapshotDiff(0, 2), { wrapper: createWrapper() });
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockClear();
    renderHook(() => useSnapshotDiff(1, 0), { wrapper: createWrapper() });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
