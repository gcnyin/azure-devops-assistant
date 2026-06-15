import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  BoardData,
  FixItem,
  SnapshotItem,
  SnapshotDetail,
  DiffSnapshotData,
  AppConfig,
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

export function useBoardData(view: string) {
  return useQuery<BoardData>({
    queryKey: ["board", view],
    queryFn: () => fetchJson(`/api/data?view=${view}`),
    refetchInterval: 60_000,
  });
}

export function useFixes() {
  return useQuery<FixItem[]>({
    queryKey: ["fixes"],
    queryFn: () => fetchJson("/api/fixes"),
    refetchInterval: 60_000,
  });
}

export function useFixesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchJson<{ ok: boolean; error?: string; message?: string }>(
        "/api/fixes/run",
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fixes"] });
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
