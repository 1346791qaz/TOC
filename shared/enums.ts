import { z } from "zod";

// Centralized enum definitions. Arrays are exported so the UI can render
// option lists from the same source of truth the validators use.

export const SCOPE_LEVELS = ["local", "stream", "system"] as const;
export const scopeLevelSchema = z.enum(SCOPE_LEVELS);
export type ScopeLevel = z.infer<typeof scopeLevelSchema>;

export const ASSUMPTION_STATUSES = ["unvalidated", "supported", "refuted"] as const;
export const assumptionStatusSchema = z.enum(ASSUMPTION_STATUSES);
export type AssumptionStatus = z.infer<typeof assumptionStatusSchema>;

export const METRIC_TYPES = [
  "throughput",
  "inventory_wip",
  "operating_expense",
  "lead_time",
  "quality",
  "other",
] as const;
export const metricTypeSchema = z.enum(METRIC_TYPES);
export type MetricType = z.infer<typeof metricTypeSchema>;

export const RACI_ROLES = ["executor", "approver", "consulted", "informed"] as const;
export const raciRoleSchema = z.enum(RACI_ROLES);
export type RaciRole = z.infer<typeof raciRoleSchema>;

export const BINDING_POINTS = ["entry", "action", "exit"] as const;
export const bindingPointSchema = z.enum(BINDING_POINTS);
export type BindingPoint = z.infer<typeof bindingPointSchema>;

export const PRESENCE = ["present", "partial", "missing"] as const;
export const presenceSchema = z.enum(PRESENCE);
export type Presence = z.infer<typeof presenceSchema>;

export const CONSTRAINT_KINDS = [
  "constraint",
  "risk",
  "breakdown",
  "pain_point",
  "seam",
] as const;
export const constraintKindSchema = z.enum(CONSTRAINT_KINDS);
export type ConstraintKind = z.infer<typeof constraintKindSchema>;

export const CONSTRAINT_TARGET_TYPES = [
  "step",
  "persona",
  "data_element",
  "edge",
  "value_stream",
] as const;
export const constraintTargetTypeSchema = z.enum(CONSTRAINT_TARGET_TYPES);
export type ConstraintTargetType = z.infer<typeof constraintTargetTypeSchema>;

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const severitySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof severitySchema>;

export const LIKELIHOODS = ["low", "medium", "high"] as const;
export const likelihoodSchema = z.enum(LIKELIHOODS);
export type Likelihood = z.infer<typeof likelihoodSchema>;

// The Five Focusing Steps lifecycle (Theory of Constraints).
export const TOC_STATUSES = [
  "none",
  "identified",
  "exploit",
  "subordinate",
  "elevate",
  "broken",
] as const;
export const tocStatusSchema = z.enum(TOC_STATUSES);
export type TocStatus = z.infer<typeof tocStatusSchema>;

// Node kinds that can participate in a flow edge.
export const FLOW_NODE_TYPES = ["step", "persona", "data_element"] as const;
export const flowNodeTypeSchema = z.enum(FLOW_NODE_TYPES);
export type FlowNodeType = z.infer<typeof flowNodeTypeSchema>;

export const EDGE_TYPES = ["sequence", "data_flow", "handoff", "dependency"] as const;
export const edgeTypeSchema = z.enum(EDGE_TYPES);
export type EdgeType = z.infer<typeof edgeTypeSchema>;

export const ARTIFACT_TYPES = [
  "document",
  "spreadsheet",
  "presentation",
  "video",
  "image",
  "pdf",
  "schematic",
  "workbook",
  "paper_file",
  "other",
] as const;
export const artifactTypeSchema = z.enum(ARTIFACT_TYPES);
export type ArtifactType = z.infer<typeof artifactTypeSchema>;

export const ARTIFACT_FORMS = ["digital", "physical", "intangible"] as const;
export const artifactFormSchema = z.enum(ARTIFACT_FORMS);
export type ArtifactForm = z.infer<typeof artifactFormSchema>;
