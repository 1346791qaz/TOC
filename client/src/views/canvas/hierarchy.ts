import type { ProcessStep } from "@shared/schemas";

/**
 * Build the breadcrumb path from the value-stream root down to (and including)
 * the given step, by walking parent_step_id upward. Cycles are guarded against.
 */
export function buildStepPath(
  stepId: string,
  steps: ProcessStep[],
): { id: string; name: string }[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const path: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  let cur = byId.get(stepId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift({ id: cur.id, name: cur.name });
    cur = cur.parent_step_id ? byId.get(cur.parent_step_id) : undefined;
  }
  return path;
}

/** Steps at a given level (children of parentId, or top level when null). */
export function stepsAtLevel(steps: ProcessStep[], parentId: string | null): ProcessStep[] {
  return steps.filter((s) => (s.parent_step_id ?? null) === parentId);
}

/** Map of parent_step_id -> number of direct children. */
export function childCountByParent(steps: ProcessStep[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of steps) {
    if (s.parent_step_id) m.set(s.parent_step_id, (m.get(s.parent_step_id) ?? 0) + 1);
  }
  return m;
}
