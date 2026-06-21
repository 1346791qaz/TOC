import { z } from "zod";
import type { ProcessStep } from "@shared/schemas";
import { repos } from "../repositories";

// Structured import for the three bulk-entry entities. Scope boundary (v1):
// structured rows only — no Visio/Lucidchart/BPMN parsing.
export const IMPORTABLE_KINDS = [
  "process_steps",
  "personas",
  "data_elements",
  "assumptions",
  "metrics",
  "constraints",
] as const;
export type ImportableKind = (typeof IMPORTABLE_KINDS)[number];

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

export interface StructuredImportResult {
  kind: ImportableKind;
  created: number;
  skipped: number;
  warnings: string[];
}

export function importStructured(
  valueStreamId: string,
  kind: ImportableKind,
  rows: Record<string, unknown>[],
): StructuredImportResult {
  const vs = repos.value_streams.get(valueStreamId);
  if (!vs) throw new Error("value stream not found");

  const warnings: string[] = [];
  let created = 0;
  let skipped = 0;

  if (kind === "personas") {
    for (const r of rows) {
      const name = str(r.name);
      if (!name) {
        skipped++;
        continue;
      }
      repos.personas.create({
        value_stream_id: valueStreamId,
        name,
        role_title: str(r.role_title),
        function: str(r.function),
        scope_level: (str(r.scope_level) as never) ?? "local",
        responsibilities: str(r.responsibilities),
        authority_notes: str(r.authority_notes),
      });
      created++;
    }
  } else if (kind === "process_steps") {
    const existing = repos.process_steps.list({
      where: { value_stream_id: valueStreamId },
    }) as unknown as ProcessStep[];
    let nextIndex = existing.reduce((m, s) => Math.max(m, s.sequence_index), -1) + 1;
    for (const r of rows) {
      const name = str(r.name);
      if (!name) {
        skipped++;
        continue;
      }
      const seq = num(r.sequence_index);
      repos.process_steps.create({
        value_stream_id: valueStreamId,
        name,
        sequence_index: seq ?? nextIndex++,
        entry_criteria: str(r.entry_criteria),
        action: str(r.action),
        exit_criteria: str(r.exit_criteria),
        cycle_time: num(r.cycle_time),
        wait_time: num(r.wait_time),
        pct_complete_accurate: num(r.pct_complete_accurate),
      });
      created++;
    }
  } else if (kind === "assumptions") {
    for (const r of rows) {
      const statement = str(r.statement);
      if (!statement) { skipped++; continue; }
      const statusVal = str(r.status);
      repos.assumptions.create({
        value_stream_id: valueStreamId,
        statement,
        status: (["unvalidated", "supported", "refuted"].includes(statusVal ?? "")
          ? statusVal
          : "unvalidated") as never,
        evidence: str(r.evidence),
      });
      created++;
    }
  } else if (kind === "metrics") {
    const METRIC_TYPES = ["throughput", "inventory_wip", "operating_expense", "lead_time", "quality", "other"];
    for (const r of rows) {
      const name = str(r.name);
      if (!name) { skipped++; continue; }
      const mtVal = str(r.metric_type);
      repos.metrics.create({
        value_stream_id: valueStreamId,
        name,
        unit: str(r.unit),
        source: str(r.source),
        metric_type: (METRIC_TYPES.includes(mtVal ?? "") ? mtVal : "other") as never,
        baseline_value: num(r.baseline_value),
        current_value: num(r.current_value),
        target_value: num(r.target_value),
        is_leading: bool(r.is_leading),
      });
      created++;
    }
  } else if (kind === "constraints") {
    const KINDS = ["constraint", "risk", "breakdown", "pain_point", "seam"];
    const SEVERITIES = ["low", "medium", "high", "critical"];
    const LIKELIHOODS = ["low", "medium", "high"];
    const TOC = ["none", "identified", "exploit", "subordinate", "elevate", "broken"];
    const TARGET_TYPES = ["step", "persona", "data_element", "edge", "value_stream"];
    for (const r of rows) {
      const title = str(r.title);
      if (!title) { skipped++; continue; }
      const kindVal = str(r.kind);
      const sevVal = str(r.severity);
      const likeVal = str(r.likelihood);
      const tocVal = str(r.toc_status);
      const ttVal = str(r.target_type);
      repos.constraints.create({
        value_stream_id: valueStreamId,
        title,
        description: str(r.description),
        kind: (KINDS.includes(kindVal ?? "") ? kindVal : "constraint") as never,
        target_type: (TARGET_TYPES.includes(ttVal ?? "") ? ttVal : "value_stream") as never,
        target_id: null,
        severity: (SEVERITIES.includes(sevVal ?? "") ? sevVal : "medium") as never,
        likelihood: (LIKELIHOODS.includes(likeVal ?? "") ? likeVal : null) as never,
        toc_status: (TOC.includes(tocVal ?? "") ? tocVal : "none") as never,
        is_system_constraint: bool(r.is_system_constraint),
      });
      created++;
    }
  } else {
    // data_elements — resolve step by name (step_name) within this stream.
    const steps = repos.process_steps.list({
      where: { value_stream_id: valueStreamId },
    }) as unknown as ProcessStep[];
    const byName = new Map(steps.map((s) => [s.name.toLowerCase(), s.id]));
    for (const r of rows) {
      const name = str(r.name);
      const stepName = str(r.step_name);
      const stepId = stepName ? byName.get(stepName.toLowerCase()) : undefined;
      if (!name || !stepId) {
        skipped++;
        if (name && stepName && !stepId) warnings.push(`No step named "${stepName}" for data "${name}"`);
        continue;
      }
      repos.data_elements.create({
        step_id: stepId,
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
      });
      created++;
    }
  }

  return { kind, created, skipped, warnings };
}

export const structuredImportRequestSchema = z.object({
  value_stream_id: z.string().uuid(),
  kind: z.enum(IMPORTABLE_KINDS),
  rows: z.array(z.record(z.unknown())),
});
