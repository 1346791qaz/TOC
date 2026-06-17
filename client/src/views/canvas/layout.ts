import ELK from "elkjs/lib/elk.bundled.js";
import type { Edge, Node } from "@xyflow/react";
import { NODE_SIZES, type OilNodeData } from "./buildGraph";

const elk = new ELK();

// Layered (Sugiyama) DAG layout, left-to-right — reads like an analysis console.
const LAYOUT_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.layered.spacing.nodeNodeBetweenLayers": "90",
  "elk.spacing.nodeNode": "40",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
};

export async function layoutElk(
  nodes: Node<OilNodeData>[],
  edges: Edge[],
): Promise<Node<OilNodeData>[]> {
  if (nodes.length === 0) return nodes;

  const graph = {
    id: "root",
    layoutOptions: LAYOUT_OPTIONS,
    children: nodes.map((n) => {
      const size = NODE_SIZES[n.data.nodeKind];
      return { id: n.id, width: size.width, height: size.height };
    }),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const res = await elk.layout(graph);
  const pos = new Map((res.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
  return nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position }));
}
