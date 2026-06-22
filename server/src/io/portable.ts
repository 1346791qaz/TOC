import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ENTITY_KEYS, type EntityKey } from "@shared/schemas";
import { getDb } from "../db/connection";
import { repos } from "../repositories";

export const EXPORT_FORMAT = "oil-engagement";
export const EXPORT_VERSION = 1;

// Insert order respecting foreign keys (engagements -> streams -> children).
const IMPORT_ORDER: EntityKey[] = [
  "engagements",
  "value_streams",
  "personas",
  "process_steps",
  "assumptions",
  "metrics",
  "step_personas",
  "data_elements",
  "step_data_elements",
  "constraints",
  "flow_edges",
];

export type PortableBundle = {
  format: typeof EXPORT_FORMAT;
  version: number;
  exported_at: string;
  engagement_id: string;
  data: Record<EntityKey, Record<string, unknown>[]>;
};

const bundleSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.number(),
  exported_at: z.string().optional(),
  engagement_id: z.string().optional(),
  data: z.record(z.array(z.record(z.unknown()))),
});

/** Live + soft-deleted rows for an entity, matching an equality filter. */
function listEvery(key: EntityKey, where: Record<string, string>): Record<string, unknown>[] {
  const repo = repos[key];
  return [...repo.list({ where }), ...repo.list({ where, trashed: true })] as Record<
    string,
    unknown
  >[];
}

/** Serialize a whole engagement and all of its descendants into one bundle. */
export function exportEngagement(engagementId: string): PortableBundle {
  const engagement = repos.engagements.get(engagementId, { includeDeleted: true });
  if (!engagement) throw new Error("engagement not found");

  const data = Object.fromEntries(
    ENTITY_KEYS.map((k) => [k, []]),
  ) as unknown as PortableBundle["data"];
  data.engagements = [engagement as Record<string, unknown>];

  const valueStreams = listEvery("value_streams", { engagement_id: engagementId });
  data.value_streams = valueStreams;
  const vsIds = valueStreams.map((v) => v.id as string);

  const stepIds: string[] = [];
  for (const vsId of vsIds) {
    for (const key of ["assumptions", "metrics", "personas", "process_steps", "constraints", "flow_edges", "data_elements"] as EntityKey[]) {
      const rows = listEvery(key, { value_stream_id: vsId });
      data[key].push(...rows);
      if (key === "process_steps") stepIds.push(...rows.map((r) => r.id as string));
    }
  }

  for (const stepId of stepIds) {
    data.step_personas.push(...listEvery("step_personas", { step_id: stepId }));
    data.step_data_elements.push(...listEvery("step_data_elements", { step_id: stepId }));
  }

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    engagement_id: engagementId,
    data,
  };
}

export interface ImportResult {
  remapped: boolean;
  engagement_id: string;
  counts: Record<string, number>;
}

/**
 * Insert a bundle into the current DB. If any incoming id collides with an
 * existing row, every id in the bundle is remapped to a fresh uuid (preserving
 * referential integrity, including polymorphic target/edge references). With no
 * collisions, ids are preserved for a lossless round-trip.
 */
export function importEngagement(raw: unknown): ImportResult {
  const bundle = bundleSchema.parse(raw);
  const data = bundle.data as Record<EntityKey, Record<string, unknown>[]>;

  // Collect every incoming id; detect collisions against existing rows.
  const idMap = new Map<string, string>();
  let collision = false;
  for (const key of IMPORT_ORDER) {
    for (const row of data[key] ?? []) {
      const oldId = row.id as string;
      idMap.set(oldId, oldId);
      if (repos[key].get(oldId, { includeDeleted: true })) collision = true;
    }
  }
  if (collision) {
    for (const oldId of idMap.keys()) idMap.set(oldId, randomUUID());
  }

  // Any field value that is itself a known id gets remapped — this covers FKs
  // and the polymorphic target_id / from_id / to_id references generically.
  const remapRow = (row: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === "string" && idMap.has(v) ? idMap.get(v) : v;
    }
    return out;
  };

  const counts: Record<string, number> = {};
  const tx = getDb().transaction(() => {
    for (const key of IMPORT_ORDER) {
      const rows = data[key] ?? [];
      for (const row of rows) repos[key].insertRaw(remapRow(row));
      counts[key] = rows.length;
    }
  });
  tx();

  const newEngagementId = idMap.get(bundle.engagement_id ?? data.engagements[0]?.id as string) ??
    (data.engagements[0]?.id as string);

  return { remapped: collision, engagement_id: newEngagementId, counts };
}
