import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import type { DataElement } from "@shared/schemas";
import type { LinkedDataElement } from "@shared/gaps";
import { ApiError } from "@/lib/api";
import { useCreate, useUpdate } from "@/lib/queries";
import { dataElementFields, stepDataElementFields } from "@/lib/entityConfig";
import type { FieldDef } from "@/lib/entityConfig";
import { Modal } from "@/components/ui/modal";
import { Button, Select } from "@/components/ui/primitives";
import { EntityForm, type DynamicOption } from "@/components/EntityForm";
import { cn } from "@/lib/utils";

const DEF_FIELD_NAMES = new Set(dataElementFields.map((f) => f.name));

const SECTION_DIVIDER: FieldDef = {
  name: "__step_rel",
  label: "Step relationship",
  type: "section",
  full: true,
};

const FULL_FIELDS: FieldDef[] = [...dataElementFields, SECTION_DIVIDER, ...stepDataElementFields];

type Phase = "pick" | "junction" | "full";

/**
 * Two-flow modal:
 *
 * Create (no `initial`):
 *   1. "pick" — search existing definitions + "Define new element" option.
 *   2a. "junction" — picked existing → set binding_point / presence / is_key / quality_notes.
 *   2b. "full" — create new → definition fields + step-relationship fields in one form.
 *
 * Edit (`initial` provided): combined form pre-populated from the LinkedDataElement.
 *
 * `stepId` fixes the step (StepsView). When absent, `stepOptions` drives a step
 * picker shown at the top of the "pick" phase (DataView context).
 */
export function DataElementModal({
  open,
  onClose,
  vsId,
  stepId,
  stepOptions,
  availableDefs,
  alreadyBoundIds,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  vsId: string;
  stepId?: string;
  stepOptions?: DynamicOption[];
  availableDefs: DataElement[];
  alreadyBoundIds?: Set<string>;
  initial?: LinkedDataElement;
}) {
  const isEdit = Boolean(initial);
  const [phase, setPhase] = useState<Phase>("pick");
  const [pickedStepId, setPickedStepId] = useState<string>(stepId ?? "");
  const [pickedDef, setPickedDef] = useState<DataElement | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createDE = useCreate("data_elements");
  const createSDE = useCreate("step_data_elements");
  const updateDE = useUpdate("data_elements");
  const updateSDE = useUpdate("step_data_elements");

  const isPending =
    createDE.isPending || createSDE.isPending || updateDE.isPending || updateSDE.isPending;

  const onErr = (err: unknown) =>
    setError(err instanceof ApiError ? err.message : "Save failed — check required fields.");

  useEffect(() => {
    if (open) {
      setPhase("pick");
      setPickedStepId(stepId ?? "");
      setPickedDef(null);
      setQuery("");
      setError(null);
    }
  }, [open, stepId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableDefs;
    return availableDefs.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.business_description ?? "").toLowerCase().includes(q) ||
        (d.source_system ?? "").toLowerCase().includes(q) ||
        (d.field_name ?? "").toLowerCase().includes(q),
    );
  }, [availableDefs, query]);

  const effectiveStepId = stepId ?? pickedStepId;
  const needStep = !effectiveStepId;

  const errLine = error ? (
    <span className="mr-auto text-xs text-status-critical">{error}</span>
  ) : null;

  // ---- Submit handlers ----

  const handleBindExisting = (values: Record<string, unknown>) => {
    setError(null);
    if (!effectiveStepId) { setError("Please select a step."); return; }
    createSDE.mutate(
      { ...values, step_id: effectiveStepId, data_element_id: pickedDef!.id },
      { onSuccess: onClose, onError: onErr },
    );
  };

  const handleCreateAndBind = (values: Record<string, unknown>) => {
    setError(null);
    if (!effectiveStepId) { setError("Please select a step."); return; }
    const defValues: Record<string, unknown> = {};
    const usageValues: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (DEF_FIELD_NAMES.has(k)) defValues[k] = v;
      else usageValues[k] = v;
    }
    createDE.mutate(
      { ...defValues, value_stream_id: vsId },
      {
        onError: onErr,
        onSuccess: (created) => {
          createSDE.mutate(
            { ...usageValues, step_id: effectiveStepId, data_element_id: (created as { id: string }).id },
            { onSuccess: onClose, onError: onErr },
          );
        },
      },
    );
  };

  const handleEdit = (values: Record<string, unknown>) => {
    setError(null);
    const defValues: Record<string, unknown> = {};
    const usageValues: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (DEF_FIELD_NAMES.has(k)) defValues[k] = v;
      else usageValues[k] = v;
    }
    updateDE.mutate(
      { id: initial!.data_element_id, data: defValues },
      {
        onError: onErr,
        onSuccess: () => {
          updateSDE.mutate(
            { id: initial!.id, data: usageValues },
            { onSuccess: onClose, onError: onErr },
          );
        },
      },
    );
  };

  // ---- Edit mode ----
  if (isEdit && initial) {
    const combinedInitial: Record<string, unknown> = {
      name: initial.name,
      business_description: initial.business_description,
      source_system: initial.source_system,
      table_or_view: initial.table_or_view,
      field_name: initial.field_name,
      data_type: initial.data_type,
      length: initial.length,
      example_value: initial.example_value,
      binding_point: initial.binding_point,
      presence: initial.presence,
      is_key: initial.is_key,
      quality_notes: initial.quality_notes,
    };
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Edit Data Element"
        footer={
          <>
            {errLine}
            <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
            <Button type="submit" form="de-form" disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      >
        <EntityForm
          formId="de-form"
          fields={FULL_FIELDS}
          initial={combinedInitial}
          onSubmit={handleEdit}
        />
      </Modal>
    );
  }

  // ---- Pick phase ----
  if (phase === "pick") {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Bind Data Element"
        footer={<Button variant="ghost" onClick={onClose} type="button">Cancel</Button>}
      >
        <div className="space-y-3">
          {/* Step picker (DataView context — no fixed stepId) */}
          {!stepId && stepOptions && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Step
              </p>
              <Select
                value={pickedStepId}
                onChange={(e) => setPickedStepId(e.target.value)}
              >
                <option value="">— select a step —</option>
                {stepOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              className="w-full rounded-md border border-border bg-input py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="Search data elements…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus={Boolean(stepId)}
            />
          </div>

          {/* Element list */}
          <div className="max-h-60 overflow-y-auto rounded-md border border-border">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {query
                  ? `No elements matching "${query}"`
                  : "No data elements defined yet — use the button below to create one."}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((d) => {
                  const alreadyBound = alreadyBoundIds?.has(d.id);
                  const disabled = alreadyBound || needStep;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setPickedDef(d);
                        setPhase("junction");
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-left transition-colors",
                        disabled
                          ? "cursor-default opacity-40"
                          : "cursor-pointer hover:bg-muted/50",
                      )}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">{d.name}</span>
                        {d.source_system && (
                          <span className="text-xs text-muted-foreground">{d.source_system}</span>
                        )}
                        {d.field_name && (
                          <span className="mono text-xs text-accent">{d.field_name}</span>
                        )}
                        {alreadyBound && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            already bound
                          </span>
                        )}
                      </div>
                      {d.business_description && (
                        <p className="truncate text-xs text-muted-foreground">
                          {d.business_description}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Divider + create-new option */}
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Button
            variant="outline"
            className="w-full"
            disabled={needStep}
            onClick={() => setPhase("full")}
          >
            + Define a new data element
          </Button>
          {needStep && !stepId && (
            <p className="text-center text-xs text-muted-foreground">
              Select a step above to continue.
            </p>
          )}
        </div>
      </Modal>
    );
  }

  // ---- Junction form (bind existing element) ----
  if (phase === "junction") {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Set Step Relationship"
        footer={
          <>
            {errLine}
            <Button
              variant="ghost"
              type="button"
              onClick={() => { setPhase("pick"); setError(null); }}
            >
              <ArrowLeft size={13} /> Back
            </Button>
            <Button type="submit" form="de-form" disabled={isPending}>
              {isPending ? "Binding…" : "Bind"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Summary of the chosen element */}
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
            <p className="text-sm font-semibold">{pickedDef!.name}</p>
            {pickedDef!.business_description && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {pickedDef!.business_description}
              </p>
            )}
            {(pickedDef!.source_system || pickedDef!.field_name) && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[pickedDef!.source_system, pickedDef!.field_name].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            How this element is used at this step
          </p>
          <EntityForm
            formId="de-form"
            fields={stepDataElementFields}
            onSubmit={handleBindExisting}
          />
        </div>
      </Modal>
    );
  }

  // ---- Full create form (new definition + step relationship) ----
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Define New Data Element"
      footer={
        <>
          {errLine}
          <Button
            variant="ghost"
            type="button"
            onClick={() => { setPhase("pick"); setError(null); }}
          >
            <ArrowLeft size={13} /> Back
          </Button>
          <Button type="submit" form="de-form" disabled={isPending}>
            {isPending ? "Creating…" : "Create & Bind"}
          </Button>
        </>
      }
    >
      <EntityForm
        formId="de-form"
        fields={FULL_FIELDS}
        onSubmit={handleCreateAndBind}
      />
    </Modal>
  );
}
