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
const PARALLEL_GAP = 20; // vertical gap between stacked parallel steps

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

  // Emit merged domain frames for a set of sub-columns (consecutive same-domain
  // groups get merged into one frame). Used for both top-level lanes and sub-step bands.
  function emitLanes(
    subCols: { firstStep: ProcessStep; x: number; width: number; bandY: number; bottom: number; ownerDomain: string; ownerColor: DomainColor }[],
    zIndex: number,
  ) {
    let i = 0;
    while (i < subCols.length) {
      const dom = subCols[i].ownerDomain;
      let e = i;
      while (e + 1 < subCols.length && subCols[e + 1].ownerDomain === dom) e++;
      const run = subCols.slice(i, e + 1);
      const left = run[0].x - DOMAIN_PAD;
      const right = run[run.length - 1].x + run[run.length - 1].width - (COLUMN_WIDTH - STEP_W) + DOMAIN_PAD;
      const bandY = run[0].bandY;
      const maxBottom = Math.max(...run.map((c) => c.bottom));
      const color = run[0].ownerColor;
      laneNodes.push({
        id: `lane:${run[0].firstStep.id}`,
        type: "deptBg",
        position: { x: left, y: bandY - LANE_HEADER },
        style: {
          width: Math.max(STEP_W + DOMAIN_PAD * 2, right - left),
          height: maxBottom - bandY + DOMAIN_PAD + LANE_HEADER,
          pointerEvents: "none",
        },
        selectable: false,
        draggable: true,
        dragHandle: ".lane-header",
        zIndex,
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
      i = e + 1;
    }
  }

  // Lay out a step at (x, y); if expanded, its sub-steps form a left-to-right
  // band beneath it. Returns:
  //   width    — slot width consumed (for spacing subsequent columns)
  //   bottom   — total bottom including sub-step band (for spacing parallel steps)
  //   ownBottom — bottom of this step's OWN content only (for sizing this step's domain frame)
  function layoutStep(
    step: ProcessStep,
    x: number,
    y: number,
    depth: number,
    laneId: string,
  ): { width: number; bottom: number; ownBottom: number } {
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
        laneId,
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
            laneId,
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
          data: { label: d.name, nodeKind: "data_element", entityId: d.id, dimmed: false, data: d, laneId },
        });
        cursorY += DATA_H + CELL_GAP;
      }
    }

    const cellsBottom = cursorY;
    if (!isOpen) return { width: COLUMN_WIDTH, bottom: cellsBottom, ownBottom: cellsBottom };

    // Sub-steps: group by sequence_index so same-index sub-steps stack vertically
    // (parallel within the parent), different indexes go left-to-right (serial).
    const subSeqMap = new Map<number, ProcessStep[]>();
    for (const k of kids) {
      const g = subSeqMap.get(k.sequence_index) ?? [];
      g.push(k);
      subSeqMap.set(k.sequence_index, g);
    }
    const subGroups = [...subSeqMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, grp]) => grp);

    const bandY = cellsBottom + BAND_GAP;
    let childX = x;
    let maxBottom = bandY;

    // Track sub-column metadata so we can emit correct domain frames per sub-step.
    const subCols: { firstStep: ProcessStep; x: number; width: number; bandY: number; bottom: number; ownerDomain: string; ownerColor: DomainColor }[] = [];

    for (const subGroup of subGroups) {
      let subY = bandY;
      let groupW = COLUMN_WIDTH;
      let groupBottom = bandY;
      for (const child of subGroup) {
        const res = layoutStep(child, childX, subY, depth + 1, `lane:${child.id}`);
        subY = res.bottom + PARALLEL_GAP;
        groupW = Math.max(groupW, res.width);
        groupBottom = Math.max(groupBottom, res.bottom);
        maxBottom = Math.max(maxBottom, res.bottom);
      }
      subCols.push({
        firstStep: subGroup[0],
        x: childX,
        width: groupW,
        bandY,
        bottom: groupBottom,
        ownerDomain: ownerDomainOf(subGroup[0]),
        ownerColor: colorFor(ownerDomainOf(subGroup[0])),
      });
      childX += groupW;
    }

    // Emit domain frames for the sub-step band, merged by consecutive same domain.
    emitLanes(subCols, depth + 1);

    const width = Math.max(COLUMN_WIDTH, childX - x);
    return { width, bottom: maxBottom, ownBottom: cellsBottom };
  }

  // Group top-level steps by sequence_index. Same index = run in parallel (stack
  // vertically in the same column). Different indexes = serial (left to right).
  const sortedTop = steps
    .filter((s) => !s.parent_step_id)
    .sort((a, b) => a.sequence_index - b.sequence_index || a.name.localeCompare(b.name));

  const seqMap = new Map<number, ProcessStep[]>();
  for (const s of sortedTop) {
    const g = seqMap.get(s.sequence_index) ?? [];
    g.push(s);
    seqMap.set(s.sequence_index, g);
  }

  interface ColMeta {
    firstStep: ProcessStep;
    x: number;
    width: number;
    bottom: number;
    ownBottom: number;
    ownerDomain: string;
    ownerColor: DomainColor;
  }
  const cols: ColMeta[] = [];

  let runningX = 0;
  for (const group of seqMap.values()) {
    let cursorY = 0;
    let groupWidth = COLUMN_WIDTH;
    let groupOwnBottom = 0;

    for (const step of group) {
      const laneId = `lane:${step.id}`;
      const res = layoutStep(step, runningX, cursorY, 0, laneId);
      groupWidth = Math.max(groupWidth, res.width);
      groupOwnBottom = Math.max(groupOwnBottom, res.ownBottom);
      cursorY = res.bottom + PARALLEL_GAP;
    }

    const ownerDomain = ownerDomainOf(group[0]);
    cols.push({
      firstStep: group[0],
      x: runningX,
      width: groupWidth,
      bottom: cursorY - PARALLEL_GAP,
      ownBottom: groupOwnBottom,
      ownerDomain,
      ownerColor: colorFor(ownerDomain),
    });

    runningX += groupWidth;
  }

  // Emit top-level domain frames: merge consecutive same-domain columns into one
  // labeled lane. Frame height covers only the step's own content (ownBottom), not
  // sub-step bands — those get their own frames emitted inside layoutStep above.
  const topCols = cols.map((c) => ({ ...c, bandY: 0, bottom: c.ownBottom }));
  emitLanes(topCols, 0);

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

  // Detect parallel edges and assign per-pair indices for arc separation.
  const pairCount = new Map<string, number>();
  const pairIdx = new Map<string, number>();
  for (const e of outEdges) pairCount.set(`${e.source}|${e.target}`, (pairCount.get(`${e.source}|${e.target}`) ?? 0) + 1);
  for (const e of outEdges) {
    const key = `${e.source}|${e.target}`;
    const total = pairCount.get(key) ?? 1;
    if (total > 1) {
      const idx = pairIdx.get(key) ?? 0;
      pairIdx.set(key, idx + 1);
      e.type = "parallel";
      e.data = { parallelIndex: idx, parallelTotal: total };
    }
  }

  return { nodes: [...laneNodes, ...cellNodes], edges: outEdges };
}
