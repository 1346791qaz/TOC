import { useEffect, useMemo, useRef, useState } from "react";
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
import { ChevronsDownUp, ChevronsUpDown, Info, Plus } from "lucide-react";
import { EDGE_TYPES, type EdgeType, type FlowNodeType } from "@shared/enums";
import type {
  Constraint,
  DataElement,
  FlowEdge,
  Persona,
  ProcessStep,
  StepDataElement,
  StepPersona,
  ValueStream,
} from "@shared/schemas";
import { linkDataElements } from "@shared/gaps";
import { useCreate, useList, useSoftDelete, useUpdate } from "@/lib/queries";
import { useUi, type LayoutMode } from "@/store";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/display";
import { processStepFields } from "@/lib/entityConfig";
import { Button, Select } from "@/components/ui/primitives";
import { EntityModalForm } from "@/components/EntityModalForm";
import { buildGraph, type OilNodeData } from "./canvas/buildGraph";
import { buildAttachedGraph } from "./canvas/attachedLayout";
import { layoutElk } from "./canvas/layout";
import { nodeTypes, edgeTypes } from "./canvas/nodes";
import { DetailDrawer } from "./canvas/DetailDrawer";

const EDGE_TYPE_INFO = [
  { type: "sequence",    color: "hsl(215 20% 45%)", label: "Sequence",    desc: "Steps must happen in this order; A flows directly into B." },
  { type: "dependency",  color: "hsl(38 92% 55%)",  label: "Dependency",  desc: "B cannot start until A delivers something (data, approval, artifact)." },
  { type: "data_flow",   color: "hsl(190 70% 50%)", label: "Data Flow",   desc: "A piece of information or data artifact moves from A to B." },
  { type: "handoff",     color: "hsl(270 55% 62%)", label: "Handoff",     desc: "Work is physically passed from one team or person to another." },
] as const;

const LAYOUT_MODES: { value: LayoutMode; label: string }[] = [
  { value: "spine", label: "Process spine" },
  { value: "full", label: "Full OIL" },
  { value: "constraint_focus", label: "Constraint focus" },
];

function CanvasInner({ vsId }: { vsId: string }) {
  const { layoutMode, layers, expandedSteps, setLayoutMode, toggleLayer, toggleExpand, setExpanded } =
    useUi();
  const { fitView } = useReactFlow();

  const valueStreams = useList<ValueStream>("value_streams");
  const steps = useList<ProcessStep>("process_steps", {
    where: { value_stream_id: vsId },
    orderBy: "sequence_index ASC",
  });
  const personas = useList<Persona>("personas", { where: { value_stream_id: vsId } });
  const allDataDefs = useList<DataElement>("data_elements", { where: { value_stream_id: vsId } });
  const allSDEs = useList<StepDataElement>("step_data_elements");
  const allStepPersonas = useList<StepPersona>("step_personas");
  const constraints = useList<Constraint>("constraints", { where: { value_stream_id: vsId } });
  const edges = useList<FlowEdge>("flow_edges", { where: { value_stream_id: vsId } });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<OilNodeData>>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selected, setSelected] = useState<OilNodeData | null>(null);
  const [newEdgeType, setNewEdgeType] = useState<EdgeType>("dependency");
  const [addParent, setAddParent] = useState<string | null | undefined>(undefined); // undefined = closed
  const createEdge = useCreate<FlowEdge>("flow_edges");
  const deleteEdge = useSoftDelete("flow_edges");
  const updateEdge = useUpdate<FlowEdge>("flow_edges");
  const [edgeMenu, setEdgeMenu] = useState<{
    id: string;
    edgeType: EdgeType;
    x: number;
    y: number;
  } | null>(null);
  const [showEdgeInfo, setShowEdgeInfo] = useState(false);

  const allSteps = useMemo(() => steps.data ?? [], [steps.data]);
  const allStepIds = useMemo(() => new Set(allSteps.map((s) => s.id)), [allSteps]);
  const expandedSet = useMemo(() => new Set(expandedSteps), [expandedSteps]);
  const parentsWithKids = useMemo(
    () => [...new Set(allSteps.filter((s) => s.parent_step_id).map((s) => s.parent_step_id!))],
    [allSteps],
  );
  const vsName = valueStreams.data?.find((v) => v.id === vsId)?.name ?? "Value stream";

  const onConnect = (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    const [fromType, fromId] = c.source.split(/:(.+)/) as [FlowNodeType, string];
    const [toType, toId] = c.target.split(/:(.+)/) as [FlowNodeType, string];
    createEdge.mutate({
      value_stream_id: vsId, from_type: fromType, from_id: fromId,
      to_type: toType, to_id: toId, edge_type: newEdgeType, notes: null,
    });
  };
  const onEdgesDelete = (deleted: Edge[]) => {
    for (const e of deleted) if (e.id.startsWith("fe-")) deleteEdge.mutate(e.id.slice(3));
    setEdgeMenu(null);
  };

  // Lane-drag: when a deptBg frame is dragged, move all member nodes with it.
  // We capture start positions once and compute absolute offset from there to
  // avoid floating-point drift from delta-on-delta accumulation.
  const dragOriginRef = useRef<{
    laneId: string;
    lanePos: { x: number; y: number };
    members: Map<string, { x: number; y: number }>;
  } | null>(null);

  const onNodeDragStart = (_: unknown, node: Node) => {
    if (node.type !== "deptBg") return;
    const members = new Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      if ((n.data as OilNodeData).laneId === node.id)
        members.set(n.id, { x: n.position.x, y: n.position.y });
    }
    dragOriginRef.current = { laneId: node.id, lanePos: { x: node.position.x, y: node.position.y }, members };
  };

  const onNodeDrag = (_: unknown, node: Node) => {
    const o = dragOriginRef.current;
    if (!o || node.id !== o.laneId) return;
    const dx = node.position.x - o.lanePos.x;
    const dy = node.position.y - o.lanePos.y;
    setNodes((nds) =>
      nds.map((n) => {
        const sp = o.members.get(n.id);
        return sp ? { ...n, position: { x: sp.x + dx, y: sp.y + dy } } : n;
      }),
    );
  };

  const ready =
    steps.data && personas.data && allDataDefs.data && allSDEs.data && allStepPersonas.data && constraints.data && edges.data;

  useEffect(() => {
    if (!ready) return;
    const vsSDEs = (allSDEs.data ?? []).filter((sde) => allStepIds.has(sde.step_id));
    const dataElements = linkDataElements(allDataDefs.data ?? [], vsSDEs);
    const stepPersonas = (allStepPersonas.data ?? []).filter((sp) => allStepIds.has(sp.step_id));
    const refit = () => setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);

    if (layoutMode === "full") {
      const graph = buildAttachedGraph({
        steps: allSteps,
        personas: personas.data ?? [],
        dataElements,
        stepPersonas,
        constraints: constraints.data ?? [],
        edges: edges.data ?? [],
        layers,
        expanded: expandedSet,
      });
      setNodes(graph.nodes);
      setRfEdges(graph.edges);
      refit();
      return;
    }

    // Spine / constraint-focus: top-level steps only, elk layered layout.
    const topSteps = allSteps.filter((s) => !s.parent_step_id);
    const graph = buildGraph({
      steps: topSteps,
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
      refit();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, allSteps, personas.data, allDataDefs.data, allSDEs.data, allStepPersonas.data, constraints.data, edges.data, layoutMode, layers, expandedSet]);

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header: value stream + expand controls + add */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
          <span className="truncate text-sm font-semibold">{vsName}</span>
          {parentsWithKids.length > 0 && layoutMode === "full" && (
            <div className="ml-2 flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setExpanded(parentsWithKids)}>
                <ChevronsUpDown size={13} /> Expand all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setExpanded([])}>
                <ChevronsDownUp size={13} /> Collapse all
              </Button>
            </div>
          )}
          <Button size="sm" variant="subtle" className="ml-auto" onClick={() => setAddParent(null)}>
            <Plus size={13} /> Step
          </Button>
        </div>

        <div className="relative min-w-0 flex-1">
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
            <div className="relative flex items-center gap-1.5 rounded-md border border-border bg-surface/90 p-1 text-[11px] text-muted-foreground backdrop-blur">
              <span className="shrink-0 pl-1">Drag to link · new edge:</span>
              <Select
                value={newEdgeType}
                onChange={(e) => setNewEdgeType(e.target.value as EdgeType)}
                className="h-7 w-44"
              >
                {EDGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ))}
              </Select>
              <button
                onClick={(e) => { e.stopPropagation(); setShowEdgeInfo((v) => !v); }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-muted"
                title="Edge type guide"
              >
                <Info size={12} />
              </button>
              {showEdgeInfo && (
                <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-border bg-surface p-3 shadow-lg leading-relaxed">
                  <p className="mb-2 font-semibold text-foreground">Edge types</p>
                  <div className="space-y-2 text-muted-foreground">
                    {EDGE_TYPE_INFO.map(({ type, color, label, desc }) => (
                      <div key={type} className="flex gap-2">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                        <span><span className="font-medium text-foreground">{label}</span> — {desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {layoutMode === "full" && (
              <div className="rounded-md border border-border bg-surface/90 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
                Click a step's “sub” toggle (or double-click it) to expand its sub-steps inline.
              </div>
            )}
          </div>

          <ReactFlow
            nodes={nodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgesDelete={onEdgesDelete}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onEdgeClick={(evt, edge) => {
              if (!edge.id.startsWith("fe-")) return;
              const feId = edge.id.slice(3);
              const fe = edges.data?.find((e) => e.id === feId);
              if (!fe) return;
              setEdgeMenu({ id: feId, edgeType: fe.edge_type, x: evt.clientX, y: evt.clientY });
              // Highlight the two connected nodes so the user knows which steps this edge links.
              setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === edge.source || n.id === edge.target })));
            }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, n) => {
              setEdgeMenu(null);
              if (n.type === "deptBg") return;
              setSelected(n.data as OilNodeData);
            }}
            onNodeDoubleClick={(_, n) => {
              const data = n.data as OilNodeData;
              if (data.nodeKind === "step" && data.entityId && data.subStepCount)
                toggleExpand(data.entityId);
            }}
            onPaneClick={() => { setSelected(null); setEdgeMenu(null); setShowEdgeInfo(false); }}
            fitView
            zoomOnDoubleClick={false}
            minZoom={0.15}
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
      </div>
      {selected && (
        <DetailDrawer
          node={selected}
          onClose={() => setSelected(null)}
          onAddSub={(stepId) => setAddParent(stepId)}
          onToggleExpand={(stepId) => toggleExpand(stepId)}
        />
      )}

      <EntityModalForm
        open={addParent !== undefined}
        onClose={() => setAddParent(undefined)}
        entityKey="process_steps"
        title={addParent ? "New Sub-step" : "New Process Step"}
        fields={processStepFields}
        extra={{ value_stream_id: vsId, parent_step_id: addParent ?? null }}
      />

      {edgeMenu && (
        <div
          className="fixed z-50 min-w-[220px] rounded-md border border-border bg-surface p-3 shadow-lg"
          style={{ left: edgeMenu.x + 8, top: edgeMenu.y - 10 }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Flow edge
          </p>
          <div className="space-y-2">
            <Select
              value={edgeMenu.edgeType}
              onChange={(e) => {
                const newType = e.target.value as EdgeType;
                updateEdge.mutate({ id: edgeMenu.id, data: { edge_type: newType } });
                setEdgeMenu((m) => m && { ...m, edgeType: newType });
              }}
              className="h-7"
            >
              {EDGE_TYPES.map((t) => (
                <option key={t} value={t}>{titleCase(t)}</option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="danger"
              className="w-full"
              onClick={() => {
                deleteEdge.mutate(edgeMenu.id);
                setEdgeMenu(null);
                setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
              }}
            >
              Remove edge
            </Button>
          </div>
        </div>
      )}
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
