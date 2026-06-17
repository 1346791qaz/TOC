import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { EntityKey } from "@shared/schemas";
import { api, type ListParams } from "./api";

const entityKey = (key: EntityKey, params?: ListParams) =>
  ["entity", key, params ?? {}] as const;

export function useList<T>(key: EntityKey, params?: ListParams, enabled = true) {
  return useQuery({
    queryKey: entityKey(key, params),
    queryFn: () => api.list<T>(key, params),
    enabled,
  });
}

// A local-first app: after any write, refresh everything derived. Cheap and
// keeps the canvas / gap report / candidate panel perfectly in sync.
function invalidateAll(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["entity"] });
  qc.invalidateQueries({ queryKey: ["analytics"] });
}

export function useCreate<T>(key: EntityKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => api.create<T>(key, data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdate<T>(key: EntityKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => api.update<T>(key, id, data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSoftDelete(key: EntityKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.remove(key, id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useRestore<T>(key: EntityKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.restore<T>(key, id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useGaps(vsId: string | null) {
  return useQuery({
    queryKey: ["analytics", "gaps", vsId],
    queryFn: () => api.gaps(vsId as string),
    enabled: !!vsId,
  });
}

export function useCandidates(vsId: string | null) {
  return useQuery({
    queryKey: ["analytics", "candidates", vsId],
    queryFn: () => api.candidates(vsId as string),
    enabled: !!vsId,
  });
}

export function useSystemConstraintCheck(vsId: string | null) {
  return useQuery({
    queryKey: ["analytics", "system-check", vsId],
    queryFn: () => api.systemConstraintCheck(vsId as string),
    enabled: !!vsId,
  });
}
