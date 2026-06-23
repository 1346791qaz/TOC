import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Database, Search } from "lucide-react";
import type { DataElement, DbConnection } from "@shared/schemas";
import type { LinkedDataElement } from "@shared/gaps";
import { ApiError } from "@/lib/api";
import { useCreate, useList, useUpdate } from "@/lib/queries";
import { dataElementFields, stepDataElementFields } from "@/lib/entityConfig";
import type { FieldDef } from "@/lib/entityConfig";
import { Modal } from "@/components/ui/modal";
import { Button, Select } from "@/components/ui/primitives";
import { EntityForm, type DynamicOption } from "@/components/EntityForm";
import { SchemaBrowser, type SelectedColumn } from "@/components/SchemaBrowser";
import { cn } from "@/lib/utils";

const DEF_FIELD_NAMES = new Set(dataElementFields.map((f) => f.name));

const SECTION_DIVIDER: FieldDef = {
  name: "__step_rel",
  label: "Step relationship",
  type: "section",
  full: true,
};

const EDIT_FIELDS: FieldDef[] = [...dataElementFields, SECTION_DIVIDER, ...stepDataElementFields];

type Phase = "pick" | "junction" | "define" | "live-browse" | "live-review";

/** Map a DB-native type string to the app's data type vocabulary. */
function mapDbType(raw: string): string {
  const t = raw.toLowerCase().replace(/[(\s].*/g, "").trim();
  const map: Record<string, string> = {
    // integers
    int: "INTEGER", int2: "INTEGER", int4: "INTEGER", int8: "BIGINT",
    integer: "INTEGER", smallint: "SMALLINT", bigint: "BIGINT",
    tinyint: "SMALLINT", mediumint: "INTEGER", serial: "INTEGER", bigserial: "BIGINT",
    // decimals
    decimal: "DECIMAL", numeric: "NUMERIC", number: "NUMERIC",
    float: "FLOAT", float4: "FLOAT", float8: "DOUBLE",
    real: "FLOAT", double: "DOUBLE", money: "DECIMAL", smallmoney: "DECIMAL",
    // strings
    varchar: "VARCHAR", nvarchar: "VARCHAR", varchar2: "VARCHAR", nvarchar2: "VARCHAR",
    char: "CHAR", nchar: "CHAR", text: "TEXT", ntext: "TEXT",
    string: "VARCHAR", clob: "CLOB", nclob: "CLOB",
    // binary
    blob: "BLOB", binary: "BINARY", varbinary: "BINARY", bytea: "BINARY",
    // booleans
    boolean: "BOOLEAN", bool: "BOOLEAN", bit: "BOOLEAN",
    // dates / times
    date: "DATE", datetime: "DATETIME", timestamp: "TIMESTAMP",
    timestamptz: "TIMESTAMP", datetime2: "DATETIME", smalldatetime: "DATETIME",
    time: "TEXT", interval: "TEXT",
    // uuid
    uuid: "UUID", uniqueidentifier: "UUID",
    // json
    json: "JSON", jsonb: "JSON",
    // variants
    variant: "JSON", object: "JSON", array: "TEXT",
  };
  return map[t] ?? raw.toUpperCase();
}

interface LiveDraftElement {
  name: string;
  source_system: string;
  table_or_view: string;
  field_name: string;
  data_type: string;
  col: SelectedColumn;
}

function colKey(col: SelectedColumn) {
  return `${col.schema}.${col.table}.${col.column_name}`;
}

/**
 * Two-flow modal:
 *
 * mode="define" (DataView / catalog context — no step):
 *   Goes straight to the "define" phase — element definition fields only.
 *   Saves the element and closes. No step-relationship fields shown.
 *
 * mode="bind" (default — StepsView context):
 *   1. "pick" — search existing definitions + "Define new element" option.
 *   2a. "junction" — picked existing → set binding_point / presence / is_key / quality_notes.
 *   2b. "define" → "junction" — create new: definition-only form first, then
 *       step-relationship form automatically follows.
 *
 * Edit (`initial` provided): combined form pre-populated from the LinkedDataElement.
 *
 * `stepId` fixes the step (StepsView). When absent, `stepOptions` drives a step
 * picker shown at the top of the "pick" phase (DataView bind context).
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
  mode = "bind",
}: {
  open: boolean;
  onClose: () => void;
  vsId: string;
  stepId?: string;
  stepOptions?: DynamicOption[];
  availableDefs: DataElement[];
  alreadyBoundIds?: Set<string>;
  initial?: LinkedDataElement;
  mode?: "define" | "bind";
}) {
  const isEdit = Boolean(initial);
  const startPhase: Phase = mode === "define" ? "define" : "pick";
  const [phase, setPhase] = useState<Phase>(startPhase);
  const [pickedStepId, setPickedStepId] = useState<string>(stepId ?? "");
  const [pickedDef, setPickedDef] = useState<DataElement | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Live Source state
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set());
  const [liveColMap, setLiveColMap] = useState<Map<string, SelectedColumn>>(new Map());
  const [liveDrafts, setLiveDrafts] = useState<LiveDraftElement[]>([]);
  const [liveCreating, setLiveCreating] = useState(false);

  const connections = useList<DbConnection>("db_connections", { where: { value_stream_id: vsId } });
  const hasConnections = (connections.data?.length ?? 0) > 0;

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
      setPhase(mode === "define" ? "define" : "pick");
      setPickedStepId(stepId ?? "");
      setPickedDef(null);
      setQuery("");
      setError(null);
      setSelectedCols(new Set());
      setLiveColMap(new Map());
      setLiveDrafts([]);
    }
  }, [open, stepId, mode]);

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

  const handleDefine = (values: Record<string, unknown>) => {
    setError(null);
    createDE.mutate(
      { ...values, value_stream_id: vsId },
      {
        onError: onErr,
        onSuccess: (created) => {
          if (effectiveStepId) {
            setPickedDef(created as DataElement);
            setPhase("junction");
          } else {
            onClose();
          }
        },
      },
    );
  };

  function handleColToggle(col: SelectedColumn) {
    const key = colKey(col);
    setSelectedCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setLiveColMap((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, col);
      return next;
    });
  }

  function handleLiveProceed() {
    const drafts: LiveDraftElement[] = [];
    for (const [key, col] of liveColMap) {
      if (selectedCols.has(key)) {
        drafts.push({
          name: `${col.table}.${col.column_name}`,
          source_system: col.connection_name,
          table_or_view: col.table,
          field_name: col.column_name,
          data_type: mapDbType(col.data_type),
          col,
        });
      }
    }
    setLiveDrafts(drafts);
    setPhase("live-review");
  }

  async function handleLiveCreate() {
    setLiveCreating(true);
    setError(null);
    try {
      for (const draft of liveDrafts) {
        await new Promise<void>((resolve, reject) => {
          createDE.mutate(
            {
              value_stream_id: vsId,
              name: draft.name,
              source_system: draft.source_system,
              table_or_view: draft.table_or_view,
              field_name: draft.field_name,
              data_type: draft.data_type,
            },
            { onSuccess: () => resolve(), onError: reject },
          );
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create some elements.");
    } finally {
      setLiveCreating(false);
    }
  }

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
          fields={EDIT_FIELDS}
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
            onClick={() => setPhase("define")}
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

  // ---- Live browse phase (schema browser + column multi-select) ----
  if (phase === "live-browse") {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Import from Live Source"
        footer={
          <>
            {errLine}
            <Button
              variant="ghost"
              type="button"
              onClick={() => { setPhase("define"); setError(null); }}
            >
              <ArrowLeft size={13} /> Manual entry
            </Button>
            <Button
              type="button"
              disabled={selectedCols.size === 0}
              onClick={handleLiveProceed}
            >
              Review {selectedCols.size > 0 ? `${selectedCols.size} selected` : "selection"} →
            </Button>
          </>
        }
      >
        <SchemaBrowser
          connections={connections.data ?? []}
          selected={selectedCols}
          onToggle={handleColToggle}
        />
      </Modal>
    );
  }

  // ---- Live review phase (confirm + edit names before bulk create) ----
  if (phase === "live-review") {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={`Create ${liveDrafts.length} Data Element${liveDrafts.length !== 1 ? "s" : ""}`}
        footer={
          <>
            {errLine}
            <Button
              variant="ghost"
              type="button"
              onClick={() => { setPhase("live-browse"); setError(null); }}
            >
              <ArrowLeft size={13} /> Back
            </Button>
            <Button type="button" disabled={liveCreating} onClick={handleLiveCreate}>
              {liveCreating ? "Creating…" : `Create ${liveDrafts.length} element${liveDrafts.length !== 1 ? "s" : ""}`}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Review and rename below. Source, table, field, and type are pre-filled from the live schema.
            You can edit business descriptions and other details after saving.
          </p>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {liveDrafts.map((draft, i) => (
              <div key={i} className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="mb-1 flex items-center gap-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Name
                  </label>
                  <input
                    className="flex-1 rounded border border-border bg-input px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                    value={draft.name}
                    onChange={(e) =>
                      setLiveDrafts((prev) =>
                        prev.map((d, j) => (j === i ? { ...d, name: e.target.value } : d)),
                      )
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-foreground/70">{draft.source_system}</span>
                  {" · "}
                  <span className="mono">{draft.table_or_view}.{draft.field_name}</span>
                  {" · "}
                  <span className="font-medium">{draft.data_type}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    );
  }

  // ---- Define phase (element definition only — no step-relationship fields) ----
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Define New Data Element"
      footer={
        <>
          {errLine}
          {mode === "bind" && (
            <Button
              variant="ghost"
              type="button"
              onClick={() => { setPhase("pick"); setError(null); }}
            >
              <ArrowLeft size={13} /> Back
            </Button>
          )}
          <Button type="submit" form="de-form" disabled={isPending}>
            {isPending
              ? "Saving…"
              : effectiveStepId
              ? "Save & Set Step Relationship →"
              : "Save element"}
          </Button>
        </>
      }
    >
      {mode === "define" && hasConnections && (
        <button
          type="button"
          onClick={() => setPhase("live-browse")}
          className="mb-4 flex w-full items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
        >
          <Database size={14} className="shrink-0 text-primary" />
          <span>Import from a live database connection instead →</span>
        </button>
      )}
      <EntityForm
        formId="de-form"
        fields={dataElementFields}
        onSubmit={handleDefine}
      />
    </Modal>
  );
}
