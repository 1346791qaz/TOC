import type { EntityKey } from "@shared/schemas";
import type { DataGapReport } from "@shared/gaps";
import type { ConstraintCandidate } from "@shared/scoring";

const BASE = "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (body && (body.message || body.error)) || `Request failed (${res.status})`;
    throw new ApiError(String(msg), res.status, body);
  }
  return body as T;
}

export interface ListParams {
  where?: Record<string, string>;
  trashed?: boolean;
  orderBy?: string;
}

function listQuery(params?: ListParams): string {
  const qs = new URLSearchParams();
  if (params?.where) for (const [k, v] of Object.entries(params.where)) qs.set(k, v);
  if (params?.trashed) qs.set("trashed", "true");
  if (params?.orderBy) qs.set("orderBy", params.orderBy);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export const api = {
  list: <T>(key: EntityKey, params?: ListParams) =>
    request<T[]>(`/${key}${listQuery(params)}`),
  get: <T>(key: EntityKey, id: string) => request<T>(`/${key}/${id}`),
  create: <T>(key: EntityKey, data: unknown) =>
    request<T>(`/${key}`, { method: "POST", body: JSON.stringify(data) }),
  update: <T>(key: EntityKey, id: string, data: unknown) =>
    request<T>(`/${key}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (key: EntityKey, id: string) => request<void>(`/${key}/${id}`, { method: "DELETE" }),
  restore: <T>(key: EntityKey, id: string) =>
    request<T>(`/${key}/${id}/restore`, { method: "POST" }),

  // analytics
  gaps: (vsId: string) => request<DataGapReport>(`/analytics/gaps/${vsId}`),
  candidates: (vsId: string) => request<ConstraintCandidate[]>(`/analytics/candidates/${vsId}`),
  systemConstraintCheck: (vsId: string) =>
    request<{ active_count: number; system_flagged_count: number; warning: string | null }>(
      `/analytics/system-constraint-check/${vsId}`,
    ),

  // io
  exportEngagement: (id: string) => request<unknown>(`/io/export/${id}`),
  importEngagement: (bundle: unknown) =>
    request<{ remapped: boolean; engagement_id: string; counts: Record<string, number> }>(
      `/io/import`,
      { method: "POST", body: JSON.stringify(bundle) },
    ),
  previewStructured: (payload: { value_stream_id: string; kind: string; rows: unknown[] }) =>
    request<{
      kind: string;
      totalRows: number;
      conflicts: Array<{
        rowIndex: number;
        incoming: Record<string, unknown>;
        existingId: string;
        existingKey: string;
        score: number;
      }>;
    }>(`/io/import-structured/preview`, { method: "POST", body: JSON.stringify(payload) }),

  importStructured: (payload: {
    value_stream_id: string;
    kind: string;
    rows: unknown[];
    resolutions?: Array<{ rowIndex: number; action: "skip" | "replace" | "add"; existingId?: string }>;
  }) =>
    request<{ created: number; replaced: number; skipped: number; warnings: string[] }>(
      `/io/import-structured`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
};
