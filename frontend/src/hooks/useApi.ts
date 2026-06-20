import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  BoardData,
  FixItem,
  SnapshotItem,
  SnapshotDetail,
  DiffSnapshotData,
  AppConfig,
  SprintsResponse,
  SettingsData,
  SaveSettingsResult,
} from "@/types/api";

const API_BASE = "";

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(`${API_BASE}${url}`);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  }
  return resp.json();
}

export function useConfig() {
  return useQuery<AppConfig>({
    queryKey: ["config"],
    queryFn: () => fetchJson("/api/config"),
    staleTime: Infinity,
  });
}

export function useBoardData(view: string, sprintName?: string) {
  const params = new URLSearchParams();
  params.set("view", view);
  if (sprintName) params.set("sprint", sprintName);
  const qs = params.toString();
  return useQuery<BoardData>({
    queryKey: ["board", view, sprintName || ""],
    queryFn: () => fetchJson(`/api/data?${qs}`),
    refetchInterval: sprintName ? 0 : 60_000,
  });
}

export function useSprints() {
  return useQuery<SprintsResponse>({
    queryKey: ["sprints"],
    queryFn: () => fetchJson("/api/sprints"),
    staleTime: 30_000,
  });
}

export function useRefreshMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetch("/api/refresh", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board"] });
    },
  });
}

export function useFixes(status?: string, bugId?: number) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (bugId) params.set("bug_id", String(bugId));
  const qs = params.toString();
  return useQuery<FixItem[]>({
    queryKey: ["fixes", status, bugId],
    queryFn: () =>
      fetchJson<FixItem[]>(`/api/fixes${qs ? `?${qs}` : ""}`).then((items) =>
        items.map((item) => ({
          ...item,
          repo_results:
            typeof item.repo_results === "string"
              ? JSON.parse(item.repo_results)
              : item.repo_results,
        }))
      ),
    refetchInterval: 15_000,
  });
}

export function useFixesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bugIds: number[]) =>
      fetch("/api/fixes/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bug_ids: bugIds }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fixes"] });
      queryClient.invalidateQueries({ queryKey: ["board"] });
    },
  });
}

export function useCancelFixMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: number) =>
      fetch(`/api/fixes/${taskId}/cancel`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fixes"] });
      queryClient.invalidateQueries({ queryKey: ["board"] });
    },
  });
}

export function useHistory() {
  return useQuery<SnapshotItem[]>({
    queryKey: ["history"],
    queryFn: () => fetchJson("/api/history"),
    refetchInterval: 60_000,
  });
}

export function useSnapshot(id: number) {
  return useQuery<SnapshotDetail>({
    queryKey: ["snapshot", id],
    queryFn: () => fetchJson(`/api/history/${id}`),
    enabled: !!id && !isNaN(id),
  });
}

export function useSnapshotDiff(idA: number, idB: number) {
  return useQuery<DiffSnapshotData>({
    queryKey: ["diff", idA, idB],
    queryFn: () => fetchJson(`/api/history/diff/${idA}/${idB}`),
    enabled: !!idA && !!idB && !isNaN(idA) && !isNaN(idB),
  });
}

export function useSettings() {
  return useQuery<SettingsData>({
    queryKey: ["settings"],
    queryFn: () => fetchJson("/api/settings"),
    staleTime: 10_000,
  });
}

export function useAgents() {
  return useQuery<{ agents: { name: string; available: boolean; description: string }[] }>({
    queryKey: ["agents"],
    queryFn: () => fetchJson("/api/agents"),
    staleTime: 30_000,
  });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SettingsData) =>
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()) as Promise<SaveSettingsResult>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
  });
}
