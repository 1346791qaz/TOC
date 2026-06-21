import type { Edge, Node } from "@xyflow/react";
import type { LinkedDataElement } from "@shared/gaps";
import type {
  Constraint,
  FlowEdge,
  Persona,
  ProcessStep,
  StepPersona,
} from "@shared/schemas";
import { severityRank } from "@/lib/display";
import type { ConstraintBadge, OilNodeData } from "./buildGraph";

// ---------------------------------------------------------------------------
// "Attached cells" layout with INLINE, HORIZONTAL drill-down. Top-level steps
// are columns left-to-right; each step's personas and data hang beneath it.
// Expanding a step lays its sub-steps out as their own left-to-right mini-spine
// in a band directly below the step, and the step's slot WIDENS to fit them
// (recursively) — so later steps shift right and the whole value stream, with
// any expanded detail, stays in one left-to-right view. Each top column sits in
// a faded domain lane (owner = the executor's Function/Dept).
// ---------------------------------------------------------------------------

const STEP_W = 220;
const STEP_H = 96;
const COLUMN_WIDTH = 300; // collapsed slot width (node + margin to next step)
const CELL_W = 200;
const CELL_X = (STEP_W - CELL_W) / 2;
const PERSONA_H = 48;
const DATA_H = 44;
const CELL_GAP = 8;
const SECTION_GAP = 16;
const BAND_GAP = 26; // gap between a step's cells and its sub-step band
const DOMAIN_PAD = 12;
const LANE_HEADER = 28;

const BINDING_ORDER: Record<string, number> = { entry: 0, action: 1, exit: 2 };
const ROLE_ORDER: Record<string, number> = { executor: 0, approver: 1, consulted: 2, informed: 3 };
const UNOWNED = "Unowned";

const EDGE_STYLE: Record<string, { dash?: string; color: string }> = {
  sequence: { color: "hsl(215 20% 45%)" },
  data_flow: { dash: "6 4", color: "hsl(190 70% 50%)" },
  handoff: { dash: "2 4", color: "hsl(270 55% 62%)" },
  dependency: { dash: "8 3", color: "hsl(38 92% 55%)" },
};

export interface DomainColor {
  border: string;
  bg: string;
  text: string;
}

export function buildDomainPalette(domains: string[]): Map<string, DomainColor> {
  const distinct = [...new Set(domains)].sort((a, b) => a.localeCompare(b));
  const map = new Map<string, DomainColor>();
  const n = Math.max(distinct.length, 1);
  distinct.forEach((d, i) => {
    const hue = Math.round((i * 360) / n);
    map.set(d, {
      border: `hsl(${hue} 62% 55%)`,
      bg: `hsla(${hue}, 55%, 32%, 0.16)`,
      text: `hsl(${hue} 70% 80%)`,
    });
  });
  return map;
}

const GRAY: DomainColor = {
  border: "hsl(215 12% 45%)",
  bg: "hsla(215, 12%, 40%, 0.12)",
  text: "hsl(215 14% 70%)",
};

export interface AttachedInput {
  steps: ProcessStep[];
  personas: Persona[];
  dataElements: LinkedDataElement[];
  stepPersonas: StepPersona[];
  constraints: Constraint[];
  edges: FlowEdge[];
  layers: { personas: boolean; data: boolean; constraints: boolean };
  expanded: Set<string>;
}

export function buildAttachedGraph(input: AttachedInput): {
  nodes: Node<OilNodeData>[];
  edges: Edge[];
} {
  const { steps, personas, dataElements, stepPersonas, constraints, edges, layers, expanded } =
    input;

  const personaById = new Map(personas.map((p) => [p.id, p]));
  const domainOf = (p: Persona | undefined): string => p?.function ?? "Unassigned";
  const palette = buildDomainPalette(personas.map((p) => domainOf(p)));
  const colorFor = (domain: string): DomainColor =>
    domain === UNOWNED ? GRAY : palette.get(domain) ?? GRAY;

  const childrenOf = new Map<string, ProcessStep[]>();
  for (const s of steps) {
    if (!s.parent_step_id) continue;
    const arr = childrenOf.get(s.parent_step_id) ?? [];
    arr.push(s);
    childrenOf.set(s.parent_step_id, arr);
  }
  for (const arr of childrenOf.values()) arr.sort((a, b) => a.sequence_index - b.sequence_index);

  const badges = new Map<string, ConstraintBadge>();
  for (const c of constraints) {
    if (!c.target_id) continue;
    const b = badges.get(c.target_id) ?? { count: 0, maxRank: 0, isSystem: false };
    b.count++;
    b.maxRank = Math.max(b.maxRank, severityRank[c.severity]);
    if (c.is_system_constraint) b.isSystem = true;
    badges.set(c.target_id, b);
  }
  const badgeFor = (id: string) => (layers.constraints ? badges.get(id) : undefined);

  const ownerDomainOf = (step: ProcessStep): string => {
    const exec = stepPersonas.find((sp) => sp.step_id === step.id && sp.role_on_step === "executor");
    return exec ? domainOf(personaById.get(exec.persona_id)) : UNOWNED;
  };

  const laneNodes: Node<OilNodeData>[] = [];
  const cellNodes: Node<OilNodeData>[] = [];
  const placed = new Set<string>();

  // Lay out a step at (x, y); if expanded, its sub-steps form a left-to-right
  // band beneath it. Returns the slot width consumed and the bottom Y reached.
  function layoutStep(
    step: ProcessStep,
    x: number,
    y: number,
    depth: number,
  ): { width: number; bottom: number } {
    placed.add(step.id);
    const kids = childrenOf.get(step.id) ?? [];
    const isOpen = expanded.has(step.id) && kids.length > 0;

    cellNodes.push({
      id: `step:${step.id}`,
      type: "step",
      position: { x, y },
      zIndex: 2,
      data: {
        label: step.name,
        nodeKind: "step",
        entityId: step.id,
        dimmed: false,
        constraint: badgeFor(step.id),
        step,
        subStepCount: kids.length,
        isExpanded: expanded.has(step.id),
        depth,
        deptColor: colorFor(ownerDomainOf(step)).border,
      },
    });

    let cursorY = y + STEP_H + SECTION_GAP;
    const cellX = x + CELL_X;

    if (layers.personas) {
      const assigns = stepPersonas
        .filter((sp) => sp.step_id === step.id)
        .map((sp) => ({ sp, p: personaById.get(sp.persona_id) }))
        .filter((a): a is { sp: StepPersona; p: Persona } => !!a.p)
        .sort(
          (a, b) =>
            (ROLE_ORDER[a.sp.role_on_step] ?? 9) - (ROLE_ORDER[b.sp.role_on_step] ?? 9) ||
            a.p.name.localeCompare(b.p.name),
        );
      for (const { sp, p } of assigns) {
        cellNodes.push({
          id: `pcell:${step.id}:${p.id}`,
          type: "personaCell",
          position: { x: cellX, y: cursorY },
          zIndex: 2,
          data: {
            label: p.name,
            nodeKind: "persona",
            entityId: p.id,
            dimmed: false,
            constraint: badgeFor(p.id),
            persona: p,
            roleOnStep: sp.role_on_step,
            deptColor: colorFor(domainOf(p)).border,
            isExecutor: sp.role_on_step === "executor",
          },
        });
        cursorY += PERSONA_H + CELL_GAP;
      }
      if (assigns.length) cursorY += SECTION_GAP - CELL_GAP;
    }

    if (layers.data) {
      const ds = dataElements
        .filter((d) => d.step_id === step.id)
        .sort(
          (a, b) =>
            (BINDING_ORDER[a.binding_point] ?? 9) - (BINDING_ORDER[b.binding_point] ?? 9) ||
            a.name.localeCompare(b.name),
        );
      for (const d of ds) {
        cellNodes.push({
          id: `dcell:${d.id}`,
          type: "dataCell",
          position: { x: cellX, y: cursorY },
          zIndex: 2,
          data: { label: d.name, nodeKind: "data_element", entityId: d.id, dimmed: false, data: d },
        });
        cursorY += DATA_H + CELL_GAP;
      }
    }

    const cellsBottom = cursorY;
    if (!isOpen) return { width: COLUMN_WIDTH, bottom: cellsBottom };

    // Sub-steps: left-to-right band directly below this step's cells.
    const bandY = cellsBottom + BAND_GAP;
    let childX = x;
    let maxBottom = bandY;
    for (const child of kids) {
      const res = layoutStep(child, childX, bandY, depth + 1);
      childX += res.width;
      maxBottom = Math.max(maxBottom, res.bottom);
    }
    const width = Math.max(COLUMN_WIDTH, childX - x);
    return { width, bottom: maxBottom };
  }

  const sortedTop = steps
    .filter((s) => !s.parent_step_id)
    .sort((a, b) => a.sequence_index - b.sequence_index);

  interface Meta {
    step: ProcessStep;
    x: number;
    width: number;
    bottom: number;
    ownerDomain: string;
    ownerColor: DomainColor;
  }
  const meta: Meta[] = [];
  let runningX = 0;
  for (const step of sortedTop) {
    const res = layoutStep(step, runningX, 0, 0);
    const ownerDomain = ownerDomainOf(step);
    meta.push({ step, x: runningX, width: res.width, bottom: res.bottom, ownerDomain, ownerColor: colorFor(ownerDomain) });
    runningX += res.width;
  }

  // Merge consecutive same-domain top slots into one labeled lane.
  let r = 0;
  while (r < meta.length) {
    const dom = meta[r].ownerDomain;
    let e = r;
    while (e + 1 < meta.length && meta[e + 1].ownerDomain === dom) e++;
    const run = meta.slice(r, e + 1);
    const left = run[0].x - DOMAIN_PAD;
    const right = run[run.length - 1].x + run[run.length - 1].width - (COLUMN_WIDTH - STEP_W) + DOMAIN_PAD;
    const top = -LANE_HEADER;
    const maxBottom = Math.max(...run.map((m) => m.bottom));
    const color = run[0].ownerColor;
    laneNodes.push({
      id: `lane:${run[0].step.id}`,
      type: "deptBg",
      position: { x: left, y: top },
      style: { width: Math.max(STEP_W + DOMAIN_PAD * 2, right - left), height: maxBottom + DOMAIN_PAD - top },
      selectable: false,
      draggable: false,
      zIndex: 0,
      data: {
        label: dom,
        nodeKind: "step",
        entityId: "",
        dimmed: false,
        isBackground: true,
        deptColor: color.border,
        deptBg: color.bg,
      },
    });
    r = e + 1;
  }

  // Edges between any two currently-visible steps: the top-level spine plus the
  // mini-spine of each expanded step (siblings sit side-by-side, so arrows read
  // left-to-right). Covers sequence and cross-cutting dependency edges.
  const outEdges: Edge[] = [];
  for (const ed of edges) {
    if (ed.from_type !== "step" || ed.to_type !== "step") continue;
    if (!placed.has(ed.from_id) || !placed.has(ed.to_id)) continue;
    const style = EDGE_STYLE[ed.edge_type] ?? EDGE_STYLE.sequence;
    outEdges.push({
      id: `fe-${ed.id}`,
      source: `step:${ed.from_id}`,
      target: `step:${ed.to_id}`,
      animated: ed.edge_type === "sequence",
      style: { stroke: style.color, strokeWidth: 1.5, strokeDasharray: style.dash },
    });
  }

  return { nodes: [...laneNodes, ...cellNodes], edges: outEdges };
}
