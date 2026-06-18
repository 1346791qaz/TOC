import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Database, User, Workflow } from "lucide-react";
import { fmtNum } from "@/lib/utils";
import { presenceTone } from "@/lib/display";
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
  return (
    <div
      data-testid="oilnode-step"
      className={baseCard}
      style={{
        width: 210,
        borderColor: d.constraint?.isSystem ? "hsl(0 80% 58%)" : "hsl(210 70% 55%)",
        background: "hsl(220 26% 11%)",
        opacity: d.dimmed ? 0.3 : 1,
        outline: selected ? "2px solid hsl(38 92% 52%)" : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <ConstraintMarker data={d} />
      <div className="flex items-center gap-1.5">
        <Workflow size={13} style={{ color: "hsl(210 70% 65%)" }} />
        <span className="truncate text-sm font-semibold">{d.label}</span>
      </div>
      <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground">
        <span className="mono">C {fmtNum(s?.cycle_time)}</span>
        <span className="mono">W {fmtNum(s?.wait_time)}</span>
        <span className="mono">{fmtNum(s?.pct_complete_accurate, "%")}</span>
      </div>
      <div className="mt-1 flex gap-1">
        {queue && <Badge tone="gap">queue</Badge>}
        {missing > 0 && (
          <Badge tone="critical">
            <AlertTriangle size={9} /> {missing}
          </Badge>
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
        className="absolute left-1.5 top-1 text-[9px] font-semibold uppercase tracking-wider"
        style={{ color: d.deptColor ?? "hsl(270 60% 80%)", opacity: 0.85 }}
      >
        {d.label}
      </span>
    </div>
  );
}

export function PersonaCell({ data, selected }: NodeProps) {
  const d = data as OilNodeData;
  const color = d.deptColor ?? "hsl(270 55% 62%)";
  return (
    <div
      data-testid="oilnode-persona"
      className="relative box-border rounded-md border bg-surface-raised px-2 py-1"
      style={{
        width: 200,
        height: 48,
        borderColor: color,
        background: "hsl(220 26% 13%)",
        outline: selected ? "2px solid hsl(38 92% 52%)" : undefined,
      }}
    >
      <ConstraintMarker data={d} />
      <div className="flex items-center gap-1">
        <User size={11} style={{ color }} />
        <span className="truncate text-xs font-medium">{d.label}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1">
        {d.roleOnStep && <Badge tone="info">{d.roleOnStep}</Badge>}
        <span className="truncate text-[10px] text-muted-foreground">{d.persona?.function}</span>
      </div>
    </div>
  );
}

export function DataCell({ data, selected }: NodeProps) {
  const d = data as OilNodeData;
  const de = d.data;
  const warn = de && de.presence !== "present";
  return (
    <div
      data-testid="oilnode-data"
      className="relative box-border rounded border px-2 py-1"
      style={{
        width: 200,
        height: 44,
        borderColor: warn ? "hsl(38 92% 55%)" : "hsl(190 70% 50%)",
        background: "hsl(190 40% 10%)",
        outline: selected ? "2px solid hsl(38 92% 52%)" : undefined,
      }}
    >
      <div className="flex items-center gap-1">
        <Database size={11} style={{ color: "hsl(190 70% 60%)" }} />
        <span className="truncate text-xs font-medium">{d.label}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1">
        {de && <Badge>{de.binding_point}</Badge>}
        {de && <Badge tone={presenceTone[de.presence]}>{de.presence}</Badge>}
        {de?.is_key && <Badge tone="accent">key</Badge>}
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
