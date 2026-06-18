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
// Personas are grouped by Function/Dept with a faded department backdrop. This
// is the layout used by the "Full OIL" mode — no force layout needed, so the
// cells stay glued to their step.
// ---------------------------------------------------------------------------

const STEP_W = 220;
const STEP_H = 96;
const COL_SPACING = 300;
const CELL_W = 200;
const CELL_X = (STEP_W - CELL_W) / 2;
const PERSONA_H = 48;
const DATA_H = 44;
const CELL_GAP = 8;
const SECTION_GAP = 20;
const DEPT_PAD = 8;
const DEPT_GROUP_GAP = 10;

const BINDING_ORDER: Record<string, number> = { entry: 0, action: 1, exit: 2 };

const EDGE_STYLE: Record<string, { dash?: string; color: string }> = {
  sequence: { color: "hsl(215 20% 45%)" },
  data_flow: { dash: "6 4", color: "hsl(190 70% 50%)" },
  handoff: { dash: "2 4", color: "hsl(270 55% 62%)" },
  dependency: { dash: "8 3", color: "hsl(38 92% 55%)" },
};

/** Deterministic department hue so the same dept is always the same color. */
export function deptHue(dept: string): number {
  let h = 0;
  for (let i = 0; i < dept.length; i++) h = (h * 31 + dept.charCodeAt(i)) % 360;
  return h;
}
export function deptColors(dept: string): { bg: string; border: string; text: string } {
  const hue = deptHue(dept);
  return {
    bg: `hsla(${hue}, 45%, 24%, 0.45)`,
    border: `hsl(${hue} 50% 50%)`,
    text: `hsl(${hue} 65% 80%)`,
  };
}

export interface AttachedInput {
  steps: ProcessStep[];
  personas: Persona[];
  dataElements: DataElement[];
  stepPersonas: StepPersona[];
  constraints: Constraint[];
  edges: FlowEdge[];
  layers: { personas: boolean; data: boolean; constraints: boolean };
}

export function buildAttachedGraph(input: AttachedInput): {
  nodes: Node<OilNodeData>[];
  edges: Edge[];
} {
  const { steps, personas, dataElements, stepPersonas, constraints, edges, layers } = input;

  const personaById = new Map(personas.map((p) => [p.id, p]));

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

  const bgNodes: Node<OilNodeData>[] = []; // department backdrops (render behind)
  const cellNodes: Node<OilNodeData>[] = [];

  const sorted = [...steps].sort((a, b) => a.sequence_index - b.sequence_index);

  sorted.forEach((step, i) => {
    const x = i * COL_SPACING;

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
      },
    });

    let cursorY = STEP_H + SECTION_GAP;

    // ---- persona cells, grouped by department --------------------------
    if (layers.personas) {
      const assigns = stepPersonas
        .filter((sp) => sp.step_id === step.id)
        .map((sp) => ({ sp, p: personaById.get(sp.persona_id) }))
        .filter((a): a is { sp: StepPersona; p: Persona } => !!a.p)
        .sort(
          (a, b) =>
            (a.p.function ?? "Unassigned").localeCompare(b.p.function ?? "Unassigned") ||
            a.p.name.localeCompare(b.p.name),
        );

      let gi = 0;
      while (gi < assigns.length) {
        const dept = assigns[gi].p.function ?? "Unassigned";
        const col = deptColors(dept);
        const groupTop = cursorY;

        while (gi < assigns.length && (assigns[gi].p.function ?? "Unassigned") === dept) {
          const { sp, p } = assigns[gi];
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
              deptColor: col.border,
            },
          });
          cursorY += PERSONA_H + CELL_GAP;
          gi++;
        }

        const groupBottom = cursorY - CELL_GAP;
        bgNodes.push({
          id: `deptbg:${step.id}:${dept}`,
          type: "deptBg",
          position: { x: x + CELL_X - DEPT_PAD, y: groupTop - DEPT_PAD },
          style: { width: CELL_W + DEPT_PAD * 2, height: groupBottom - groupTop + DEPT_PAD * 2 },
          selectable: false,
          draggable: false,
          zIndex: 0,
          data: {
            label: dept,
            nodeKind: "persona",
            entityId: "",
            dimmed: false,
            isBackground: true,
            deptColor: col.border,
            deptBg: col.bg,
          },
        });
        cursorY += DEPT_GROUP_GAP;
      }
      if (assigns.length) cursorY += SECTION_GAP - DEPT_GROUP_GAP;
    }

    // ---- data cells ----------------------------------------------------
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
          data: {
            label: d.name,
            nodeKind: "data_element",
            entityId: d.id,
            dimmed: false,
            data: d,
          },
        });
        cursorY += DATA_H + CELL_GAP;
      }
    }
  });

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

  // Background nodes first so they paint behind the cells.
  return { nodes: [...bgNodes, ...cellNodes], edges: outEdges };
}
