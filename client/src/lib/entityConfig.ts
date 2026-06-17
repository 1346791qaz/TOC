import {
  ASSUMPTION_STATUSES,
  BINDING_POINTS,
  METRIC_TYPES,
  PRESENCE,
  SCOPE_LEVELS,
} from "@shared/enums";

export type FieldType = "text" | "textarea" | "number" | "boolean" | "select";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  /** Static options for a select. */
  options?: readonly string[];
  /** Pull select options at render time from a dynamicOptions[key] list. */
  optionsKey?: string;
  required?: boolean;
  full?: boolean;
  placeholder?: string;
}

export const engagementFields: FieldDef[] = [
  { name: "name", label: "Name", type: "text", required: true, full: true },
  { name: "client_org", label: "Client / Org", type: "text", full: true },
  { name: "notes", label: "Notes", type: "textarea", full: true },
];

export const valueStreamFields: FieldDef[] = [
  { name: "name", label: "Name", type: "text", required: true, full: true },
  { name: "scope_level", label: "Scope", type: "select", options: SCOPE_LEVELS },
  { name: "problem_statement", label: "Problem statement (entry point)", type: "textarea", full: true },
  { name: "narrative", label: "Narrative", type: "textarea", full: true },
];

export const personaFields: FieldDef[] = [
  { name: "name", label: "Name / Role", type: "text", required: true, full: true },
  { name: "role_title", label: "Role title", type: "text" },
  { name: "function", label: "Function / Dept", type: "text" },
  { name: "scope_level", label: "Scope", type: "select", options: SCOPE_LEVELS },
  { name: "responsibilities", label: "Responsibilities", type: "textarea", full: true },
  { name: "authority_notes", label: "Authority / decision rights", type: "textarea", full: true },
];

export const processStepFields: FieldDef[] = [
  { name: "name", label: "Step name", type: "text", required: true, full: true },
  { name: "sequence_index", label: "Sequence #", type: "number" },
  { name: "cycle_time", label: "Cycle time", type: "number" },
  { name: "wait_time", label: "Wait time", type: "number" },
  { name: "pct_complete_accurate", label: "% C&A", type: "number" },
  { name: "entry_criteria", label: "Entry criteria", type: "textarea", full: true },
  { name: "action", label: "Action", type: "textarea", full: true },
  { name: "exit_criteria", label: "Exit criteria", type: "textarea", full: true },
];

export const dataElementFields: FieldDef[] = [
  { name: "step_id", label: "Process step", type: "select", optionsKey: "steps", required: true, full: true },
  { name: "name", label: "Data element", type: "text", required: true, full: true },
  { name: "binding_point", label: "Binding point", type: "select", options: BINDING_POINTS },
  { name: "presence", label: "Presence", type: "select", options: PRESENCE },
  { name: "data_type", label: "Data type", type: "text" },
  { name: "source_system", label: "Source system", type: "text" },
  { name: "is_key", label: "Key data component", type: "boolean" },
  { name: "quality_notes", label: "Quality notes", type: "textarea", full: true },
];

export const metricFields: FieldDef[] = [
  { name: "name", label: "Metric", type: "text", required: true, full: true },
  { name: "metric_type", label: "Type", type: "select", options: METRIC_TYPES },
  { name: "unit", label: "Unit", type: "text" },
  { name: "is_leading", label: "Leading indicator", type: "boolean" },
  { name: "baseline_value", label: "Baseline", type: "number" },
  { name: "current_value", label: "Current", type: "number" },
  { name: "target_value", label: "Target", type: "number" },
  { name: "source", label: "Source", type: "text", full: true },
];

export const assumptionFields: FieldDef[] = [
  { name: "statement", label: "Assumption", type: "textarea", required: true, full: true },
  { name: "status", label: "Status", type: "select", options: ASSUMPTION_STATUSES },
  { name: "evidence", label: "Evidence", type: "textarea", full: true },
];
