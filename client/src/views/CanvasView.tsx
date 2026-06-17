import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { EDGE_TYPES, type EdgeType, type FlowNodeType } from "@shared/enums";
import type {
  Constraint,
  DataElement,
  FlowEdge,
  Persona,
  ProcessStep,
  StepPersona,
} from "@shared/schemas";
import { useCreate, useList, useSoftDelete } from "@/lib/queries";
import { useUi, type LayoutMode } from "@/store";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/display";
import { Button, Select } from "@/components/ui/primitives";
import { buildGraph, type OilNodeData } from "./canvas/buildGraph";
import { layoutElk } from "./canvas/layout";
import { nodeTypes } from "./canvas/nodes";
import { DetailDrawer } from "./canvas/DetailDrawer";

const LAYOUT_MODES: { value: LayoutMode; label: string }[] = [
  { value: "spine", label: "Process spine" },
  { value: "full", label: "Full OIL" },
  { value: "constraint_focus", label: "Constraint focus" },
];

function CanvasInner({ vsId }: { vsId: string }) {
  const { layoutMode, layers, setLayoutMode, toggleLayer } = useUi();
  const { fitView } = useReactFlow();

  const steps = useList<ProcessStep>("process_steps", {
    where: { value_stream_id: vsId },
    orderBy: "sequence_index ASC",
  });
  const personas = useList<Persona>("personas", { where: { value_stream_id: vsId } });
  const allData = useList<DataElement>("data_elements");
  const allStepPersonas = useList<StepPersona>("step_personas");
  const constraints = useList<Constraint>("constraints", { where: { value_stream_id: vsId } });
  const edges = useList<FlowEdge>("flow_edges", { where: { value_stream_id: vsId } });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<OilNodeData>>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selected, setSelected] = useState<OilNodeData | null>(null);
  const [newEdgeType, setNewEdgeType] = useState<EdgeType>("dependency");
  const createEdge = useCreate<FlowEdge>("flow_edges");
  const deleteEdge = useSoftDelete("flow_edges");

  // Manually add cross-cutting dependency edges by dragging between node handles.
  const onConnect = (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    const [fromType, fromId] = c.source.split(/:(.+)/) as [FlowNodeType, string];
    const [toType, toId] = c.target.split(/:(.+)/) as [FlowNodeType, string];
    createEdge.mutate({
      value_stream_id: vsId,
      from_type: fromType,
      from_id: fromId,
      to_type: toType,
      to_id: toId,
      edge_type: newEdgeType,
      notes: null,
    });
  };

  const onEdgesDelete = (deleted: Edge[]) => {
    for (const e of deleted) {
      if (e.id.startsWith("fe-")) deleteEdge.mutate(e.id.slice(3));
    }
  };

  const stepIds = useMemo(
    () => new Set((steps.data ?? []).map((s) => s.id)),
    [steps.data],
  );

  const ready =
    steps.data && personas.data && allData.data && allStepPersonas.data && constraints.data && edges.data;

  useEffect(() => {
    if (!ready) return;
    const dataElements = (allData.data ?? []).filter((d) => stepIds.has(d.step_id));
    const stepPersonas = (allStepPersonas.data ?? []).filter((sp) => stepIds.has(sp.step_id));
    const graph = buildGraph({
      steps: steps.data ?? [],
      personas: personas.data ?? [],
      dataElements,
      stepPersonas,
      constraints: constraints.data ?? [],
      edges: edges.data ?? [],
      layoutMode,
      layers,
    });
    let cancelled = false;
    layoutElk(graph.nodes, graph.edges).then((positioned) => {
      if (cancelled) return;
      setNodes(positioned);
      setRfEdges(graph.edges);
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, steps.data, personas.data, allData.data, allStepPersonas.data, constraints.data, edges.data, layoutMode, layers]);

  return (
    <div className="flex h-full">
      <div className="relative min-w-0 flex-1">
        {/* Toolbar */}
        <div className="absolute left-3 top-3 z-10 flex flex-col gap-2">
          <div className="flex gap-1 rounded-md border border-border bg-surface/90 p-1 backdrop-blur">
            {LAYOUT_MODES.map((m) => (
              <Button
                key={m.value}
                size="sm"
                variant={layoutMode === m.value ? "default" : "ghost"}
                onClick={() => setLayoutMode(m.value)}
              >
                {m.label}
              </Button>
            ))}
          </div>
          {layoutMode === "full" && (
            <div className="flex gap-1 rounded-md border border-border bg-surface/90 p-1 backdrop-blur">
              {(["personas", "data", "constraints"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => toggleLayer(l)}
                  className={cn(
                    "rounded px-2 py-1 text-xs capitalize transition-colors",
                    layers[l] ? "bg-muted text-foreground" : "text-muted-foreground",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
          {layoutMode === "constraint_focus" && (
            <div className="rounded-md border border-border bg-surface/90 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
              Highlighting the system constraint and everything subordinate (downstream).
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface/90 p-1 text-[11px] text-muted-foreground backdrop-blur">
            <span className="pl-1">Drag to link · new edge:</span>
            <Select
              value={newEdgeType}
              onChange={(e) => setNewEdgeType(e.target.value as EdgeType)}
              className="h-7 w-32"
            >
              {EDGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          nodeTypes={nodeTypes}
          onNodeClick={(_, n) => setSelected(n.data as OilNodeData)}
          onPaneClick={() => setSelected(null)}
          fitView
          minZoom={0.2}
          maxZoom={1.8}
          proOptions={{ hideAttribution: true }}
          className="bg-background"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(218 20% 20%)" />
          <Controls className="!border-border !bg-surface" />
          <MiniMap
            pannable
            zoomable
            className="!bg-surface"
            nodeColor={(n) => {
              const k = (n.data as OilNodeData).nodeKind;
              return k === "step"
                ? "hsl(210 70% 55%)"
                : k === "persona"
                  ? "hsl(270 55% 62%)"
                  : "hsl(190 70% 50%)";
            }}
          />
        </ReactFlow>
      </div>
      {selected && <DetailDrawer node={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

export function CanvasView({ vsId }: { vsId: string }) {
  return (
    <ReactFlowProvider>
      <CanvasInner vsId={vsId} />
    </ReactFlowProvider>
  );
}
