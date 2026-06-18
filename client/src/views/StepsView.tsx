import { useState } from "react";
import { ArrowRight, Pencil, Plus, X } from "lucide-react";
import type { DataElement, Persona, ProcessStep, StepPersona } from "@shared/schemas";
import { RACI_ROLES } from "@shared/enums";
import { useCreate, useList, useSoftDelete } from "@/lib/queries";
import { dataElementFields, processStepFields } from "@/lib/entityConfig";
import { fmtNum } from "@/lib/utils";
import { presenceTone, titleCase } from "@/lib/display";
import { ViewShell, EmptyHint } from "@/components/ViewShell";
import { Badge, Button, Card, Select } from "@/components/ui/primitives";
import { EntityModalForm } from "@/components/EntityModalForm";

export function StepsView({ vsId }: { vsId: string }) {
  const steps = useList<ProcessStep>("process_steps", {
    where: { value_stream_id: vsId },
    orderBy: "sequence_index ASC",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProcessStep | null>(null);
  const [creating, setCreating] = useState(false);
  const del = useSoftDelete("process_steps");

  const list = steps.data ?? [];
  const selected = list.find((s) => s.id === selectedId) ?? list[0] ?? null;

  return (
    <ViewShell
      title="Process Steps"
      subtitle="The value-stream spine — each step carries entry / action / exit criteria."
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={14} /> Step
        </Button>
      }
    >
      {list.length === 0 ? (
        <EmptyHint>No process steps yet. Add the first step to build the spine.</EmptyHint>
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
                {i < list.length - 1 && <ArrowRight size={12} className="ml-auto opacity-30" />}
              </button>
            ))}
          </div>

          {/* Detail */}
          {selected ? (
            <StepDetail
              key={selected.id}
              step={selected}
              vsId={vsId}
              onEdit={() => setEditing(selected)}
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
        title="New Process Step"
        fields={processStepFields}
        extra={{ value_stream_id: vsId }}
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
  onEdit,
  onDelete,
}: {
  step: ProcessStep;
  vsId: string;
  onEdit: () => void;
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

      <StepPersonas step={step} vsId={vsId} />
      <StepData step={step} />
    </div>
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
