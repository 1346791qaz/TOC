import { useEffect, useRef, useState } from "react";
import { ChevronRight, Database, Loader2, Table2 } from "lucide-react";
import type { DbConnection } from "@shared/schemas";
import { cn } from "@/lib/utils";

interface SchemaInfo { schema: string }
interface TableInfo { table_name: string; table_type: string }
export interface ColumnInfo { column_name: string; data_type: string; is_nullable: boolean }

export interface SelectedColumn {
  connection_name: string;
  schema: string;
  table: string;
  column_name: string;
  data_type: string;
  is_nullable: boolean;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

interface BrowseState {
  schemas: SchemaInfo[] | null;
  schemasError: string | null;
  loadingSchemas: boolean;
  expandedSchema: string | null;
  tables: Record<string, TableInfo[] | null>;
  tablesError: Record<string, string>;
  loadingTables: Record<string, boolean>;
  expandedTable: Record<string, string | null>;
  columns: Record<string, ColumnInfo[] | null>;
  columnsError: Record<string, string>;
  loadingColumns: Record<string, boolean>;
}

const EMPTY_STATE: BrowseState = {
  schemas: null,
  schemasError: null,
  loadingSchemas: false,
  expandedSchema: null,
  tables: {},
  tablesError: {},
  loadingTables: {},
  expandedTable: {},
  columns: {},
  columnsError: {},
  loadingColumns: {},
};

export function SchemaBrowser({
  connections,
  selected,
  onToggle,
}: {
  connections: DbConnection[];
  selected: Set<string>;
  onToggle: (col: SelectedColumn) => void;
}) {
  const [connId, setConnId] = useState<string>(connections[0]?.id ?? "");
  const [state, setState] = useState<BrowseState>(EMPTY_STATE);
  const loadingRef = useRef<Record<string, boolean>>({});

  const conn = connections.find((c) => c.id === connId);

  // Load schemas when connection changes
  useEffect(() => {
    if (!connId) return;
    setState(EMPTY_STATE);
    setState((s) => ({ ...s, loadingSchemas: true }));
    fetchJson<SchemaInfo[]>(`/api/db_connections/${connId}/schema`)
      .then((schemas) => setState((s) => ({ ...s, schemas, loadingSchemas: false })))
      .catch((e) => setState((s) => ({ ...s, schemasError: String(e), loadingSchemas: false })));
  }, [connId]);

  function toggleSchema(schema: string) {
    setState((s) => {
      const expanding = s.expandedSchema !== schema;
      const next = { ...s, expandedSchema: expanding ? schema : null };
      if (expanding && !s.tables[schema] && !loadingRef.current[`schema:${schema}`]) {
        loadingRef.current[`schema:${schema}`] = true;
        next.loadingTables = { ...s.loadingTables, [schema]: true };
        fetchJson<TableInfo[]>(`/api/db_connections/${connId}/schema/${encodeURIComponent(schema)}/tables`)
          .then((tables) => {
            loadingRef.current[`schema:${schema}`] = false;
            setState((ps) => ({ ...ps, tables: { ...ps.tables, [schema]: tables }, loadingTables: { ...ps.loadingTables, [schema]: false } }));
          })
          .catch((e) => {
            loadingRef.current[`schema:${schema}`] = false;
            setState((ps) => ({ ...ps, tablesError: { ...ps.tablesError, [schema]: String(e) }, loadingTables: { ...ps.loadingTables, [schema]: false } }));
          });
      }
      return next;
    });
  }

  function toggleTable(schema: string, table: string) {
    const key = `${schema}.${table}`;
    setState((s) => {
      const current = s.expandedTable[schema];
      const expanding = current !== table;
      const next = { ...s, expandedTable: { ...s.expandedTable, [schema]: expanding ? table : null } };
      if (expanding && !s.columns[key] && !loadingRef.current[`col:${key}`]) {
        loadingRef.current[`col:${key}`] = true;
        next.loadingColumns = { ...s.loadingColumns, [key]: true };
        fetchJson<ColumnInfo[]>(
          `/api/db_connections/${connId}/schema/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/columns`,
        )
          .then((cols) => {
            loadingRef.current[`col:${key}`] = false;
            setState((ps) => ({ ...ps, columns: { ...ps.columns, [key]: cols }, loadingColumns: { ...ps.loadingColumns, [key]: false } }));
          })
          .catch((e) => {
            loadingRef.current[`col:${key}`] = false;
            setState((ps) => ({ ...ps, columnsError: { ...ps.columnsError, [key]: String(e) }, loadingColumns: { ...ps.loadingColumns, [key]: false } }));
          });
      }
      return next;
    });
  }

  function colKey(schema: string, table: string, col: string) {
    return `${connId}::${schema}.${table}.${col}`;
  }

  return (
    <div className="space-y-3">
      {/* Connection picker */}
      {connections.length > 1 && (
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Connection
          </label>
          <select
            className="w-full rounded-md border border-border bg-input px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            value={connId}
            onChange={(e) => setConnId(e.target.value)}
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}
      {connections.length === 1 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Database size={13} />
          <span className="font-medium text-foreground">{conn?.name}</span>
          <span className="text-xs">· {conn?.driver_type}</span>
        </div>
      )}

      {/* Schema tree */}
      <div className="max-h-72 overflow-y-auto rounded-md border border-border text-sm">
        {state.loadingSchemas && (
          <div className="flex items-center gap-2 px-3 py-4 text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading schemas…
          </div>
        )}
        {state.schemasError && (
          <p className="px-3 py-3 text-xs text-status-critical">{state.schemasError}</p>
        )}
        {state.schemas?.length === 0 && (
          <p className="px-3 py-3 text-xs text-muted-foreground">No schemas visible with these credentials.</p>
        )}
        {(state.schemas ?? []).map((s) => {
          const schemaOpen = state.expandedSchema === s.schema;
          const schemaTables = state.tables[s.schema] ?? [];
          return (
            <div key={s.schema}>
              {/* Schema row */}
              <button
                type="button"
                onClick={() => toggleSchema(s.schema)}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left font-medium hover:bg-muted/50"
              >
                <ChevronRight
                  size={12}
                  className={cn("shrink-0 transition-transform", schemaOpen && "rotate-90")}
                />
                <Database size={13} className="shrink-0 text-muted-foreground" />
                {s.schema}
                {state.loadingTables[s.schema] && <Loader2 size={11} className="ml-1 animate-spin text-muted-foreground" />}
              </button>

              {/* Tables */}
              {schemaOpen && (
                <div className="border-t border-border/50">
                  {state.tablesError[s.schema] && (
                    <p className="px-6 py-2 text-xs text-status-critical">{state.tablesError[s.schema]}</p>
                  )}
                  {schemaTables.map((t) => {
                    const tableKey = `${s.schema}.${t.table_name}`;
                    const tableOpen = state.expandedTable[s.schema] === t.table_name;
                    const cols = state.columns[tableKey] ?? [];
                    return (
                      <div key={t.table_name}>
                        {/* Table row */}
                        <button
                          type="button"
                          onClick={() => toggleTable(s.schema, t.table_name)}
                          className="flex w-full items-center gap-1.5 py-1.5 pl-7 pr-3 text-left hover:bg-muted/50"
                        >
                          <ChevronRight
                            size={11}
                            className={cn("shrink-0 transition-transform text-muted-foreground", tableOpen && "rotate-90")}
                          />
                          <Table2 size={12} className="shrink-0 text-muted-foreground/70" />
                          <span className="font-mono text-xs">{t.table_name}</span>
                          {state.loadingColumns[tableKey] && <Loader2 size={11} className="ml-1 animate-spin text-muted-foreground" />}
                        </button>

                        {/* Columns */}
                        {tableOpen && (
                          <div className="border-t border-border/30 bg-muted/20">
                            {state.columnsError[tableKey] && (
                              <p className="px-10 py-2 text-xs text-status-critical">{state.columnsError[tableKey]}</p>
                            )}
                            {cols.map((col) => {
                              const key = colKey(s.schema, t.table_name, col.column_name);
                              const checked = selected.has(key);
                              return (
                                <label
                                  key={col.column_name}
                                  className={cn(
                                    "flex cursor-pointer items-center gap-2 py-1 pl-11 pr-3 hover:bg-muted/40",
                                    checked && "bg-primary/5",
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 shrink-0 rounded border-border"
                                    checked={checked}
                                    onChange={() =>
                                      onToggle({
                                        connection_name: conn?.name ?? "",
                                        schema: s.schema,
                                        table: t.table_name,
                                        column_name: col.column_name,
                                        data_type: col.data_type,
                                        is_nullable: col.is_nullable,
                                      })
                                    }
                                  />
                                  <span className="mono text-xs">{col.column_name}</span>
                                  <span className="ml-auto text-xs text-muted-foreground">{col.data_type}</span>
                                  {!col.is_nullable && (
                                    <span className="text-[10px] text-status-critical">NOT NULL</span>
                                  )}
                                </label>
                              );
                            })}
                            {cols.length === 0 && !state.loadingColumns[tableKey] && (
                              <p className="px-11 py-1 text-xs text-muted-foreground">No columns returned.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {schemaTables.length === 0 && !state.loadingTables[s.schema] && (
                    <p className="px-6 py-2 text-xs text-muted-foreground">No tables found.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selected.size > 0 && (
        <p className="text-xs text-muted-foreground">
          {selected.size} column{selected.size !== 1 ? "s" : ""} selected
        </p>
      )}
    </div>
  );
}
