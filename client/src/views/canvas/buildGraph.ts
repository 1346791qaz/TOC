import type { Edge, Node } from "@xyflow/react";
import type { LinkedDataElement } from "@shared/gaps";
import type {
  Constraint,
  FlowEdge,
  Persona,
  ProcessStep,
  StepPersona,
} from "@shared/schemas";
import type { FlowNodeType } from "@shared/enums";
import { severityRank, statusColors } from "@/lib/display";
import type { LayoutMode } from "@/store";

export interface ConstraintBadge {
  count: number;
  maxRank: number;
  isSystem: boolean;
}

export interface OilNodeData extends Record<string, unknown> {
  label: string;
  nodeKind: FlowNodeType;
  entityId: string;
  dimmed: boolean;
  constraint?: ConstraintBadge;
  step?: ProcessStep;
  persona?: Persona;
  data?: LinkedDataElement;
  // Attached-cell layout extras
  roleOnStep?: string;
  deptColor?: string;
  deptBg?: string;
  isBackground?: boolean;
  isExecutor?: boolean;
  // Hierarchy: number of direct sub-steps + whether expanded inline + depth.
  subStepCount?: number;
  isExpanded?: boolean;
  depth?: number;
  // Lane membership: which domain frame owns this node (for group drag in Full Model mode).
  laneId?: string;
}

export const NODE_SIZES: Record<FlowNodeType, { width: number; height: number }> = {
  step: { width: 210, height: 96 },
  persona: { width: 176, height: 64 },
  data_element: { width: 156, height: 52 },
};

const nid = (t: FlowNodeType, id: string) => `${t}:${id}`;

export interface GraphInput {
  steps: ProcessStep[];
  personas: Persona[];
  dataElements: LinkedDataElement[];
  stepPersonas: StepPersona[];
  constraints: Constraint[];
  edges: FlowEdge[];
  layoutMode: LayoutMode;
  layers: { personas: boolean; data: boolean; constraints: boolean };
  /** parent_step_id -> number of direct sub-steps, for the drill-in marker. */
  childCount?: Map<string, number>;
}

const EDGE_STYLE: Record<string, { dash?: string; color: string }> = {
  sequence: { color: "hsl(215 20% 45%)" },
  data_flow: { dash: "6 4", color: "hsl(190 70% 50%)" },
  handoff: { dash: "2 4", color: "hsl(270 55% 62%)" },
  dependency: { dash: "8 3", color: "hsl(38 92% 55%)" },
};

export function buildGraph(input: GraphInput): { nodes: Node<OilNodeData>[]; edges: Edge[] } {
  const { steps, personas, dataElements, stepPersonas, constraints, edges, layoutMode, layers, childCount } =
    input;

  const showPersonas = layoutMode === "full" && layers.personas;
  const showData = layoutMode === "full" && layers.data;
  const showConstraints = layers.constraints;

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

  // Constraint-focus: highlight the system constraint's step + everything
  // downstream of it (subordinate), dim the rest.
  let focusSet: Set<string> | null = null;
  if (layoutMode === "constraint_focus") {
    const sys = constraints.find((c) => c.is_system_constraint && c.target_id);
    focusSet = new Set<string>();
    if (sys?.target_id) {
      const startType: FlowNodeType =
        sys.target_type === "persona" ? "persona" : sys.target_type === "data_element" ? "data_element" : "step";
      const start = nid(startType, sys.target_id);
      focusSet.add(start);
      const queue = [start];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const e of edges) {
          const from = nid(e.from_type, e.from_id);
          const to = nid(e.to_type, e.to_id);
          if (from === cur && !focusSet.has(to)) {
            focusSet.add(to);
            queue.push(to);
          }
        }
      }
    }
  }
  const dimmed = (id: string) => (focusSet ? !focusSet.has(id) : false);

  const nodes: Node<OilNodeData>[] = [];
  const visible = new Set<string>();

  for (const s of steps) {
    const id = nid("step", s.id);
    visible.add(id);
    nodes.push({
      id,
      type: "step",
      position: { x: 0, y: 0 },
      data: {
        label: s.name,
        nodeKind: "step",
        entityId: s.id,
        dimmed: dimmed(id),
        constraint: showConstraints ? badges.get(s.id) : undefined,
        step: s,
        subStepCount: childCount?.get(s.id) ?? 0,
      },
    });
  }
  if (showPersonas) {
    for (const p of personas) {
      const id = nid("persona", p.id);
      visible.add(id);
      nodes.push({
        id,
        type: "persona",
        position: { x: 0, y: 0 },
        data: {
          label: p.name,
          nodeKind: "persona",
          entityId: p.id,
          dimmed: dimmed(id),
          constraint: showConstraints ? badges.get(p.id) : undefined,
          persona: p,
        },
      });
    }
  }
  if (showData) {
    for (const d of dataElements) {
      const id = nid("data_element", d.id);
      visible.add(id);
      nodes.push({
        id,
        type: "data_element",
        position: { x: 0, y: 0 },
        data: {
          label: d.name,
          nodeKind: "data_element",
          entityId: d.id,
          dimmed: dimmed(id),
          data: d,
        },
      });
    }
  }

  const outEdges: Edge[] = [];
  const pushEdge = (id: string, source: string, target: string, type: string, animated = false) => {
    if (!visible.has(source) || !visible.has(target)) return;
    const style = EDGE_STYLE[type] ?? EDGE_STYLE.sequence;
    const isDim = dimmed(source) || dimmed(target);
    outEdges.push({
      id,
      source,
      target,
      animated: animated && !isDim,
      style: {
        stroke: isDim ? "hsl(218 15% 25%)" : style.color,
        strokeWidth: 1.5,
        strokeDasharray: style.dash,
        opacity: isDim ? 0.35 : 1,
      },
    });
  };

  // Real dependency edges.
  for (const e of edges) {
    if (layoutMode === "spine" && !(e.edge_type === "sequence" && e.from_type === "step" && e.to_type === "step"))
      continue;
    pushEdge(
      `fe-${e.id}`,
      nid(e.from_type, e.from_id),
      nid(e.to_type, e.to_id),
      e.edge_type,
      e.edge_type === "sequence",
    );
  }
  // Synthetic binding / assignment edges.
  if (showData) {
    for (const d of dataElements) {
      pushEdge(`bind-${d.id}`, nid("step", d.step_id), nid("data_element", d.id), "data_flow");
    }
  }
  if (showPersonas) {
    for (const sp of stepPersonas) {
      pushEdge(`sp-${sp.id}`, nid("persona", sp.persona_id), nid("step", sp.step_id), "handoff");
    }
  }

  // Detect parallel edges (multiple edges between same source+target) and assign
  // an index so the custom edge renderer can arc them through different Y positions.
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

  return { nodes, edges: outEdges };
}

export const focusBorder = statusColors.critical;
