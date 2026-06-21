import { z } from "zod";
import type { ProcessStep } from "@shared/schemas";
import { similarity } from "@shared/similarity";
import { repos } from "../repositories";
import { repoFor } from "../repositories";

export const SIMILARITY_THRESHOLD = 0.7;

export const IMPORTABLE_KINDS = [
  "process_steps",
  "personas",
  "data_elements",
  "assumptions",
  "metrics",
  "constraints",
] as const;
export type ImportableKind = (typeof IMPORTABLE_KINDS)[number];

// ── helpers ─────────────────────────────────────────────────────────────────
const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const bool = (v: unknown): boolean =>
  v === true || v === "true" || v === "1" || v === "yes" || v === "y";
const str = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

function kindKey(kind: ImportableKind): string {
  if (kind === "assumptions") return "statement";
  if (kind === "constraints") return "title";
  return "name";
}

// ── public types ─────────────────────────────────────────────────────────────
export interface Resolution {
  rowIndex: number;
  action: "skip" | "replace" | "add";
  existingId?: string;
}

export interface PreviewConflict {
  rowIndex: number;
  incoming: Record<string, unknown>;
  existingId: string;
  existingKey: string;
  score: number;
}

export interface PreviewResult {
  kind: ImportableKind;
  totalRows: number;
  conflicts: PreviewConflict[];
}

export interface StructuredImportResult {
  kind: ImportableKind;
  created: number;
  replaced: number;
  skipped: number;
  warnings: string[];
}

// ── preview (similarity scan, no writes) ────────────────────────────────────
export function previewImport(
  valueStreamId: string,
  kind: ImportableKind,
  rows: Record<string, unknown>[],
): PreviewResult {
  if (!repos.value_streams.get(valueStreamId)) throw new Error("value stream not found");

  const conflicts: PreviewConflict[] = [];

  if (kind === "data_elements") {
    const steps = repos.process_steps.list({
      where: { value_stream_id: valueStreamId },
    }) as unknown as ProcessStep[];
    const stepByName = new Map(steps.map((s) => [s.name.toLowerCase(), s]));
    const deByStep = new Map(
      steps.map((s) => [
        s.id,
        repos.data_elements.list({ where: { step_id: s.id } }) as unknown as Array<{
          id: string;
          name: string;
        }>,
      ]),
    );

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const incomingName = str(r.name);
      const incomingStep = str(r.step_name);
      if (!incomingName || !incomingStep) continue;
      const step = stepByName.get(incomingStep.toLowerCase());
      if (!step) continue;
      let bestScore = 0;
      let bestMatch: { id: string; name: string } | null = null;
      for (const de of deByStep.get(step.id) ?? []) {
        const score = similarity(incomingName, de.name);
        if (score >= SIMILARITY_THRESHOLD && score > bestScore) {
          bestScore = score;
          bestMatch = de;
        }
      }
      if (bestMatch) {
        conflicts.push({
          rowIndex: i,
          incoming: r,
          existingId: bestMatch.id,
          existingKey: `${step.name} › ${bestMatch.name}`,
          score: bestScore,
        });
      }
    }
  } else {
    const key = kindKey(kind);
    const existing = repoFor(kind).list({
      where: { value_stream_id: valueStreamId },
    }) as Array<Record<string, unknown>>;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const incomingKey = str(r[key]);
      if (!incomingKey) continue;
      let bestScore = 0;
      let bestMatch: Record<string, unknown> | null = null;
      for (const ex of existing) {
        const score = similarity(incomingKey, String(ex[key] ?? ""));
        if (score >= SIMILARITY_THRESHOLD && score > bestScore) {
          bestScore = score;
          bestMatch = ex;
        }
      }
      if (bestMatch) {
        conflicts.push({
          rowIndex: i,
          incoming: r,
          existingId: bestMatch.id as string,
          existingKey: String(bestMatch[key] ?? ""),
          score: bestScore,
        });
      }
    }
  }

  return { kind, totalRows: rows.length, conflicts };
}

// ── import (writes to DB) ────────────────────────────────────────────────────
export function importStructured(
  valueStreamId: string,
  kind: ImportableKind,
  rows: Record<string, unknown>[],
  resolutions: Resolution[] = [],
): StructuredImportResult {
  if (!repos.value_streams.get(valueStreamId)) throw new Error("value stream not found");

  const resMap = new Map(resolutions.map((r) => [r.rowIndex, r]));
  const warnings: string[] = [];
  let created = 0;
  let replaced = 0;
  let skipped = 0;

  if (kind === "personas") {
    for (const [i, r] of rows.entries()) {
      const res = resMap.get(i);
      if (res?.action === "skip") { skipped++; continue; }
      const name = str(r.name);
      if (!name) { skipped++; continue; }
      const fields = {
        name,
        role_title: str(r.role_title),
        function: str(r.function),
        scope_level: (str(r.scope_level) as never) ?? "local",
        responsibilities: str(r.responsibilities),
        authority_notes: str(r.authority_notes),
      };
      if (res?.action === "replace" && res.existingId) {
        repos.personas.update(res.existingId, fields);
        replaced++;
      } else {
        repos.personas.create({ value_stream_id: valueStreamId, ...fields });
        created++;
      }
    }
  } else if (kind === "process_steps") {
    const existing = repos.process_steps.list({
      where: { value_stream_id: valueStreamId },
    }) as unknown as ProcessStep[];
    let nextIndex = existing.reduce((m, s) => Math.max(m, s.sequence_index), -1) + 1;
    for (const [i, r] of rows.entries()) {
      const res = resMap.get(i);
      if (res?.action === "skip") { skipped++; continue; }
      const name = str(r.name);
      if (!name) { skipped++; continue; }
      const seq = num(r.sequence_index);
      const fields = {
        name,
        sequence_index: seq ?? nextIndex++,
        entry_criteria: str(r.entry_criteria),
        action: str(r.action),
        exit_criteria: str(r.exit_criteria),
        cycle_time: num(r.cycle_time),
        wait_time: num(r.wait_time),
        pct_complete_accurate: num(r.pct_complete_accurate),
      };
      if (res?.action === "replace" && res.existingId) {
        repos.process_steps.update(res.existingId, fields);
        replaced++;
      } else {
        repos.process_steps.create({ value_stream_id: valueStreamId, ...fields });
        created++;
      }
    }
  } else if (kind === "assumptions") {
    for (const [i, r] of rows.entries()) {
      const res = resMap.get(i);
      if (res?.action === "skip") { skipped++; continue; }
      const statement = str(r.statement);
      if (!statement) { skipped++; continue; }
      const statusVal = str(r.status);
      const fields = {
        statement,
        status: (["unvalidated", "supported", "refuted"].includes(statusVal ?? "")
          ? statusVal
          : "unvalidated") as never,
        evidence: str(r.evidence),
      };
      if (res?.action === "replace" && res.existingId) {
        repos.assumptions.update(res.existingId, fields);
        replaced++;
      } else {
        repos.assumptions.create({ value_stream_id: valueStreamId, ...fields });
        created++;
      }
    }
  } else if (kind === "metrics") {
    const METRIC_TYPES = [
      "throughput",
      "inventory_wip",
      "operating_expense",
      "lead_time",
      "quality",
      "other",
    ];
    for (const [i, r] of rows.entries()) {
      const res = resMap.get(i);
      if (res?.action === "skip") { skipped++; continue; }
      const name = str(r.name);
      if (!name) { skipped++; continue; }
      const mtVal = str(r.metric_type);
      const fields = {
        name,
        unit: str(r.unit),
        source: str(r.source),
        metric_type: (METRIC_TYPES.includes(mtVal ?? "") ? mtVal : "other") as never,
        baseline_value: num(r.baseline_value),
        current_value: num(r.current_value),
        target_value: num(r.target_value),
        is_leading: bool(r.is_leading),
      };
      if (res?.action === "replace" && res.existingId) {
        repos.metrics.update(res.existingId, fields);
        replaced++;
      } else {
        repos.metrics.create({ value_stream_id: valueStreamId, ...fields });
        created++;
      }
    }
  } else if (kind === "constraints") {
    const KINDS = ["constraint", "risk", "breakdown", "pain_point", "seam"];
    const SEVERITIES = ["low", "medium", "high", "critical"];
    const LIKELIHOODS = ["low", "medium", "high"];
    const TOC = ["none", "identified", "exploit", "subordinate", "elevate", "broken"];
    const TARGET_TYPES = ["step", "persona", "data_element", "edge", "value_stream"];
    for (const [i, r] of rows.entries()) {
      const res = resMap.get(i);
      if (res?.action === "skip") { skipped++; continue; }
      const title = str(r.title);
      if (!title) { skipped++; continue; }
      const constraintKind = str(r.kind);
      const sevVal = str(r.severity);
      const likeVal = str(r.likelihood);
      const tocVal = str(r.toc_status);
      const ttVal = str(r.target_type);
      const fields = {
        title,
        description: str(r.description),
        kind: (KINDS.includes(constraintKind ?? "") ? constraintKind : "constraint") as never,
        severity: (SEVERITIES.includes(sevVal ?? "") ? sevVal : "medium") as never,
        likelihood: (LIKELIHOODS.includes(likeVal ?? "") ? likeVal : null) as never,
        toc_status: (TOC.includes(tocVal ?? "") ? tocVal : "none") as never,
        is_system_constraint: bool(r.is_system_constraint),
      };
      if (res?.action === "replace" && res.existingId) {
        repos.constraints.update(res.existingId, fields);
        replaced++;
      } else {
        repos.constraints.create({
          value_stream_id: valueStreamId,
          target_type: (TARGET_TYPES.includes(ttVal ?? "") ? ttVal : "value_stream") as never,
          target_id: null,
          ...fields,
        });
        created++;
      }
    }
  } else {
    // data_elements
    const steps = repos.process_steps.list({
      where: { value_stream_id: valueStreamId },
    }) as unknown as ProcessStep[];
    const byName = new Map(steps.map((s) => [s.name.toLowerCase(), s.id]));
    for (const [i, r] of rows.entries()) {
      const res = resMap.get(i);
      if (res?.action === "skip") { skipped++; continue; }
      const name = str(r.name);
      const stepName = str(r.step_name);
      const stepId = stepName ? byName.get(stepName.toLowerCase()) : undefined;
      if (!name || !stepId) {
        skipped++;
        if (name && stepName && !stepId) warnings.push(`No step named "${stepName}" for data "${name}"`);
        continue;
      }
      const fields = {
        name,
        business_description: str(r.business_description),
        binding_point: (str(r.binding_point) as never) ?? "entry",
        data_type: str(r.data_type),
        source_system: str(r.source_system),
        table_or_view: str(r.table_or_view),
        field_name: str(r.field_name),
        example_value: str(r.example_value),
        presence: (str(r.presence) as never) ?? "present",
        quality_notes: str(r.quality_notes),
        is_key: bool(r.is_key),
      };
      if (res?.action === "replace" && res.existingId) {
        repos.data_elements.update(res.existingId, fields);
        replaced++;
      } else {
        repos.data_elements.create({ step_id: stepId, ...fields });
        created++;
      }
    }
  }

  return { kind, created, replaced, skipped, warnings };
}

// ── zod schemas ───────────────────────────────────────────────────────────────
export const resolutionSchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  action: z.enum(["skip", "replace", "add"]),
  existingId: z.string().optional(),
});

export const structuredImportRequestSchema = z.object({
  value_stream_id: z.string().uuid(),
  kind: z.enum(IMPORTABLE_KINDS),
  rows: z.array(z.record(z.unknown())),
  resolutions: z.array(resolutionSchema).optional().default([]),
});

export const previewRequestSchema = z.object({
  value_stream_id: z.string().uuid(),
  kind: z.enum(IMPORTABLE_KINDS),
  rows: z.array(z.record(z.unknown())),
});
