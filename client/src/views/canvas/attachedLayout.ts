import type { Edge, Node } from "@xyflow/react";
import type {
  Constraint,
  DataElement,
  FlowEdge,
  Persona,
  ProcessStep,
  StepPersona,
} from "@shared/schemas";
import { severityRank } from "@/lib/display";
import type { ConstraintBadge, OilNodeData } from "./buildGraph";

// ---------------------------------------------------------------------------
// "Attached cells" layout: process steps form a left-to-right spine; each
// step's personas and bound data hang directly beneath it as compact cells.
//
// Each step column sits in a faded "domain lane" colored by the domain that
// OWNS the step — i.e. the Function/Dept of the step's executor persona. This
// shows which domain owns which process and its data; non-executor personas
// (approver/consulted/informed) still appear in the column, inside the owner's
// lane, and carry a small marker in their own domain's color.
// ---------------------------------------------------------------------------

const STEP_W = 220;
const STEP_H = 96;
const COL_SPACING = 300;
const CELL_W = 200;
const CELL_X = (STEP_W - CELL_W) / 2;
const PERSONA_H = 48;
const DATA_H = 44;
const CELL_GAP = 8;
const SECTION_GAP = 18;
const DOMAIN_PAD = 12;
const LANE_HEADER = 28; // headroom above the step so the lane label isn't hidden

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

/**
 * Assign every distinct domain a unique, evenly-spaced hue (no two domains
 * share a color). Sorted so assignment is stable for a given set of domains.
 */
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
  dataElements: DataElement[];
  stepPersonas: StepPersona[];
  constraints: Constraint[];
  edges: FlowEdge[];
  layers: { personas: boolean; data: boolean; constraints: boolean };
  /** parent_step_id -> number of direct sub-steps, for the drill-in marker. */
  childCount?: Map<string, number>;
}

export function buildAttachedGraph(input: AttachedInput): {
  nodes: Node<OilNodeData>[];
  edges: Edge[];
} {
  const { steps, personas, dataElements, stepPersonas, constraints, edges, layers, childCount } =
    input;

  const personaById = new Map(personas.map((p) => [p.id, p]));
  const domainOf = (p: Persona | undefined): string => p?.function ?? "Unassigned";

  // Unique color per persona domain (no repetition across domains).
  const palette = buildDomainPalette(personas.map((p) => domainOf(p)));
  const colorFor = (domain: string): DomainColor =>
    domain === UNOWNED ? GRAY : palette.get(domain) ?? GRAY;

  // Constraint badges per target id.
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

  const laneNodes: Node<OilNodeData>[] = []; // domain lanes (render behind)
  const cellNodes: Node<OilNodeData>[] = [];

  const sorted = [...steps].sort((a, b) => a.sequence_index - b.sequence_index);

  interface StepMeta {
    step: ProcessStep;
    x: number;
    ownerDomain: string;
    ownerColor: DomainColor;
    contentBottom: number;
  }
  const meta: StepMeta[] = [];

  sorted.forEach((step, i) => {
    const x = i * COL_SPACING;

    const assigns = stepPersonas
      .filter((sp) => sp.step_id === step.id)
      .map((sp) => ({ sp, p: personaById.get(sp.persona_id) }))
      .filter((a): a is { sp: StepPersona; p: Persona } => !!a.p)
      .sort(
        (a, b) =>
          (ROLE_ORDER[a.sp.role_on_step] ?? 9) - (ROLE_ORDER[b.sp.role_on_step] ?? 9) ||
          a.p.name.localeCompare(b.p.name),
      );

    // Owning domain = the executor's Function/Dept (fallback: Unowned).
    const executor = assigns.find((a) => a.sp.role_on_step === "executor");
    const ownerDomain = executor ? domainOf(executor.p) : UNOWNED;
    const ownerColor = colorFor(ownerDomain);

    cellNodes.push({
      id: `step:${step.id}`,
      type: "step",
      position: { x, y: 0 },
      zIndex: 2,
      data: {
        label: step.name,
        nodeKind: "step",
        entityId: step.id,
        dimmed: false,
        constraint: badgeFor(step.id),
        step,
        subStepCount: childCount?.get(step.id) ?? 0,
      },
    });

    let cursorY = STEP_H + SECTION_GAP;

    if (layers.personas) {
      for (const { sp, p } of assigns) {
        const own = colorFor(domainOf(p));
        cellNodes.push({
          id: `pcell:${step.id}:${p.id}`,
          type: "personaCell",
          position: { x: x + CELL_X, y: cursorY },
          zIndex: 2,
          data: {
            label: p.name,
            nodeKind: "persona",
            entityId: p.id,
            dimmed: false,
            constraint: badgeFor(p.id),
            persona: p,
            roleOnStep: sp.role_on_step,
            deptColor: own.border,
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
          position: { x: x + CELL_X, y: cursorY },
          zIndex: 2,
          data: { label: d.name, nodeKind: "data_element", entityId: d.id, dimmed: false, data: d },
        });
        cursorY += DATA_H + CELL_GAP;
      }
    }

    const contentBottom = Math.max(STEP_H, cursorY - CELL_GAP);
    meta.push({ step, x, ownerDomain, ownerColor, contentBottom });
  });

  // Merge runs of consecutive same-domain steps into a single ownership lane
  // spanning all their columns, with a header band above the steps for the
  // domain label so it isn't hidden behind the step block.
  let r = 0;
  while (r < meta.length) {
    const dom = meta[r].ownerDomain;
    let e = r;
    while (e + 1 < meta.length && meta[e + 1].ownerDomain === dom) e++;
    const run = meta.slice(r, e + 1);
    const left = run[0].x - DOMAIN_PAD;
    const right = run[run.length - 1].x + STEP_W + DOMAIN_PAD;
    const top = -LANE_HEADER;
    const maxBottom = Math.max(...run.map((m) => m.contentBottom));
    const color = run[0].ownerColor;
    laneNodes.push({
      id: `lane:${run[0].step.id}`,
      type: "deptBg",
      position: { x: left, y: top },
      style: { width: right - left, height: maxBottom + DOMAIN_PAD - top },
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

  // Step-to-step dependency edges (cells are attached spatially, no edges).
  const stepIds = new Set(sorted.map((s) => s.id));
  const outEdges: Edge[] = [];
  for (const e of edges) {
    if (e.from_type !== "step" || e.to_type !== "step") continue;
    if (!stepIds.has(e.from_id) || !stepIds.has(e.to_id)) continue;
    const style = EDGE_STYLE[e.edge_type] ?? EDGE_STYLE.sequence;
    outEdges.push({
      id: `fe-${e.id}`,
      source: `step:${e.from_id}`,
      target: `step:${e.to_id}`,
      animated: e.edge_type === "sequence",
      style: { stroke: style.color, strokeWidth: 1.5, strokeDasharray: style.dash },
    });
  }

  // Lanes first so they paint behind the cells.
  return { nodes: [...laneNodes, ...cellNodes], edges: outEdges };
}
