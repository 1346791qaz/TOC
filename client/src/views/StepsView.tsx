import { useState } from "react";
import { ArrowRight, Database, Layers, Pencil, Plus, X } from "lucide-react";
import type { DataElement, Persona, ProcessStep, StepPersona, ValueStream } from "@shared/schemas";
import { RACI_ROLES } from "@shared/enums";
import { useCreate, useList, useSoftDelete } from "@/lib/queries";
import { dataElementFields, processStepFields } from "@/lib/entityConfig";
import { useUi } from "@/store";
import { fmtNum } from "@/lib/utils";
import { presenceTone, titleCase } from "@/lib/display";
import { buildStepPath, childCountByParent, stepsAtLevel } from "./canvas/hierarchy";
import { ViewShell, EmptyHint } from "@/components/ViewShell";
import { StepBreadcrumb } from "@/components/StepBreadcrumb";
import { Badge, Button, Card, Select } from "@/components/ui/primitives";
import { EntityModalForm } from "@/components/EntityModalForm";

export function StepsView({ vsId }: { vsId: string }) {
  const { stepPath, setStepPath } = useUi();
  const valueStreams = useList<ValueStream>("value_streams");
  const steps = useList<ProcessStep>("process_steps", {
    where: { value_stream_id: vsId },
    orderBy: "sequence_index ASC",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProcessStep | null>(null);
  const [creating, setCreating] = useState(false);
  const del = useSoftDelete("process_steps");

  const allSteps = steps.data ?? [];
  const parentStepId = stepPath.at(-1)?.id ?? null;
  const list = stepsAtLevel(allSteps, parentStepId);
  const childCount = childCountByParent(allSteps);
  const selected = list.find((s) => s.id === selectedId) ?? list[0] ?? null;
  const vsName = valueStreams.data?.find((v) => v.id === vsId)?.name ?? "Value stream";
  const drillInto = (stepId: string) => {
    setStepPath(buildStepPath(stepId, allSteps));
    setSelectedId(null);
  };

  return (
    <ViewShell
      title="Process Steps"
      subtitle={parentStepId ? "Sub-steps of the selected step." : "The value-stream spine — each step carries entry / action / exit criteria."}
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={14} /> {parentStepId ? "Sub-step" : "Step"}
        </Button>
      }
    >
      <div className="mb-3">
        <StepBreadcrumb valueStreamName={vsName} />
      </div>
      {list.length === 0 ? (
        <EmptyHint>
          {parentStepId
            ? "No sub-steps here yet. Add one to map this step's internals."
            : "No process steps yet. Add the first step to build the spine."}
        </EmptyHint>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
          {/* Spine list */}
          <div className="space-y-1.5">
            {list.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  selected?.id === s.id
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-surface hover:bg-muted/50"
                }`}
              >
                <span className="mono grid h-5 w-5 place-items-center rounded bg-muted text-[10px]">
                  {s.sequence_index}
                </span>
                <span className="truncate font-medium">{s.name}</span>
                {s.wait_time != null && s.cycle_time != null && s.wait_time > s.cycle_time && (
                  <Badge tone="gap" className="ml-auto">
                    queue
                  </Badge>
                )}
                {!!childCount.get(s.id) && (
                  <Badge
                    tone="accent"
                    className={s.wait_time != null && s.cycle_time != null && s.wait_time > s.cycle_time ? "" : "ml-auto"}
                  >
                    <Layers size={9} /> {childCount.get(s.id)}
                  </Badge>
                )}
                {i < list.length - 1 && <ArrowRight size={12} className="opacity-30" />}
              </button>
            ))}
          </div>

          {/* Detail */}
          {selected ? (
            <StepDetail
              key={selected.id}
              step={selected}
              vsId={vsId}
              allSteps={allSteps}
              onEdit={() => setEditing(selected)}
              onDrill={() => drillInto(selected.id)}
              onDrillChild={(childId) => drillInto(childId)}
              onDelete={() => {
                if (confirm("Move step to Trash?")) {
                  del.mutate(selected.id);
                  setSelectedId(null);
                }
              }}
            />
          ) : (
            <EmptyHint>Select a step.</EmptyHint>
          )}
        </div>
      )}

      <EntityModalForm
        open={creating}
        onClose={() => setCreating(false)}
        entityKey="process_steps"
        title={parentStepId ? "New Sub-step" : "New Process Step"}
        fields={processStepFields}
        extra={{ value_stream_id: vsId, parent_step_id: parentStepId }}
      />
      {editing && (
        <EntityModalForm
          open
          onClose={() => setEditing(null)}
          entityKey="process_steps"
          title="Edit Process Step"
          fields={processStepFields}
          initial={editing}
        />
      )}
    </ViewShell>
  );
}

function Criterion({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{value || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}

function StepDetail({
  step,
  vsId,
  allSteps,
  onEdit,
  onDrill,
  onDrillChild,
  onDelete,
}: {
  step: ProcessStep;
  vsId: string;
  allSteps: ProcessStep[];
  onEdit: () => void;
  onDrill: () => void;
  onDrillChild: (childId: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3">
      <Card>
        <div className="mb-2 flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold">{step.name}</h2>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={onEdit}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete}>
              <X size={14} className="text-status-critical" />
            </Button>
          </div>
        </div>
        <div className="mb-3 flex gap-4 text-xs text-muted-foreground">
          <span>Cycle: <span className="mono text-foreground">{fmtNum(step.cycle_time)}</span></span>
          <span>Wait: <span className="mono text-foreground">{fmtNum(step.wait_time)}</span></span>
          <span>% C&A: <span className="mono text-foreground">{fmtNum(step.pct_complete_accurate, "%")}</span></span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Criterion label="Entry" value={step.entry_criteria} />
          <Criterion label="Action" value={step.action} />
          <Criterion label="Exit" value={step.exit_criteria} />
        </div>
        {step.pain_points && (
          <div className="mt-3 rounded-md border border-status-gap/40 bg-status-gap/5 p-2">
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-status-gap">
              Pain points
            </p>
            <p className="whitespace-pre-wrap text-sm">{step.pain_points}</p>
          </div>
        )}
      </Card>

      <DataLandscape step={step} />
      <StepPersonas step={step} vsId={vsId} />
      <StepData step={step} />
      <StepSubSteps step={step} vsId={vsId} allSteps={allSteps} onDrill={onDrill} onDrillChild={onDrillChild} />
    </div>
  );
}

function DataLandscape({ step }: { step: ProcessStep }) {
  const rows: [string, string | null][] = [
    ["Source system(s)", step.data_source_systems],
    ["Database(s)", step.data_databases],
    ["Table(s)", step.data_tables],
    ["ETL jobs", step.data_etl_jobs],
  ];
  const hasAny = rows.some(([, v]) => v);
  return (
    <Card>
      <p className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
        <Database size={11} /> Data landscape
      </p>
      {hasAny ? (
        <div className="grid grid-cols-2 gap-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <p className="mono text-xs">{value || <span className="text-muted-foreground">—</span>}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No source systems / databases / tables / ETL captured. Add via Edit.
        </p>
      )}
    </Card>
  );
}

function StepSubSteps({
  step,
  vsId,
  allSteps,
  onDrill,
  onDrillChild,
}: {
  step: ProcessStep;
  vsId: string;
  allSteps: ProcessStep[];
  onDrill: () => void;
  onDrillChild: (childId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const children = stepsAtLevel(allSteps, step.id).sort(
    (a, b) => a.sequence_index - b.sequence_index,
  );

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Layers size={11} /> Sub-steps ({children.length})
        </p>
        <div className="flex gap-1.5">
          {children.length > 0 && (
            <Button size="sm" variant="outline" onClick={onDrill}>
              Open level
            </Button>
          )}
          <Button size="sm" variant="subtle" onClick={() => setCreating(true)}>
            <Plus size={12} /> Add sub-step
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        {children.map((c) => (
          <button
            key={c.id}
            onClick={() => onDrillChild(c.id)}
            className="flex w-full items-center gap-2 rounded bg-muted/40 px-2 py-1 text-left text-sm hover:bg-muted"
          >
            <span className="mono grid h-5 w-5 place-items-center rounded bg-muted text-[10px]">
              {c.sequence_index}
            </span>
            <span className="truncate font-medium">{c.name}</span>
            <ArrowRight size={12} className="ml-auto opacity-40" />
          </button>
        ))}
        {children.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No sub-steps. Break this step into its detailed procedure.
          </p>
        )}
      </div>

      <EntityModalForm
        open={creating}
        onClose={() => setCreating(false)}
        entityKey="process_steps"
        title="New Sub-step"
        fields={processStepFields}
        extra={{ value_stream_id: vsId, parent_step_id: step.id }}
      />
    </Card>
  );
}

function StepPersonas({ step, vsId }: { step: ProcessStep; vsId: string }) {
  const personas = useList<Persona>("personas", { where: { value_stream_id: vsId } });
  const links = useList<StepPersona>("step_personas", { where: { step_id: step.id } });
  const create = useCreate("step_personas");
  const del = useSoftDelete("step_personas");
  const [personaId, setPersonaId] = useState("");
  const [role, setRole] = useState<string>("executor");

  const byId = new Map((personas.data ?? []).map((p) => [p.id, p]));

  return (
    <Card data-testid="step-personas">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Personas (RACI)
      </p>
      <div className="mb-2 space-y-1">
        {(links.data ?? []).map((l) => (
          <div key={l.id} className="flex items-center gap-2 rounded bg-muted/40 px-2 py-1 text-sm">
            <span className="font-medium">{byId.get(l.persona_id)?.name ?? "Unknown"}</span>
            <Badge tone="info">{l.role_on_step}</Badge>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-6 w-6"
              onClick={() => del.mutate(l.id)}
            >
              <X size={12} />
            </Button>
          </div>
        ))}
        {(links.data ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">No personas assigned.</p>
        )}
      </div>
      <div className="flex gap-1.5">
        <Select value={personaId} onChange={(e) => setPersonaId(e.target.value)} className="h-8">
          <option value="">Add persona…</option>
          {(personas.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select value={role} onChange={(e) => setRole(e.target.value)} className="h-8 w-32">
          {RACI_ROLES.map((r) => (
            <option key={r} value={r}>
              {titleCase(r)}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          disabled={!personaId}
          onClick={() => {
            create.mutate(
              { step_id: step.id, persona_id: personaId, role_on_step: role },
              { onSuccess: () => setPersonaId("") },
            );
          }}
        >
          Add
        </Button>
      </div>
    </Card>
  );
}

function StepData({ step }: { step: ProcessStep }) {
  const data = useList<DataElement>("data_elements", { where: { step_id: step.id } });
  const del = useSoftDelete("data_elements");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DataElement | null>(null);

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Data Elements
        </p>
        <Button size="sm" variant="subtle" onClick={() => setCreating(true)}>
          <Plus size={12} /> Bind data
        </Button>
      </div>
      <div className="space-y-1">
        {(data.data ?? []).map((d) => (
          <div key={d.id} className="flex items-center gap-2 rounded bg-muted/40 px-2 py-1 text-sm">
            <Badge>{d.binding_point}</Badge>
            <span className="font-medium">{d.name}</span>
            {d.is_key && <Badge tone="accent">key</Badge>}
            <Badge tone={presenceTone[d.presence]}>{d.presence}</Badge>
            <span className="ml-auto flex gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(d)}>
                <Pencil size={11} />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => del.mutate(d.id)}>
                <X size={12} />
              </Button>
            </span>
          </div>
        ))}
        {(data.data ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">No data bound to this step.</p>
        )}
      </div>

      <EntityModalForm
        open={creating}
        onClose={() => setCreating(false)}
        entityKey="data_elements"
        title="Bind Data Element"
        fields={dataElementFields.filter((f) => f.name !== "step_id")}
        extra={{ step_id: step.id }}
      />
      {editing && (
        <EntityModalForm
          open
          onClose={() => setEditing(null)}
          entityKey="data_elements"
          title="Edit Data Element"
          fields={dataElementFields.filter((f) => f.name !== "step_id")}
          initial={editing}
        />
      )}
    </Card>
  );
}
