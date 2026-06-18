import { z } from "zod";
import {
  assumptionStatusSchema,
  bindingPointSchema,
  constraintKindSchema,
  constraintTargetTypeSchema,
  edgeTypeSchema,
  flowNodeTypeSchema,
  likelihoodSchema,
  metricTypeSchema,
  presenceSchema,
  raciRoleSchema,
  scopeLevelSchema,
  severitySchema,
  tocStatusSchema,
} from "./enums";

// ---------------------------------------------------------------------------
// Base record fields shared by every entity. Timestamps are ISO-8601 strings;
// deleted_at is null for live rows and a timestamp for soft-deleted rows.
// ---------------------------------------------------------------------------
export const baseRecordSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

/** Build the {record, createInput, updateInput} trio for an entity. */
function makeEntity<T extends z.ZodRawShape>(fields: T) {
  const record = baseRecordSchema.extend(fields);
  const createInput = z.object(fields).strict();
  const updateInput = z.object(fields).partial().strict();
  return { record, createInput, updateInput };
}

const nullableText = z.string().nullable().default(null);
const nullableNumber = z.number().nullable().default(null);

// ---------------------------------------------------------------------------
// 4.1 engagements
// ---------------------------------------------------------------------------
export const engagement = makeEntity({
  name: z.string().min(1, "Name is required"),
  client_org: nullableText,
  notes: nullableText,
});
export type Engagement = z.infer<typeof engagement.record>;
export type EngagementCreate = z.infer<typeof engagement.createInput>;

// ---------------------------------------------------------------------------
// 4.2 value_streams
// ---------------------------------------------------------------------------
export const valueStream = makeEntity({
  engagement_id: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  problem_statement: nullableText,
  scope_level: scopeLevelSchema.default("local"),
  narrative: nullableText,
});
export type ValueStream = z.infer<typeof valueStream.record>;
export type ValueStreamCreate = z.infer<typeof valueStream.createInput>;

// ---------------------------------------------------------------------------
// 4.3 assumptions
// ---------------------------------------------------------------------------
export const assumption = makeEntity({
  value_stream_id: z.string().uuid(),
  statement: z.string().min(1, "Statement is required"),
  status: assumptionStatusSchema.default("unvalidated"),
  evidence: nullableText,
});
export type Assumption = z.infer<typeof assumption.record>;

// ---------------------------------------------------------------------------
// 4.4 metrics
// ---------------------------------------------------------------------------
export const metric = makeEntity({
  value_stream_id: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  unit: nullableText,
  metric_type: metricTypeSchema.default("other"),
  baseline_value: nullableNumber,
  current_value: nullableNumber,
  target_value: nullableNumber,
  is_leading: z.boolean().default(false),
  source: nullableText,
});
export type Metric = z.infer<typeof metric.record>;

// ---------------------------------------------------------------------------
// 4.5 personas
// ---------------------------------------------------------------------------
export const persona = makeEntity({
  value_stream_id: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  role_title: nullableText,
  function: nullableText,
  scope_level: scopeLevelSchema.default("local"),
  responsibilities: nullableText,
  authority_notes: nullableText,
});
export type Persona = z.infer<typeof persona.record>;

// ---------------------------------------------------------------------------
// 4.6 process_steps
// ---------------------------------------------------------------------------
export const processStep = makeEntity({
  value_stream_id: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  sequence_index: z.number().int().default(0),
  entry_criteria: nullableText,
  action: nullableText,
  exit_criteria: nullableText,
  pain_points: z
    .string()
    .max(5000, "Pain points must be 5000 characters or fewer")
    .nullable()
    .default(null),
  cycle_time: nullableNumber,
  wait_time: nullableNumber,
  pct_complete_accurate: nullableNumber,
});
export type ProcessStep = z.infer<typeof processStep.record>;

// ---------------------------------------------------------------------------
// 4.7 step_personas (M:N)
// ---------------------------------------------------------------------------
export const stepPersona = makeEntity({
  step_id: z.string().uuid(),
  persona_id: z.string().uuid(),
  role_on_step: raciRoleSchema.default("executor"),
});
export type StepPersona = z.infer<typeof stepPersona.record>;

// ---------------------------------------------------------------------------
// 4.8 data_elements
// ---------------------------------------------------------------------------
export const dataElement = makeEntity({
  step_id: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  binding_point: bindingPointSchema.default("entry"),
  data_type: nullableText,
  source_system: nullableText,
  presence: presenceSchema.default("present"),
  quality_notes: nullableText,
  is_key: z.boolean().default(false),
});
export type DataElement = z.infer<typeof dataElement.record>;

// ---------------------------------------------------------------------------
// 4.9 constraints
// ---------------------------------------------------------------------------
export const constraint = makeEntity({
  value_stream_id: z.string().uuid(),
  title: z.string().min(1, "Title is required"),
  description: nullableText,
  kind: constraintKindSchema.default("constraint"),
  target_type: constraintTargetTypeSchema,
  target_id: z.string().nullable().default(null),
  severity: severitySchema.default("medium"),
  likelihood: likelihoodSchema.nullable().default(null),
  toc_status: tocStatusSchema.default("none"),
  is_system_constraint: z.boolean().default(false),
});
export type Constraint = z.infer<typeof constraint.record>;

// ---------------------------------------------------------------------------
// 4.10 flow_edges
// ---------------------------------------------------------------------------
export const flowEdge = makeEntity({
  value_stream_id: z.string().uuid(),
  from_type: flowNodeTypeSchema,
  from_id: z.string().uuid(),
  to_type: flowNodeTypeSchema,
  to_id: z.string().uuid(),
  edge_type: edgeTypeSchema.default("sequence"),
  notes: nullableText,
});
export type FlowEdge = z.infer<typeof flowEdge.record>;

// ---------------------------------------------------------------------------
// Registry — maps an entity key to its schemas and DB table name. Used by the
// generic CRUD router and the export/import engine.
// ---------------------------------------------------------------------------
export const ENTITIES = {
  engagements: { table: "engagements", schema: engagement },
  value_streams: { table: "value_streams", schema: valueStream },
  assumptions: { table: "assumptions", schema: assumption },
  metrics: { table: "metrics", schema: metric },
  personas: { table: "personas", schema: persona },
  process_steps: { table: "process_steps", schema: processStep },
  step_personas: { table: "step_personas", schema: stepPersona },
  data_elements: { table: "data_elements", schema: dataElement },
  constraints: { table: "constraints", schema: constraint },
  flow_edges: { table: "flow_edges", schema: flowEdge },
} as const;

export type EntityKey = keyof typeof ENTITIES;
export const ENTITY_KEYS = Object.keys(ENTITIES) as EntityKey[];
