import type {
  Constraint,
  FlowEdge,
  Persona,
  ProcessStep,
  StepPersona,
} from "./schemas";
import type { LinkedDataElement } from "./gaps";

// ---------------------------------------------------------------------------
// Constraint-candidate ranking (Theory of Constraints — the "Identify" step).
//
// This is DECISION SUPPORT, not a verdict. We surface candidates and the exact
// evidence behind each one; the analyst confirms the system constraint. Scoring
// is fully deterministic and every contributing factor is reported, so nothing
// is a black box.
// ---------------------------------------------------------------------------

export interface CandidateFactor {
  /** Stable key for the signal (one of the §6.4 signals). */
  key:
    | "missing_key_data"
    | "bottleneck_topology"
    | "queue_accumulation"
    | "persona_overload"
    | "severe_constraints";
  label: string;
  detail: string;
  points: number;
}

export interface ConstraintCandidate {
  target_type: "step" | "persona";
  target_id: string;
  label: string;
  score: number;
  factors: CandidateFactor[];
}

export interface ScoringInput {
  steps: ProcessStep[];
  dataElements: LinkedDataElement[];
  edges: FlowEdge[];
  stepPersonas: StepPersona[];
  personas: Persona[];
  constraints: Constraint[];
}

// Point weights — kept explicit so the panel can explain the math and tests
// can assert exact contributions.
const W = {
  perMissingKeyData: 6,
  perPartialKeyData: 3,
  perMissingData: 2,
  perInboundEdgeOverThreshold: 4,
  bottleneckThreshold: 2, // inbound edges beyond this count as a bottleneck signal
  noAlternativeBonus: 8, // single (or zero) outbound path => true choke point
  queueRatioMultiplier: 5, // points = ratio(wait/cycle) * this, capped
  queueRatioCap: 25,
  perHighSeverityStep: 5, // persona overload
  perCriticalConstraint: 12,
  perBreakdownConstraint: 10,
  perHighConstraint: 6,
} as const;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function scoreConstraintCandidates(input: ScoringInput): ConstraintCandidate[] {
  const { steps, dataElements, edges, stepPersonas, personas, constraints } = input;

  const candidates = new Map<string, ConstraintCandidate>();
  const ensure = (
    target_type: "step" | "persona",
    target_id: string,
    label: string,
  ): ConstraintCandidate => {
    const mapKey = `${target_type}:${target_id}`;
    let c = candidates.get(mapKey);
    if (!c) {
      c = { target_type, target_id, label, score: 0, factors: [] };
      candidates.set(mapKey, c);
    }
    return c;
  };
  const addFactor = (cand: ConstraintCandidate, factor: CandidateFactor): void => {
    if (factor.points <= 0) return;
    cand.factors.push(factor);
    cand.score = round(cand.score + factor.points);
  };

  // ---- Signal 1: missing / partial key data per step ---------------------
  for (const step of steps) {
    const elems = dataElements.filter((d) => d.step_id === step.id);
    const missingKey = elems.filter((d) => d.is_key && d.presence === "missing").length;
    const partialKey = elems.filter((d) => d.is_key && d.presence === "partial").length;
    const missingAny = elems.filter((d) => !d.is_key && d.presence === "missing").length;
    const points =
      missingKey * W.perMissingKeyData +
      partialKey * W.perPartialKeyData +
      missingAny * W.perMissingData;
    if (points > 0) {
      addFactor(ensure("step", step.id, step.name), {
        key: "missing_key_data",
        label: "Missing / partial data",
        detail: `${missingKey} missing key, ${partialKey} partial key, ${missingAny} other missing — the model is blind here.`,
        points,
      });
    }
  }

  // ---- Signal 2: bottleneck topology (high in-degree, no alternative) ----
  for (const step of steps) {
    const inbound = edges.filter((e) => e.to_type === "step" && e.to_id === step.id).length;
    const outbound = edges.filter((e) => e.from_type === "step" && e.from_id === step.id).length;
    if (inbound > W.bottleneckThreshold) {
      const over = inbound - W.bottleneckThreshold;
      let points = over * W.perInboundEdgeOverThreshold;
      const noAlt = outbound <= 1;
      if (noAlt) points += W.noAlternativeBonus;
      addFactor(ensure("step", step.id, step.name), {
        key: "bottleneck_topology",
        label: "Bottleneck topology",
        detail: `${inbound} dependencies converge here with ${outbound} outbound path(s)${
          noAlt ? " — no parallel/alternative route" : ""
        }.`,
        points,
      });
    }
  }

  // ---- Signal 3: queue accumulation (wait vs cycle) ----------------------
  for (const step of steps) {
    if (step.wait_time != null && step.cycle_time != null && step.cycle_time > 0) {
      const ratio = step.wait_time / step.cycle_time;
      if (ratio > 1) {
        const points = Math.min(round(ratio * W.queueRatioMultiplier), W.queueRatioCap);
        addFactor(ensure("step", step.id, step.name), {
          key: "queue_accumulation",
          label: "Queue accumulation",
          detail: `Wait time is ${round(ratio)}× cycle time (${step.wait_time} vs ${step.cycle_time}) — work piles up waiting.`,
          points,
        });
      }
    }
  }

  // ---- Signal 5 (steps): severe constraints attached to a step ----------
  for (const step of steps) {
    const attached = constraints.filter(
      (c) => c.target_type === "step" && c.target_id === step.id,
    );
    const critical = attached.filter((c) => c.severity === "critical").length;
    const breakdown = attached.filter((c) => c.kind === "breakdown").length;
    const high = attached.filter((c) => c.severity === "high").length;
    const points =
      critical * W.perCriticalConstraint +
      breakdown * W.perBreakdownConstraint +
      high * W.perHighConstraint;
    if (points > 0) {
      addFactor(ensure("step", step.id, step.name), {
        key: "severe_constraints",
        label: "Severe constraints logged",
        detail: `${critical} critical, ${breakdown} breakdown, ${high} high-severity item(s) recorded on this step.`,
        points,
      });
    }
  }

  // ---- Signal 4: persona overload across high-severity steps ------------
  // A step is "high-severity" if it carries a high/critical constraint.
  const highSeverityStepIds = new Set(
    constraints
      .filter((c) => c.target_type === "step" && (c.severity === "high" || c.severity === "critical"))
      .map((c) => c.target_id)
      .filter((id): id is string => id != null),
  );
  for (const persona of personas) {
    const personaStepIds = stepPersonas
      .filter((sp) => sp.persona_id === persona.id)
      .map((sp) => sp.step_id);
    const loaded = personaStepIds.filter((sid) => highSeverityStepIds.has(sid)).length;
    if (loaded >= 2) {
      addFactor(ensure("persona", persona.id, persona.name), {
        key: "persona_overload",
        label: "Resource overload",
        detail: `Owns ${loaded} high-severity step(s) — a likely resource constraint.`,
        points: loaded * W.perHighSeverityStep,
      });
    }
  }

  return [...candidates.values()].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}
