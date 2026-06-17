import { Router } from "express";
import type {
  Constraint,
  DataElement,
  FlowEdge,
  Persona,
  ProcessStep,
  StepPersona,
} from "@shared/schemas";
import { buildDataGapReport } from "@shared/gaps";
import { scoreConstraintCandidates } from "@shared/scoring";
import { repos } from "../repositories";

/** Collect every live entity belonging to one value stream. */
function gather(valueStreamId: string) {
  const steps = repos.process_steps.list({
    where: { value_stream_id: valueStreamId },
    orderBy: "sequence_index ASC",
  }) as unknown as ProcessStep[];
  const stepIds = new Set(steps.map((s) => s.id));

  const allDataElements = repos.data_elements.list() as unknown as DataElement[];
  const dataElements = allDataElements.filter((d) => stepIds.has(d.step_id));

  const allStepPersonas = repos.step_personas.list() as unknown as StepPersona[];
  const stepPersonas = allStepPersonas.filter((sp) => stepIds.has(sp.step_id));

  const personas = repos.personas.list({
    where: { value_stream_id: valueStreamId },
  }) as unknown as Persona[];
  const constraints = repos.constraints.list({
    where: { value_stream_id: valueStreamId },
  }) as unknown as Constraint[];
  const edges = repos.flow_edges.list({
    where: { value_stream_id: valueStreamId },
  }) as unknown as FlowEdge[];

  return { steps, dataElements, stepPersonas, personas, constraints, edges };
}

export function analyticsRouter(): Router {
  const router = Router();

  router.get("/gaps/:valueStreamId", (req, res) => {
    const { steps, dataElements } = gather(req.params.valueStreamId);
    res.json(buildDataGapReport(steps, dataElements));
  });

  router.get("/candidates/:valueStreamId", (req, res) => {
    const data = gather(req.params.valueStreamId);
    res.json(scoreConstraintCandidates(data));
  });

  // Soft governance: how many constraints are active (beyond `identified`) in
  // a stream. The Five Focusing Steps say there is one system constraint at a
  // time, so >1 is a warning the UI surfaces (never a hard block).
  router.get("/system-constraint-check/:valueStreamId", (req, res) => {
    const { constraints } = gather(req.params.valueStreamId);
    const active = constraints.filter(
      (c) => c.toc_status !== "none" && c.toc_status !== "identified",
    );
    const flagged = constraints.filter((c) => c.is_system_constraint);
    res.json({
      active_count: active.length,
      active,
      system_flagged_count: flagged.length,
      warning:
        active.length > 1 || flagged.length > 1
          ? "More than one active system constraint in this value stream. The Theory of Constraints holds that one constraint governs flow at a time — confirm before proceeding."
          : null,
    });
  });

  return router;
}
