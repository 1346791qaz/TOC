import { Handle, Position, type NodeProps, type EdgeProps } from "@xyflow/react";
import { AlertTriangle, ChevronDown, ChevronRight, Database, GripHorizontal, User, Workflow } from "lucide-react";
import { fmtNum } from "@/lib/utils";
import { presenceTone } from "@/lib/display";
import { useUi } from "@/store";
import { Badge } from "@/components/ui/primitives";
import type { OilNodeData } from "./buildGraph";

const severityColor = (rank: number) =>
  rank >= 4 ? "hsl(0 80% 58%)" : rank >= 3 ? "hsl(38 92% 55%)" : "hsl(200 80% 55%)";

function ConstraintMarker({ data }: { data: OilNodeData }) {
  const c = data.constraint;
  if (!c) return null;
  const size = 14 + c.maxRank * 3;
  return (
    <div
      className="absolute -right-2 -top-2 grid place-items-center rounded-full text-[10px] font-bold text-white shadow"
      style={{ width: size, height: size, background: severityColor(c.maxRank) }}
      title={`${c.count} constraint(s)${c.isSystem ? " — system constraint" : ""}`}
    >
      {c.isSystem ? "★" : c.count}
    </div>
  );
}

const baseCard =
  "relative rounded-md border-2 px-2.5 py-1.5 text-left shadow-md transition-opacity";

export function StepNode({ data, selected }: NodeProps) {
  const d = data as OilNodeData;
  const s = d.step;
  const queue = s && s.wait_time != null && s.cycle_time != null && s.wait_time > s.cycle_time;
  const missing = 0; // computed badge omitted; gaps shown in report
  const nested = (d.depth ?? 0) > 0;
  // Nested sub-steps take their executor-domain color so they read as detail of
  // the column they live in; top-level steps stay the canonical step blue.
  const accent = nested ? d.deptColor ?? "hsl(210 70% 55%)" : "hsl(210 70% 55%)";
  return (
    <div
      data-testid="oilnode-step"
      className={baseCard}
      style={{
        width: 210,
        borderColor: d.constraint?.isSystem ? "hsl(0 80% 58%)" : accent,
        borderLeftWidth: nested ? 4 : 2,
        background: nested ? "hsl(220 26% 13%)" : "hsl(220 26% 11%)",
        opacity: d.dimmed ? 0.3 : 1,
        outline: selected ? "2px solid hsl(38 92% 52%)" : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <ConstraintMarker data={d} />
      <div className="flex items-center gap-1.5">
        {nested ? (
          <span className="text-xs" style={{ color: accent }}>↳</span>
        ) : (
          <Workflow size={13} style={{ color: "hsl(210 70% 65%)" }} />
        )}
        <span className="truncate text-sm font-semibold">{d.label}</span>
      </div>
      <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground">
        <span className="mono">C {fmtNum(s?.cycle_time)}</span>
        <span className="mono">W {fmtNum(s?.wait_time)}</span>
        <span className="mono">{fmtNum(s?.pct_complete_accurate, "%")}</span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        {queue && <Badge tone="gap">queue</Badge>}
        {missing > 0 && (
          <Badge tone="critical">
            <AlertTriangle size={9} /> {missing}
          </Badge>
        )}
        {!!d.subStepCount && (
          <button
            className="nodrag ml-auto flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary hover:bg-primary/20"
            title={d.isExpanded ? "Collapse sub-steps" : "Show sub-steps"}
            onClick={(ev) => {
              ev.stopPropagation();
              useUi.getState().toggleExpand(d.entityId);
            }}
          >
            {d.isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {d.subStepCount} sub
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function PersonaNode({ data, selected }: NodeProps) {
  const d = data as OilNodeData;
  return (
    <div
      data-testid="oilnode-persona"
      className={baseCard}
      style={{
        width: 176,
        borderColor: "hsl(270 55% 62%)",
        background: "hsl(270 30% 12%)",
        opacity: d.dimmed ? 0.3 : 1,
        outline: selected ? "2px solid hsl(38 92% 52%)" : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <ConstraintMarker data={d} />
      <div className="flex items-center gap-1.5">
        <User size={12} style={{ color: "hsl(270 70% 75%)" }} />
        <span className="truncate text-sm font-medium">{d.label}</span>
      </div>
      <p className="truncate text-[10px] text-muted-foreground">
        {d.persona?.role_title ?? d.persona?.scope_level}
      </p>
    </div>
  );
}

export function DataNode({ data, selected }: NodeProps) {
  const d = data as OilNodeData;
  const de = d.data;
  return (
    <div
      data-testid="oilnode-data"
      className="relative rounded border px-2 py-1 text-left shadow transition-opacity"
      style={{
        width: 156,
        borderColor: de && de.presence !== "present" ? "hsl(38 92% 55%)" : "hsl(190 70% 50%)",
        background: "hsl(190 40% 10%)",
        opacity: d.dimmed ? 0.3 : 1,
        outline: selected ? "2px solid hsl(38 92% 52%)" : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-1">
        <Database size={11} style={{ color: "hsl(190 70% 60%)" }} />
        <span className="truncate text-xs font-medium">{d.label}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1">
        {de && <Badge tone={presenceTone[de.presence]}>{de.presence}</Badge>}
        {de?.is_key && <Badge tone="accent">key</Badge>}
      </div>
    </div>
  );
}

// ---- Attached-cell layout components ------------------------------------

// Faded department backdrop drawn behind a group of persona cells.
// The body has pointer-events:none so edge clicks pass through. The header
// label is the drag handle — it has pointer-events:auto so the user can grab
// and drag the entire frame (React Flow dragHandle=".lane-header" is set on
// the node object in attachedLayout.ts).
export function DeptBackground({ data }: NodeProps) {
  const d = data as OilNodeData;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: d.deptBg ?? "hsla(270, 45%, 24%, 0.4)",
        border: `1px dashed ${d.deptColor ?? "hsl(270 50% 50%)"}`,
        borderRadius: 8,
        pointerEvents: "none",
      }}
    >
      <span
        className="lane-header absolute left-2 top-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{
          color: d.deptColor ?? "hsl(270 60% 80%)",
          background: "hsl(222 30% 6% / 0.65)",
          pointerEvents: "auto",
          cursor: "grab",
          userSelect: "none",
        }}
      >
        <GripHorizontal size={10} />
        {d.label}
      </span>
    </div>
  );
}

// Persona cell: SOLID border + a filled domain-color chip with a person icon.
export function PersonaCell({ data, selected }: NodeProps) {
  const d = data as OilNodeData;
  const color = d.deptColor ?? "hsl(270 55% 62%)";
  return (
    <div
      data-testid="oilnode-persona"
      className="relative box-border flex items-stretch gap-1.5 overflow-hidden rounded-md border-2 border-solid px-0 py-0"
      style={{
        width: 200,
        height: 48,
        borderColor: color,
        background: "hsl(222 28% 14%)",
        outline: selected ? "2px solid hsl(38 92% 52%)" : undefined,
      }}
    >
      <ConstraintMarker data={d} />
      {/* Filled person chip — the persona signature. */}
      <div
        className="flex w-7 shrink-0 items-center justify-center"
        style={{ background: color, color: "hsl(222 30% 10%)" }}
      >
        <User size={14} />
      </div>
      <div className="min-w-0 flex-1 py-1 pr-1.5">
        <div className="flex items-center gap-1">
          {d.isExecutor && (
            <span
              title="Executor — owns this step"
              style={{ background: color }}
              className="inline-block h-2 w-2 shrink-0 rounded-full"
            />
          )}
          <span className="truncate text-xs font-semibold">{d.label}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1">
          {d.roleOnStep && (
            <Badge tone={d.isExecutor ? "accent" : "info"}>{d.roleOnStep}</Badge>
          )}
          <span className="truncate text-[10px] text-muted-foreground">{d.persona?.function}</span>
        </div>
      </div>
    </div>
  );
}

// Data cell: DASHED cyan/amber border + a database chip + monospace location.
// Deliberately distinct from the solid, person-chipped persona cells.
export function DataCell({ data, selected }: NodeProps) {
  const d = data as OilNodeData;
  const de = d.data;
  const warn = de && de.presence !== "present";
  const accent = warn ? "hsl(38 92% 55%)" : "hsl(190 80% 55%)";
  const loc =
    de && (de.table_or_view || de.field_name)
      ? [de.table_or_view, de.field_name].filter(Boolean).join(".")
      : null;
  return (
    <div
      data-testid="oilnode-data"
      className="relative box-border flex items-stretch gap-1.5 overflow-hidden rounded-md border border-dashed px-0 py-0"
      style={{
        width: 200,
        height: 48,
        borderColor: accent,
        background: "hsl(196 42% 9%)",
        outline: selected ? "2px solid hsl(38 92% 52%)" : undefined,
      }}
    >
      <div
        className="flex w-7 shrink-0 items-center justify-center"
        style={{ background: accent, color: "hsl(200 40% 8%)" }}
      >
        <Database size={13} />
      </div>
      <div className="min-w-0 flex-1 py-1 pr-1.5">
        <div className="flex items-center gap-1">
          <span className="truncate text-xs font-semibold">{d.label}</span>
        </div>
        {loc ? (
          <p className="mono truncate text-[10px] text-accent">{loc}</p>
        ) : (
          <div className="mt-0.5 flex items-center gap-1">
            {de && <Badge>{de.binding_point}</Badge>}
            {de && <Badge tone={presenceTone[de.presence]}>{de.presence}</Badge>}
            {de?.is_key && <Badge tone="accent">key</Badge>}
          </div>
        )}
      </div>
    </div>
  );
}

export const nodeTypes = {
  step: StepNode,
  persona: PersonaNode,
  data_element: DataNode,
  personaCell: PersonaCell,
  dataCell: DataCell,
  deptBg: DeptBackground,
};

// Custom edge that separates parallel edges (same source+target) by arcing them
// through different vertical positions. Single edges render as a standard bezier.
export function ParallelBezierEdge({
  sourceX, sourceY, targetX, targetY, style, markerEnd, data,
}: EdgeProps) {
  const idx = (data?.parallelIndex as number) ?? 0;
  const total = (data?.parallelTotal as number) ?? 1;
  const vOffset = (idx - (total - 1) / 2) * 26;
  const hDist = Math.abs(targetX - sourceX) * 0.3;
  const d = `M ${sourceX},${sourceY} C ${sourceX + hDist},${sourceY + vOffset} ${targetX - hDist},${targetY + vOffset} ${targetX},${targetY}`;
  return (
    <>
      {/* Wide transparent stroke makes the thin line much easier to click */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={18} />
      <path d={d} fill="none" className="react-flow__edge-path" style={style} markerEnd={markerEnd} />
    </>
  );
}

export const edgeTypes = { parallel: ParallelBezierEdge };
