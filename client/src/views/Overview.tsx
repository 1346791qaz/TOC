import { useState } from "react";
import { Pencil } from "lucide-react";
import type {
  Constraint,
  DataElement,
  Persona,
  ProcessStep,
  ValueStream,
} from "@shared/schemas";
import { useCandidates, useGaps, useList } from "@/lib/queries";
import { useUi } from "@/store";
import { valueStreamFields } from "@/lib/entityConfig";
import { titleCase } from "@/lib/display";
import { ViewShell } from "@/components/ViewShell";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { EntityModalForm } from "@/components/EntityModalForm";

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="text-center">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </Card>
  );
}

export function Overview({ vsId }: { vsId: string }) {
  const { setView } = useUi();
  const streams = useList<ValueStream>("value_streams");
  const steps = useList<ProcessStep>("process_steps", { where: { value_stream_id: vsId } });
  const personas = useList<Persona>("personas", { where: { value_stream_id: vsId } });
  const constraints = useList<Constraint>("constraints", { where: { value_stream_id: vsId } });
  const allData = useList<DataElement>("data_elements");
  const gaps = useGaps(vsId);
  const candidates = useCandidates(vsId);
  const [editing, setEditing] = useState(false);

  const vs = (streams.data ?? []).find((s) => s.id === vsId);
  const stepIds = new Set((steps.data ?? []).map((s) => s.id));
  const dataCount = (allData.data ?? []).filter((d) => stepIds.has(d.step_id)).length;
  const top = candidates.data?.[0];
  const systemConstraint = (constraints.data ?? []).find((c) => c.is_system_constraint);

  if (!vs) return null;

  return (
    <ViewShell
      title={vs.name}
      subtitle="Value-stream overview"
      actions={
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          <Pencil size={13} /> Edit
        </Button>
      }
    >
      <div className="space-y-4">
        <Card>
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="info">scope: {vs.scope_level}</Badge>
            {systemConstraint && <Badge tone="critical">system constraint set</Badge>}
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Problem statement
          </p>
          <p className="mb-3 text-sm">{vs.problem_statement || "—"}</p>
          {vs.narrative && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Narrative
              </p>
              <p className="text-sm text-muted-foreground">{vs.narrative}</p>
            </>
          )}
        </Card>

        <div className="grid grid-cols-5 gap-3">
          <Stat label="Steps" value={steps.data?.length ?? 0} />
          <Stat label="Personas" value={personas.data?.length ?? 0} />
          <Stat label="Data elements" value={dataCount} />
          <Stat label="Data gaps" value={gaps.data?.total_gaps ?? 0} />
          <Stat label="Constraints" value={constraints.data?.length ?? 0} />
        </div>

        {top && (
          <Card>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Top constraint candidate</p>
              <Badge tone="accent">{top.target_type}</Badge>
              <span className="font-medium">{top.label}</span>
              <span className="mono ml-auto text-primary">{top.score}</span>
              <Button size="sm" variant="outline" onClick={() => setView("candidates")}>
                Review candidates
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {top.factors.map((f) => titleCase(f.key.replace(/_/g, " "))).join(" · ")}
            </p>
          </Card>
        )}
      </div>

      <EntityModalForm
        open={editing}
        onClose={() => setEditing(false)}
        entityKey="value_streams"
        title="Edit Value Stream"
        fields={valueStreamFields}
        initial={vs}
      />
    </ViewShell>
  );
}
