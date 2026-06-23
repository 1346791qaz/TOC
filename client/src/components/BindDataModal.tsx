import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Database, Loader2, Plus, Search, Table2 } from "lucide-react";
import type { DataElement, DbConnection } from "@shared/schemas";
import { BINDING_POINTS, PRESENCE } from "@shared/enums";
import { ApiError } from "@/lib/api";
import { useCreate, useList } from "@/lib/queries";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FilterState =
  | { type: "all" }
  | { type: "conn";   connId: string; connName: string }
  | { type: "schema"; connId: string; connName: string; schema: string }
  | { type: "table";  connId: string; connName: string; schema: string; table: string };

interface SchemaInfo { schema: string }
interface TableInfo  { table_name: string; table_type: string }

interface ElementSettings {
  binding_point: string;
  presence: string;
  is_key: boolean;
  quality_notes: string;
}

const DEFAULT_SETTINGS: ElementSettings = {
  binding_point: "entry",
  presence:      "present",
  is_key:        false,
  quality_notes: "",
};

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// FilterNav — left-panel connection tree
// ---------------------------------------------------------------------------

interface NavState {
  openConn: string | null;
  schemasById:    Record<string, SchemaInfo[]>;
  schemasLoading: Record<string, boolean>;
  schemasError:   Record<string, string>;
  expandedSchema: Record<string, string | null>;
  tablesById:     Record<string, TableInfo[]>;
  tablesLoading:  Record<string, boolean>;
  tablesError:    Record<string, string>;
}

const EMPTY_NAV: NavState = {
  openConn: null, schemasById: {}, schemasLoading: {}, schemasError: {},
  expandedSchema: {}, tablesById: {}, tablesLoading: {}, tablesError: {},
};

function NavItem({
  icon, label, selected, indent = 0, chevronOpen, loading, onClick,
}: {
  icon: React.ReactNode; label: string; selected: boolean; indent?: number;
  chevronOpen?: boolean; loading?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: `${(indent * 12) + 8}px` }}
      className={cn(
        "flex w-full items-center gap-1.5 rounded py-1.5 pr-2 text-left text-xs transition-colors",
        selected
          ? "bg-primary/10 font-semibold text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {chevronOpen !== undefined && (
        <ChevronRight
          size={10}
          className={cn("shrink-0 transition-transform", chevronOpen && "rotate-90")}
        />
      )}
      {icon}
      <span className="truncate">{label}</span>
      {loading && <Loader2 size={10} className="ml-auto animate-spin" />}
    </button>
  );
}

function FilterNav({
  connections,
  filter,
  setFilter,
}: {
  connections: DbConnection[];
  filter: FilterState;
  setFilter: (f: FilterState) => void;
}) {
  const [nav, setNav] = useState<NavState>(EMPTY_NAV);
  const loading = useRef<Record<string, boolean>>({});

  function openConn(conn: DbConnection) {
    const alreadyOpen = nav.openConn === conn.id;
    setNav((s) => ({ ...s, openConn: alreadyOpen ? null : conn.id }));
    if (!alreadyOpen && !nav.schemasById[conn.id] && !loading.current[`s:${conn.id}`]) {
      loading.current[`s:${conn.id}`] = true;
      setNav((s) => ({ ...s, schemasLoading: { ...s.schemasLoading, [conn.id]: true } }));
      fetchJson<SchemaInfo[]>(`/api/db_connections/${conn.id}/schema`)
        .then((schemas) => {
          loading.current[`s:${conn.id}`] = false;
          setNav((s) => ({
            ...s,
            schemasById: { ...s.schemasById, [conn.id]: schemas },
            schemasLoading: { ...s.schemasLoading, [conn.id]: false },
          }));
        })
        .catch((e: unknown) => {
          loading.current[`s:${conn.id}`] = false;
          setNav((s) => ({
            ...s,
            schemasError: { ...s.schemasError, [conn.id]: String(e) },
            schemasLoading: { ...s.schemasLoading, [conn.id]: false },
          }));
        });
    }
  }

  function openSchema(conn: DbConnection, schema: string) {
    const alreadyOpen = nav.expandedSchema[conn.id] === schema;
    setNav((s) => ({
      ...s,
      expandedSchema: { ...s.expandedSchema, [conn.id]: alreadyOpen ? null : schema },
    }));
    const key = `${conn.id}:${schema}`;
    if (!alreadyOpen && !nav.tablesById[key] && !loading.current[`t:${key}`]) {
      loading.current[`t:${key}`] = true;
      setNav((s) => ({ ...s, tablesLoading: { ...s.tablesLoading, [key]: true } }));
      fetchJson<TableInfo[]>(
        `/api/db_connections/${conn.id}/schema/${encodeURIComponent(schema)}/tables`,
      )
        .then((tables) => {
          loading.current[`t:${key}`] = false;
          setNav((s) => ({
            ...s,
            tablesById: { ...s.tablesById, [key]: tables },
            tablesLoading: { ...s.tablesLoading, [key]: false },
          }));
        })
        .catch((e: unknown) => {
          loading.current[`t:${key}`] = false;
          setNav((s) => ({
            ...s,
            tablesError: { ...s.tablesError, [key]: String(e) },
            tablesLoading: { ...s.tablesLoading, [key]: false },
          }));
        });
    }
  }

  return (
    <div className="py-1">
      {/* All */}
      <NavItem
        icon={<Database size={12} className="shrink-0" />}
        label="All elements"
        selected={filter.type === "all"}
        onClick={() => setFilter({ type: "all" })}
      />

      {connections.length === 0 && (
        <p className="px-2 pt-2 text-[11px] text-muted-foreground">No connections.</p>
      )}

      {connections.map((conn) => {
        const open   = nav.openConn === conn.id;
        const schemas = nav.schemasById[conn.id] ?? [];
        const isConn  = filter.type !== "all" && filter.connId === conn.id;

        return (
          <div key={conn.id}>
            <NavItem
              icon={<Database size={12} className="shrink-0 text-primary/70" />}
              label={conn.name}
              selected={isConn && filter.type === "conn"}
              chevronOpen={open}
              loading={nav.schemasLoading[conn.id]}
              onClick={() => {
                openConn(conn);
                setFilter({ type: "conn", connId: conn.id, connName: conn.name });
              }}
            />

            {open && (
              <div>
                {nav.schemasError[conn.id] && (
                  <p className="pl-8 text-[10px] text-status-critical">{nav.schemasError[conn.id]}</p>
                )}
                {schemas.map((s) => {
                  const schemaOpen = nav.expandedSchema[conn.id] === s.schema;
                  const tableKey   = `${conn.id}:${s.schema}`;
                  const tables     = nav.tablesById[tableKey] ?? [];
                  const isSchema   = isConn && filter.type === "schema" && filter.schema === s.schema;

                  return (
                    <div key={s.schema}>
                      <NavItem
                        indent={1}
                        icon={<span className="mono text-[10px] text-muted-foreground/70">{s.schema}</span>}
                        label=""
                        selected={isSchema}
                        chevronOpen={schemaOpen}
                        loading={nav.tablesLoading[tableKey]}
                        onClick={() => {
                          openSchema(conn, s.schema);
                          setFilter({ type: "schema", connId: conn.id, connName: conn.name, schema: s.schema });
                        }}
                      />

                      {schemaOpen && (
                        <div>
                          {nav.tablesError[tableKey] && (
                            <p className="pl-12 text-[10px] text-status-critical">{nav.tablesError[tableKey]}</p>
                          )}
                          {tables.map((t) => {
                            const isTable = isConn && filter.type === "table" && filter.table === t.table_name;
                            return (
                              <NavItem
                                key={t.table_name}
                                indent={2}
                                icon={<Table2 size={10} className="shrink-0 text-muted-foreground/70" />}
                                label={t.table_name}
                                selected={isTable}
                                onClick={() =>
                                  setFilter({
                                    type: "table",
                                    connId: conn.id,
                                    connName: conn.name,
                                    schema: s.schema,
                                    table: t.table_name,
                                  })
                                }
                              />
                            );
                          })}
                          {tables.length === 0 && !nav.tablesLoading[tableKey] && (
                            <p className="pl-12 text-[10px] text-muted-foreground">No tables.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {schemas.length === 0 && !nav.schemasLoading[conn.id] && !nav.schemasError[conn.id] && (
                  <p className="pl-8 text-[10px] text-muted-foreground">No schemas visible.</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BindDataModal
// ---------------------------------------------------------------------------

type Phase = "browse" | "junction";

export function BindDataModal({
  open,
  onClose,
  vsId,
  stepId,
  stepName,
  availableDefs,
  alreadyBoundIds,
  onDefineNew,
}: {
  open: boolean;
  onClose: () => void;
  vsId: string;
  stepId: string;
  stepName?: string;
  availableDefs: DataElement[];
  alreadyBoundIds: Set<string>;
  onDefineNew?: () => void;
}) {
  const connections = useList<DbConnection>("db_connections", { where: { value_stream_id: vsId } });
  const createSDE   = useCreate("step_data_elements");

  const [phase,    setPhase]    = useState<Phase>("browse");
  const [filter,   setFilter]   = useState<FilterState>({ type: "all" });
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [perElem,  setPerElem]  = useState<Record<string, ElementSettings>>({});
  const [error,    setError]    = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    if (open) {
      setPhase("browse");
      setFilter({ type: "all" });
      setSearch("");
      setSelected(new Set());
      setPerElem({});
      setError(null);
      setSaving(false);
    }
  }, [open]);

  function goToJunction() {
    setPerElem((prev) => {
      const next: Record<string, ElementSettings> = {};
      for (const id of selected) {
        next[id] = prev[id] ?? { ...DEFAULT_SETTINGS };
      }
      return next;
    });
    setPhase("junction");
  }

  function setElemField<K extends keyof ElementSettings>(
    id: string,
    key: K,
    value: ElementSettings[K],
  ) {
    setPerElem((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? DEFAULT_SETTINGS), [key]: value },
    }));
  }

  // ---- Filtered element list ----
  const filteredUnbound = useMemo(() => {
    let list = availableDefs.filter((d) => !alreadyBoundIds.has(d.id));

    if (filter.type === "conn" || filter.type === "schema") {
      const name = filter.connName.toLowerCase();
      list = list.filter((d) => d.source_system?.toLowerCase() === name);
    } else if (filter.type === "table") {
      const name  = filter.connName.toLowerCase();
      const table = filter.table.toLowerCase();
      list = list.filter(
        (d) =>
          d.source_system?.toLowerCase() === name &&
          (d.table_or_view?.toLowerCase().includes(table) ?? false),
      );
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.field_name ?? "").toLowerCase().includes(q) ||
          (d.table_or_view ?? "").toLowerCase().includes(q) ||
          (d.business_description ?? "").toLowerCase().includes(q),
      );
    }

    return list;
  }, [availableDefs, alreadyBoundIds, filter, search]);

  const filteredBound = useMemo(() => {
    let list = availableDefs.filter((d) => alreadyBoundIds.has(d.id));

    if (filter.type === "conn" || filter.type === "schema") {
      const name = filter.connName.toLowerCase();
      list = list.filter((d) => d.source_system?.toLowerCase() === name);
    } else if (filter.type === "table") {
      const name  = filter.connName.toLowerCase();
      const table = filter.table.toLowerCase();
      list = list.filter(
        (d) =>
          d.source_system?.toLowerCase() === name &&
          (d.table_or_view?.toLowerCase().includes(table) ?? false),
      );
    }

    return list;
  }, [availableDefs, alreadyBoundIds, filter]);

  // ---- Selection ----

  function toggleOne(id: string, e: React.MouseEvent) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e.ctrlKey || e.metaKey) {
        if (next.has(id)) next.delete(id); else next.add(id);
      } else {
        if (next.size === 1 && next.has(id)) next.delete(id);
        else { next.clear(); next.add(id); }
      }
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filteredUnbound.length && filteredUnbound.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredUnbound.map((d) => d.id)));
    }
  }

  // ---- Save (per-element junction creation) ----

  async function handleBind() {
    setSaving(true);
    setError(null);
    try {
      for (const deId of selected) {
        const s = perElem[deId] ?? DEFAULT_SETTINGS;
        await new Promise<void>((resolve, reject) => {
          createSDE.mutate(
            {
              step_id: stepId,
              data_element_id: deId,
              binding_point: s.binding_point,
              presence:       s.presence,
              is_key:         s.is_key,
              quality_notes:  s.quality_notes || null,
            },
            { onSuccess: () => resolve(), onError: reject },
          );
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to bind one or more elements.");
      setSaving(false);
    }
  }

  const selectedDefs = useMemo(
    () => availableDefs.filter((d) => selected.has(d.id)),
    [availableDefs, selected],
  );

  const allChecked =
    filteredUnbound.length > 0 && filteredUnbound.every((d) => selected.has(d.id));
  const someChecked = filteredUnbound.some((d) => selected.has(d.id));

  const filterLabel =
    filter.type === "all"    ? "All" :
    filter.type === "conn"   ? filter.connName :
    filter.type === "schema" ? `${filter.connName} · ${filter.schema}` :
    `${filter.connName} · ${filter.schema} · ${filter.table}`;

  // ---- Browse phase ----
  if (phase === "browse") {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={stepName ? `Bind Data  ·  ${stepName}` : "Bind Data Elements"}
        className="max-w-3xl"
        footer={
          <div className="flex w-full items-center gap-2">
            <span className="mr-auto text-xs text-muted-foreground">
              {selected.size > 0
                ? `${selected.size} element${selected.size !== 1 ? "s" : ""} selected`
                : "Click rows to select · Ctrl+click for multi-select"}
            </span>
            {error && <span className="text-xs text-status-critical">{error}</span>}
            <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
            {onDefineNew && (
              <Button variant="outline" type="button" onClick={onDefineNew}>
                <Plus size={13} /> Define new element
              </Button>
            )}
            <Button
              type="button"
              disabled={selected.size === 0}
              onClick={goToJunction}
            >
              Bind {selected.size > 0 ? `${selected.size} selected` : "selected"} →
            </Button>
          </div>
        }
      >
        {/* Two-panel layout */}
        <div className="flex h-[52vh] gap-0 overflow-hidden rounded-md border border-border">
          {/* Left: Navigator */}
          <div className="w-52 shrink-0 overflow-y-auto border-r border-border bg-muted/20 px-1">
            <p className="sticky top-0 bg-muted/20 px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Connections
            </p>
            <FilterNav
              connections={connections.data ?? []}
              filter={filter}
              setFilter={(f) => { setFilter(f); setSearch(""); }}
            />
          </div>

          {/* Right: Element list */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Search bar + filter label */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <span className="truncate text-[11px] font-medium text-muted-foreground">{filterLabel}</span>
              <div className="relative ml-auto w-48">
                <Search
                  size={12}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  className="h-7 w-full rounded border border-border bg-input pl-7 pr-3 text-xs outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1.5rem_1fr_7rem_7rem] gap-x-2 border-b border-border bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <label className="flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-border"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                  onChange={toggleAll}
                />
              </label>
              <span>Element</span>
              <span>Source</span>
              <span>Table · Field</span>
            </div>

            {/* Rows */}
            <div className="flex-1 overflow-y-auto">
              {filteredUnbound.length === 0 && filteredBound.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {search
                    ? `No elements match "${search}"`
                    : filter.type === "all"
                    ? "No data elements defined yet."
                    : "No elements from this source in the catalog."}
                </div>
              ) : (
                <>
                  {filteredUnbound.map((d) => {
                    const checked = selected.has(d.id);
                    const loc = [d.table_or_view, d.field_name].filter(Boolean).join(".");
                    return (
                      <div
                        key={d.id}
                        onClick={(e) => toggleOne(d.id, e)}
                        className={cn(
                          "grid cursor-pointer grid-cols-[1.5rem_1fr_7rem_7rem] items-center gap-x-2 border-b border-border/50 px-3 py-2 text-sm transition-colors select-none",
                          checked ? "bg-primary/8 hover:bg-primary/12" : "hover:bg-muted/40",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="pointer-events-none h-3.5 w-3.5 rounded border-border"
                          checked={checked}
                          readOnly
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{d.name}</p>
                          {d.business_description && (
                            <p className="truncate text-[11px] text-muted-foreground">
                              {d.business_description}
                            </p>
                          )}
                        </div>
                        <span className="truncate text-xs text-muted-foreground">
                          {d.source_system ?? "—"}
                        </span>
                        <span className="mono truncate text-xs text-accent">{loc || "—"}</span>
                      </div>
                    );
                  })}

                  {filteredBound.length > 0 && (
                    <>
                      <div className="border-b border-border/50 bg-muted/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Already bound to this step
                      </div>
                      {filteredBound.map((d) => {
                        const loc = [d.table_or_view, d.field_name].filter(Boolean).join(".");
                        return (
                          <div
                            key={d.id}
                            className="grid grid-cols-[1.5rem_1fr_7rem_7rem] items-center gap-x-2 border-b border-border/50 px-3 py-2 text-sm opacity-40"
                          >
                            <span />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{d.name}</p>
                            </div>
                            <span className="truncate text-xs text-muted-foreground">
                              {d.source_system ?? "—"}
                            </span>
                            <span className="mono truncate text-xs">{loc || "—"}</span>
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  // ---- Junction phase — per-element relationship forms ----
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Set Step Relationship · ${selectedDefs.length} element${selectedDefs.length !== 1 ? "s" : ""}`}
      className="max-w-2xl"
      footer={
        <div className="flex w-full items-center gap-2">
          {error && <span className="mr-auto text-xs text-status-critical">{error}</span>}
          <Button
            variant="ghost"
            type="button"
            onClick={() => { setPhase("browse"); setError(null); }}
          >
            <ArrowLeft size={13} /> Back
          </Button>
          <Button type="button" disabled={saving} onClick={handleBind}>
            {saving ? "Binding…" : `Bind ${selectedDefs.length} element${selectedDefs.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Set how each element is used at this step. Changes here only affect this step binding.
        </p>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {selectedDefs.map((d) => {
            const s = perElem[d.id] ?? DEFAULT_SETTINGS;
            const loc = [d.table_or_view, d.field_name].filter(Boolean).join(".");
            return (
              <div
                key={d.id}
                className="rounded-md border border-border bg-muted/20 px-3 py-3 space-y-2.5"
              >
                {/* Element header */}
                <div>
                  <p className="text-sm font-semibold leading-tight">{d.name}</p>
                  {(d.source_system || loc) && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {[d.source_system, loc].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>

                {/* Binding point + Presence row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Binding point
                    </label>
                    <select
                      className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                      value={s.binding_point}
                      onChange={(e) => setElemField(d.id, "binding_point", e.target.value)}
                    >
                      {BINDING_POINTS.map((bp) => (
                        <option key={bp} value={bp}>
                          {bp.charAt(0).toUpperCase() + bp.slice(1)}
                          {bp === "entry" ? " (source)" : " (target)"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Presence
                    </label>
                    <select
                      className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                      value={s.presence}
                      onChange={(e) => setElemField(d.id, "presence", e.target.value)}
                    >
                      {PRESENCE.map((p) => (
                        <option key={p} value={p}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Is key + Quality notes row */}
                <div className="grid grid-cols-[auto_1fr] items-start gap-4">
                  <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-border"
                      checked={s.is_key}
                      onChange={(e) => setElemField(d.id, "is_key", e.target.checked)}
                    />
                    <span className="whitespace-nowrap text-xs font-medium">Key data component</span>
                  </label>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Quality notes
                    </label>
                    <textarea
                      rows={2}
                      className="w-full rounded border border-border bg-input px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
                      placeholder="Optional — known quality issues, transformations, gaps…"
                      value={s.quality_notes}
                      onChange={(e) => setElemField(d.id, "quality_notes", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
