import { describe, expect, it } from "vitest";
import { scoreConstraintCandidates, type ScoringInput } from "@shared/scoring";
import type {
  Constraint,
  DataElement,
  FlowEdge,
  ProcessStep,
  StepPersona,
} from "@shared/schemas";

const base = { created_at: "t", updated_at: "t", deleted_at: null };

function step(id: string, name = "step", extra: Partial<ProcessStep> = {}): ProcessStep {
  return {
    ...base,
    id,
    value_stream_id: "vs",
    name,
    sequence_index: 0,
    entry_criteria: null,
    action: null,
    exit_criteria: null,
    pain_points: null,
    cycle_time: null,
    wait_time: null,
    pct_complete_accurate: null,
    ...extra,
  };
}
function dataEl(id: string, step_id: string, extra: Partial<DataElement> = {}): DataElement {
  return {
    ...base,
    id,
    step_id,
    name: "d",
    binding_point: "entry",
    data_type: null,
    source_system: null,
    presence: "present",
    quality_notes: null,
    is_key: false,
    ...extra,
  };
}
function edge(from_id: string, to_id: string): FlowEdge {
  return {
    ...base,
    id: `${from_id}->${to_id}`,
    value_stream_id: "vs",
    from_type: "step",
    from_id,
    to_type: "step",
    to_id,
    edge_type: "sequence",
    notes: null,
  };
}
function constraintOn(step_id: string, extra: Partial<Constraint> = {}): Constraint {
  return {
    ...base,
    id: `c-${step_id}-${Math.random()}`,
    value_stream_id: "vs",
    title: "c",
    description: null,
    kind: "constraint",
    target_type: "step",
    target_id: step_id,
    severity: "medium",
    likelihood: null,
    toc_status: "none",
    is_system_constraint: false,
    ...extra,
  };
}
function empty(): ScoringInput {
  return { steps: [], dataElements: [], edges: [], stepPersonas: [], personas: [], constraints: [] };
}

describe("constraint candidate scoring", () => {
  it("scores missing/partial key data transparently", () => {
    const input = empty();
    input.steps = [step("s1", "Inspection")];
    input.dataElements = [
      dataEl("d1", "s1", { is_key: true, presence: "missing" }),
      dataEl("d2", "s1", { is_key: true, presence: "partial" }),
      dataEl("d3", "s1", { is_key: false, presence: "missing" }),
    ];
    const [cand] = scoreConstraintCandidates(input);
    const factor = cand.factors.find((f) => f.key === "missing_key_data");
    // 1*6 (missing key) + 1*3 (partial key) + 1*2 (other missing) = 11
    expect(factor?.points).toBe(11);
    expect(cand.score).toBe(11);
  });

  it("flags bottleneck topology with no alternative path", () => {
    const input = empty();
    input.steps = [step("hub", "Hub"), step("a"), step("b"), step("c"), step("out")];
    input.edges = [edge("a", "hub"), edge("b", "hub"), edge("c", "hub"), edge("hub", "out")];
    const cand = scoreConstraintCandidates(input).find((c) => c.target_id === "hub");
    const factor = cand?.factors.find((f) => f.key === "bottleneck_topology");
    // inbound 3 (over threshold 2 => 1 over * 4) + noAlternative bonus 8 = 12
    expect(factor?.points).toBe(12);
  });

  it("flags queue accumulation when wait exceeds cycle", () => {
    const input = empty();
    input.steps = [step("s1", "Queue", { cycle_time: 1, wait_time: 6 })];
    const [cand] = scoreConstraintCandidates(input);
    const factor = cand.factors.find((f) => f.key === "queue_accumulation");
    // ratio 6 * 5 = 30, capped at 25
    expect(factor?.points).toBe(25);
  });

  it("does not flag queue accumulation when wait <= cycle", () => {
    const input = empty();
    input.steps = [step("s1", "OK", { cycle_time: 5, wait_time: 1 })];
    expect(scoreConstraintCandidates(input)).toHaveLength(0);
  });

  it("scores severe constraints attached to a step", () => {
    const input = empty();
    input.steps = [step("s1", "Breakdown")];
    input.constraints = [
      constraintOn("s1", { severity: "critical" }),
      constraintOn("s1", { kind: "breakdown", severity: "high" }),
    ];
    const [cand] = scoreConstraintCandidates(input);
    const factor = cand.factors.find((f) => f.key === "severe_constraints");
    // 1 critical*12 + 1 breakdown*10 + 1 high*6 = 28 (the high-sev one is also breakdown)
    expect(factor?.points).toBe(28);
  });

  it("flags persona overload across high-severity steps", () => {
    const input = empty();
    input.steps = [step("s1"), step("s2")];
    input.personas = [
      { ...base, id: "p1", value_stream_id: "vs", name: "QA", role_title: null, function: null, scope_level: "stream", responsibilities: null, authority_notes: null },
    ];
    input.stepPersonas = [
      { ...base, id: "sp1", step_id: "s1", persona_id: "p1", role_on_step: "executor" } as StepPersona,
      { ...base, id: "sp2", step_id: "s2", persona_id: "p1", role_on_step: "executor" } as StepPersona,
    ];
    input.constraints = [
      constraintOn("s1", { severity: "high" }),
      constraintOn("s2", { severity: "critical" }),
    ];
    const personaCand = scoreConstraintCandidates(input).find((c) => c.target_type === "persona");
    const factor = personaCand?.factors.find((f) => f.key === "persona_overload");
    expect(factor?.points).toBe(10); // 2 loaded steps * 5
  });

  it("returns candidates sorted by descending score", () => {
    const input = empty();
    input.steps = [
      step("low", "Low", { cycle_time: 1, wait_time: 2 }),
      step("high", "High"),
    ];
    input.dataElements = [
      dataEl("d1", "high", { is_key: true, presence: "missing" }),
      dataEl("d2", "high", { is_key: true, presence: "missing" }),
    ];
    const ranked = scoreConstraintCandidates(input);
    expect(ranked[0].target_id).toBe("high");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("returns nothing for an empty value stream", () => {
    expect(scoreConstraintCandidates(empty())).toHaveLength(0);
  });
});
