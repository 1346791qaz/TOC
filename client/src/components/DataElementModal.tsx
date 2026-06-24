import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Database, Loader2, Search, Table2 } from "lucide-react";
import type { DataElement, DbConnection } from "@shared/schemas";
import type { LinkedDataElement } from "@shared/gaps";
import { ApiError } from "@/lib/api";
import { useCreate, useList, useUpdate } from "@/lib/queries";
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

// ---- Live browse types ----

interface LiveColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  length: string | null;
}

interface LiveNavState {
  openConn: string | null;
  schemasById:    Record<string, Array<{ schema: string }>>;
  schemasLoading: Record<string, boolean>;
  schemasError:   Record<string, string>;
  expandedSchema: Record<string, string | null>;
  tablesById:     Record<string, Array<{ table_name: string; table_type: string }>>;
  tablesLoading:  Record<string, boolean>;
  tablesError:    Record<string, string>;
}

const EMPTY_NAV: LiveNavState = {
  openConn: null, schemasById: {}, schemasLoading: {}, schemasError: {},
  expandedSchema: {}, tablesById: {}, tablesLoading: {}, tablesError: {},
};

interface LiveSelection {
  connId: string;
  connName: string;
  schema: string;
  table: string;
}

interface LiveDraftElement {
  name: string;
  business_description: string;
  source_system: string;
  table_or_view: string;
  field_name: string;
  data_type: string;
  length: string;
  example_value: string;
}

interface PreviewResult {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
}

type LiveTab = "fields" | "ddl" | "content";

async function fetchLiveJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
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
  const [liveNav,    setLiveNav]    = useState<LiveNavState>(EMPTY_NAV);
  const [liveSel,    setLiveSel]    = useState<LiveSelection | null>(null);
  const [tableCols,  setTableCols]  = useState<LiveColumnInfo[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set());
  const [liveDrafts,   setLiveDrafts]   = useState<LiveDraftElement[]>([]);
  const [liveCreating, setLiveCreating] = useState(false);
  const liveLoadRef = useRef<Record<string, boolean>>({});
  // Tab state for the right panel
  const [liveTab, setLiveTab] = useState<LiveTab>("fields");
  const [liveDdl, setLiveDdl] = useState<string | null>(null);
  const [liveDdlLoading, setLiveDdlLoading] = useState(false);
  const [liveDdlError, setLiveDdlError] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState<PreviewResult | null>(null);
  const [livePreviewLoading, setLivePreviewLoading] = useState(false);
  const [livePreviewError, setLivePreviewError] = useState<string | null>(null);

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
      setLiveNav(EMPTY_NAV);
      setLiveSel(null);
      setTableCols([]);
      setTableLoading(false);
      setTableError(null);
      setSelectedCols(new Set());
      setLiveDrafts([]);
      setLiveTab("fields");
      setLiveDdl(null);
      setLiveDdlLoading(false);
      setLiveDdlError(null);
      setLivePreview(null);
      setLivePreviewLoading(false);
      setLivePreviewError(null);
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

  // ---- Live nav helpers ----

  function liveOpenConn(conn: DbConnection) {
    const alreadyOpen = liveNav.openConn === conn.id;
    setLiveNav((s) => ({ ...s, openConn: alreadyOpen ? null : conn.id }));
    if (!alreadyOpen && !liveNav.schemasById[conn.id] && !liveLoadRef.current[`s:${conn.id}`]) {
      liveLoadRef.current[`s:${conn.id}`] = true;
      setLiveNav((s) => ({ ...s, schemasLoading: { ...s.schemasLoading, [conn.id]: true } }));
      fetchLiveJson<Array<{ schema: string }>>(`/api/db_connections/${conn.id}/schema`)
        .then((schemas) => {
          liveLoadRef.current[`s:${conn.id}`] = false;
          setLiveNav((s) => ({ ...s, schemasById: { ...s.schemasById, [conn.id]: schemas }, schemasLoading: { ...s.schemasLoading, [conn.id]: false } }));
        })
        .catch((e: unknown) => {
          liveLoadRef.current[`s:${conn.id}`] = false;
          setLiveNav((s) => ({ ...s, schemasError: { ...s.schemasError, [conn.id]: String(e) }, schemasLoading: { ...s.schemasLoading, [conn.id]: false } }));
        });
    }
  }

  function liveOpenSchema(connId: string, schema: string) {
    const alreadyOpen = liveNav.expandedSchema[connId] === schema;
    setLiveNav((s) => ({ ...s, expandedSchema: { ...s.expandedSchema, [connId]: alreadyOpen ? null : schema } }));
    const key = `${connId}:${schema}`;
    if (!alreadyOpen && !liveNav.tablesById[key] && !liveLoadRef.current[`t:${key}`]) {
      liveLoadRef.current[`t:${key}`] = true;
      setLiveNav((s) => ({ ...s, tablesLoading: { ...s.tablesLoading, [key]: true } }));
      fetchLiveJson<Array<{ table_name: string; table_type: string }>>(
        `/api/db_connections/${connId}/schema/${encodeURIComponent(schema)}/tables`,
      )
        .then((tables) => {
          liveLoadRef.current[`t:${key}`] = false;
          setLiveNav((s) => ({ ...s, tablesById: { ...s.tablesById, [key]: tables }, tablesLoading: { ...s.tablesLoading, [key]: false } }));
        })
        .catch((e: unknown) => {
          liveLoadRef.current[`t:${key}`] = false;
          setLiveNav((s) => ({ ...s, tablesError: { ...s.tablesError, [key]: String(e) }, tablesLoading: { ...s.tablesLoading, [key]: false } }));
        });
    }
  }

  function liveSelectTable(connId: string, connName: string, schema: string, table: string) {
    const sel = { connId, connName, schema, table };
    setLiveSel(sel);
    setSelectedCols(new Set());
    setTableCols([]);
    setTableError(null);
    setTableLoading(true);
    setLiveTab("fields");
    setLiveDdl(null);
    setLiveDdlError(null);
    setLivePreview(null);
    setLivePreviewError(null);
    // Fetch columns and preview rows in parallel so example values are ready
    fetchLiveJson<LiveColumnInfo[]>(
      `/api/db_connections/${connId}/schema/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/columns`,
    )
      .then((cols) => { setTableCols(cols); setTableLoading(false); })
      .catch((e: unknown) => { setTableError(String(e)); setTableLoading(false); });
    setLivePreviewLoading(true);
    fetchLiveJson<PreviewResult>(
      `/api/db_connections/${connId}/schema/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/preview`,
    )
      .then((data) => { setLivePreview(data); setLivePreviewLoading(false); })
      .catch((e: unknown) => { setLivePreviewError(String(e)); setLivePreviewLoading(false); });
  }

  function toggleLiveCol(colName: string, e?: React.MouseEvent) {
    setSelectedCols((prev) => {
      const next = new Set(prev);
      if (e?.ctrlKey || e?.metaKey) {
        if (next.has(colName)) next.delete(colName); else next.add(colName);
      } else {
        if (next.size === 1 && next.has(colName)) next.delete(colName);
        else { next.clear(); next.add(colName); }
      }
      return next;
    });
  }

  function toggleAllLiveCols() {
    if (selectedCols.size === tableCols.length && tableCols.length > 0) {
      setSelectedCols(new Set());
    } else {
      setSelectedCols(new Set(tableCols.map((c) => c.column_name)));
    }
  }

  function handleLiveProceed() {
    if (!liveSel) return;
    const drafts: LiveDraftElement[] = tableCols
      .filter((c) => selectedCols.has(c.column_name))
      .map((c) => {
        let exampleValue = "";
        if (livePreview) {
          const colIdx = livePreview.columns.indexOf(c.column_name);
          if (colIdx !== -1) {
            const found = livePreview.rows.find(
              (row) => row[colIdx] !== null && row[colIdx] !== undefined && String(row[colIdx]).trim() !== "",
            );
            if (found !== undefined) exampleValue = String(found[colIdx]);
          }
        }
        return {
          name:                 c.column_name,
          business_description: "",
          source_system:        liveSel.connName,
          table_or_view:        liveSel.table,
          field_name:           c.column_name,
          data_type:            mapDbType(c.data_type),
          length:               c.length ?? "",
          example_value:        exampleValue,
        };
      });
    setLiveDrafts(drafts);
    setPhase("live-review");
  }

  function handleLiveTab(tab: LiveTab) {
    setLiveTab(tab);
    if (!liveSel) return;
    if (tab === "ddl" && liveDdl === null && !liveDdlLoading) {
      setLiveDdlLoading(true);
      setLiveDdlError(null);
      fetchLiveJson<{ ddl: string }>(
        `/api/db_connections/${liveSel.connId}/schema/${encodeURIComponent(liveSel.schema)}/tables/${encodeURIComponent(liveSel.table)}/ddl`,
      )
        .then((data) => { setLiveDdl(data.ddl); setLiveDdlLoading(false); })
        .catch((e: unknown) => { setLiveDdlError(String(e)); setLiveDdlLoading(false); });
    }
    if (tab === "content" && livePreview === null && !livePreviewLoading) {
      setLivePreviewLoading(true);
      setLivePreviewError(null);
      fetchLiveJson<PreviewResult>(
        `/api/db_connections/${liveSel.connId}/schema/${encodeURIComponent(liveSel.schema)}/tables/${encodeURIComponent(liveSel.table)}/preview`,
      )
        .then((data) => { setLivePreview(data); setLivePreviewLoading(false); })
        .catch((e: unknown) => { setLivePreviewError(String(e)); setLivePreviewLoading(false); });
    }
  }

  function updateDraft(i: number, key: keyof LiveDraftElement, val: string) {
    setLiveDrafts((prev) => prev.map((d, j) => (j === i ? { ...d, [key]: val } : d)));
  }

  async function handleLiveCreate() {
    setLiveCreating(true);
    setError(null);
    try {
      for (const draft of liveDrafts) {
        await new Promise<void>((resolve, reject) => {
          createDE.mutate(
            {
              value_stream_id:      vsId,
              name:                 draft.name,
              business_description: draft.business_description || null,
              source_system:        draft.source_system || null,
              table_or_view:        draft.table_or_view || null,
              field_name:           draft.field_name || null,
              data_type:            draft.data_type || null,
              length:               draft.length || null,
              example_value:        draft.example_value || null,
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
    if (mode === "define") {
      updateDE.mutate(
        { id: initial!.data_element_id, data: values },
        { onSuccess: onClose, onError: onErr },
      );
      return;
    }
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
    const editFields = mode === "define" ? dataElementFields : EDIT_FIELDS;
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
          fields={editFields}
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

  // ---- Live browse phase (connection/schema/table tree + column multi-select) ----
  if (phase === "live-browse") {
    const conns = connections.data ?? [];
    const allCols = tableCols.length;
    const checkedCount = selectedCols.size;
    const allChecked = allCols > 0 && checkedCount === allCols;
    const someChecked = checkedCount > 0 && !allChecked;

    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Import from Live Source"
        className="max-w-3xl"
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
        <div className="flex h-[52vh] gap-3">
          {/* Left panel — connection / schema / table tree */}
          <div className="w-56 shrink-0 overflow-y-auto rounded-md border border-border text-sm">
            {connections.isLoading && (
              <div className="flex items-center gap-2 px-3 py-4 text-muted-foreground">
                <Loader2 size={13} className="animate-spin" /> Loading…
              </div>
            )}
            {conns.length === 0 && !connections.isLoading && (
              <p className="px-3 py-4 text-xs text-muted-foreground">No connections configured.</p>
            )}
            {conns.map((conn) => {
              const connOpen = liveNav.openConn === conn.id;
              const schemas = liveNav.schemasById[conn.id] ?? [];
              return (
                <div key={conn.id}>
                  <button
                    type="button"
                    onClick={() => liveOpenConn(conn)}
                    className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left font-medium hover:bg-muted/50"
                  >
                    <ChevronRight size={12} className={cn("shrink-0 transition-transform", connOpen && "rotate-90")} />
                    <Database size={13} className="shrink-0 text-muted-foreground" />
                    <span className="truncate text-xs">{conn.name}</span>
                    {liveNav.schemasLoading[conn.id] && (
                      <Loader2 size={11} className="ml-auto animate-spin text-muted-foreground" />
                    )}
                  </button>
                  {connOpen && (
                    <div>
                      {liveNav.schemasError[conn.id] && (
                        <p className="px-5 py-1 text-xs text-status-critical">{liveNav.schemasError[conn.id]}</p>
                      )}
                      {schemas.map((s) => {
                        const schemaOpen = liveNav.expandedSchema[conn.id] === s.schema;
                        const tabKey = `${conn.id}:${s.schema}`;
                        const tables = liveNav.tablesById[tabKey] ?? [];
                        return (
                          <div key={s.schema}>
                            <button
                              type="button"
                              onClick={() => liveOpenSchema(conn.id, s.schema)}
                              className="flex w-full items-center gap-1.5 py-1.5 pl-5 pr-2 text-left hover:bg-muted/50"
                            >
                              <ChevronRight
                                size={11}
                                className={cn("shrink-0 transition-transform text-muted-foreground", schemaOpen && "rotate-90")}
                              />
                              <span className="truncate text-xs text-muted-foreground">{s.schema}</span>
                              {liveNav.tablesLoading[tabKey] && (
                                <Loader2 size={11} className="ml-auto animate-spin text-muted-foreground" />
                              )}
                            </button>
                            {schemaOpen && (
                              <div>
                                {liveNav.tablesError[tabKey] && (
                                  <p className="px-8 py-1 text-xs text-status-critical">{liveNav.tablesError[tabKey]}</p>
                                )}
                                {tables.map((t) => {
                                  const isSel =
                                    liveSel?.connId === conn.id &&
                                    liveSel?.schema === s.schema &&
                                    liveSel?.table === t.table_name;
                                  return (
                                    <button
                                      key={t.table_name}
                                      type="button"
                                      onClick={() => liveSelectTable(conn.id, conn.name, s.schema, t.table_name)}
                                      className={cn(
                                        "flex w-full items-center gap-1.5 py-1 pl-9 pr-2 text-left hover:bg-muted/50",
                                        isSel && "bg-primary/10 font-medium text-primary",
                                      )}
                                    >
                                      <Table2 size={11} className="shrink-0 text-muted-foreground/70" />
                                      <span className="truncate font-mono text-xs">{t.table_name}</span>
                                    </button>
                                  );
                                })}
                                {tables.length === 0 && !liveNav.tablesLoading[tabKey] && (
                                  <p className="px-8 py-1 text-xs text-muted-foreground">No tables.</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right panel — table details */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-border text-sm">
            {!liveSel ? (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
                Select a table from the connection tree to inspect it.
              </div>
            ) : (
              <>
                {/* Tab bar */}
                <div className="flex shrink-0 border-b border-border">
                  {(["fields", "ddl", "content"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => handleLiveTab(tab)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium",
                        liveTab === tab
                          ? "border-b-2 border-primary text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab === "fields" ? "Fields" : tab === "ddl" ? "DDL" : "Content"}
                    </button>
                  ))}
                  {checkedCount > 0 && (
                    <span className="ml-auto self-center pr-3 text-[10px] text-muted-foreground">
                      {checkedCount} selected
                    </span>
                  )}
                </div>

                {/* Fields tab */}
                {liveTab === "fields" && (
                  tableLoading ? (
                    <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" /> Loading columns…
                    </div>
                  ) : tableError ? (
                    <p className="p-3 text-xs text-status-critical">{tableError}</p>
                  ) : (
                    <>
                      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 shrink-0"
                          checked={allChecked}
                          ref={(el) => { if (el) el.indeterminate = someChecked; }}
                          onChange={toggleAllLiveCols}
                        />
                        <span className="w-[40%]">Column</span>
                        <span className="w-[25%]">Type</span>
                        <span className="w-[12%]">Length</span>
                        <span className="ml-auto">Nullable</span>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        {tableCols.length === 0 ? (
                          <p className="px-3 py-4 text-xs text-muted-foreground">No columns returned.</p>
                        ) : (
                          tableCols.map((col) => {
                            const checked = selectedCols.has(col.column_name);
                            return (
                              <div
                                key={col.column_name}
                                className={cn(
                                  "flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/40",
                                  checked && "bg-primary/5",
                                )}
                                onClick={(e) => toggleLiveCol(col.column_name, e)}
                              >
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 shrink-0 pointer-events-none"
                                  checked={checked}
                                  readOnly
                                />
                                <span className="w-[40%] font-mono text-xs">{col.column_name}</span>
                                <span className="w-[25%] text-xs text-muted-foreground">{col.data_type}</span>
                                <span className="w-[12%] text-xs text-muted-foreground">{col.length ?? "—"}</span>
                                <span className="ml-auto text-xs">
                                  {col.is_nullable
                                    ? <span className="text-muted-foreground">NULL</span>
                                    : <span className="text-[10px] text-status-critical">NOT NULL</span>
                                  }
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </>
                  )
                )}

                {/* DDL tab */}
                {liveTab === "ddl" && (
                  liveDdlLoading ? (
                    <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" /> Loading DDL…
                    </div>
                  ) : liveDdlError ? (
                    <p className="p-3 text-xs text-status-critical">{liveDdlError}</p>
                  ) : liveDdl ? (
                    <pre className="flex-1 overflow-auto p-3 font-mono text-xs text-foreground">
                      {liveDdl}
                    </pre>
                  ) : null
                )}

                {/* Content tab */}
                {liveTab === "content" && (
                  livePreviewLoading ? (
                    <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" /> Loading data…
                    </div>
                  ) : livePreviewError ? (
                    <p className="p-3 text-xs text-status-critical">{livePreviewError}</p>
                  ) : livePreview ? (
                    <>
                      <div className="flex-1 overflow-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-muted/90">
                            <tr>
                              {livePreview.columns.map((col) => (
                                <th key={col} className="whitespace-nowrap px-2 py-1.5 text-left font-semibold text-muted-foreground">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {livePreview.rows.map((row, i) => (
                              <tr key={i} className="border-t border-border/40 hover:bg-muted/20">
                                {(row as unknown[]).map((cell, j) => (
                                  <td key={j} className="max-w-[180px] truncate whitespace-nowrap px-2 py-1 font-mono" title={cell === null || cell === undefined ? "NULL" : typeof cell === "object" ? JSON.stringify(cell) : String(cell)}>
                                    {cell === null || cell === undefined
                                      ? <span className="italic text-muted-foreground/40">NULL</span>
                                      : typeof cell === "object"
                                        ? <span className="text-muted-foreground">{JSON.stringify(cell)}</span>
                                        : String(cell)
                                    }
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {livePreview.truncated && (
                        <div className="shrink-0 border-t border-border bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
                          Showing first 100 rows
                        </div>
                      )}
                    </>
                  ) : null
                )}
              </>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  // ---- Live review phase (confirm + fill details before bulk create) ----
  if (phase === "live-review") {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={`Create ${liveDrafts.length} Data Element${liveDrafts.length !== 1 ? "s" : ""}`}
        className="max-w-2xl"
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
            Source, table, field, type, and length are pre-filled from the live schema — edit as needed.
            Add a business description and example value for each field.
          </p>
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {liveDrafts.map((draft, i) => (
              <div key={i} className="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Field {i + 1} of {liveDrafts.length}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[10px] text-muted-foreground">Short Name *</label>
                    <input
                      className="w-full rounded border border-border bg-input px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                      value={draft.name}
                      onChange={(e) => updateDraft(i, "name", e.target.value)}
                      placeholder="e.g. customer_id"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-muted-foreground">Field Name</label>
                    <input
                      className="w-full rounded border border-border bg-input px-2 py-1 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
                      value={draft.field_name}
                      onChange={(e) => updateDraft(i, "field_name", e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[10px] text-muted-foreground">Source System</label>
                    <input
                      className="w-full rounded border border-border bg-input px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                      value={draft.source_system}
                      onChange={(e) => updateDraft(i, "source_system", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-muted-foreground">Table / View</label>
                    <input
                      className="w-full rounded border border-border bg-input px-2 py-1 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
                      value={draft.table_or_view}
                      onChange={(e) => updateDraft(i, "table_or_view", e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[10px] text-muted-foreground">Data Type</label>
                    <input
                      className="w-full rounded border border-border bg-input px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                      value={draft.data_type}
                      onChange={(e) => updateDraft(i, "data_type", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-muted-foreground">Length</label>
                    <input
                      className="w-full rounded border border-border bg-input px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                      value={draft.length}
                      onChange={(e) => updateDraft(i, "length", e.target.value)}
                      placeholder="e.g. 255 or 18,2"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] text-muted-foreground">Business Description</label>
                  <textarea
                    className="w-full resize-none rounded border border-border bg-input px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                    rows={2}
                    value={draft.business_description}
                    onChange={(e) => updateDraft(i, "business_description", e.target.value)}
                    placeholder="What does this field mean in business terms?"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] text-muted-foreground">Example Value</label>
                  <input
                    className="w-full rounded border border-border bg-input px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                    value={draft.example_value}
                    onChange={(e) => updateDraft(i, "example_value", e.target.value)}
                    placeholder="e.g. 12345"
                  />
                </div>
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
