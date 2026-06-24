import { useMemo } from "react";
import type { DataElement, DbConnection, EntityKey, StepDataElement } from "@shared/schemas";
import { useList, useRestore } from "@/lib/queries";
import { titleCase } from "@/lib/display";
import { ViewShell, Table, Tr, Td, EmptyHint } from "@/components/ViewShell";
import { Button } from "@/components/ui/primitives";

// Friendly display labels override the auto-generated titleCase names.
const ENTITY_LABELS: Partial<Record<EntityKey, string>> = {
  db_connections: "Database Connections",
  step_data_elements: "Data Bindings",
};

function entityLabel(key: EntityKey): string {
  return ENTITY_LABELS[key] ?? titleCase(key);
}

// Generic entities that need no special restore logic.
const GENERIC_TRASH_KEYS: EntityKey[] = [
  "db_connections",
  "value_streams",
  "process_steps",
  "personas",
  "step_personas",
  "constraints",
  "metrics",
  "assumptions",
  "flow_edges",
];

function labelOf(row: Record<string, unknown>): string {
  return (
    (row.name as string) ||
    (row.title as string) ||
    (row.statement as string) ||
    (row.id as string).slice(0, 8)
  );
}

// ---------------------------------------------------------------------------
// Generic trash section (no dependency checks needed)
// ---------------------------------------------------------------------------
function TrashSection({ entityKey }: { entityKey: EntityKey }) {
  const trashed = useList<Record<string, unknown> & { id: string; deleted_at: string }>(entityKey, {
    trashed: true,
  });
  const restore = useRestore(entityKey);
  const rows = trashed.data ?? [];
  if (rows.length === 0) return null;

  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {entityLabel(entityKey)} ({rows.length})
      </h3>
      <Table columns={["Item", "Deleted", ""]}>
        {rows.map((r) => (
          <Tr key={r.id}>
            <Td className="font-medium">{labelOf(r)}</Td>
            <Td className="mono text-xs text-muted-foreground">
              {r.deleted_at ? new Date(r.deleted_at).toLocaleString() : "—"}
            </Td>
            <Td className="text-right">
              <Button size="sm" variant="outline" onClick={() => restore.mutate(r.id)}>
                Restore
              </Button>
            </Td>
          </Tr>
        ))}
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Smart section for Data Elements — blocks restore if linked DB connection
// is no longer live, and offers to restore the connection from trash.
// ---------------------------------------------------------------------------
function DataElementTrashSection() {
  const trashed     = useList<DataElement>("data_elements", { trashed: true });
  const liveConns   = useList<DbConnection>("db_connections");
  const trashedConns = useList<DbConnection>("db_connections", { trashed: true });
  const restore      = useRestore<DataElement>("data_elements");
  const restoreConn  = useRestore<DbConnection>("db_connections");

  const liveConnMap = useMemo(
    () => new Map((liveConns.data ?? []).map((c) => [c.id, c])),
    [liveConns.data],
  );
  const trashedConnMap = useMemo(
    () => new Map((trashedConns.data ?? []).map((c) => [c.id, c])),
    [trashedConns.data],
  );

  const rows = trashed.data ?? [];
  if (rows.length === 0) return null;

  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Data Elements ({rows.length})
      </h3>
      <Table columns={["Item", "Deleted", ""]}>
        {rows.map((r) => {
          const connId    = r.db_connection_id;
          const connLive  = connId ? liveConnMap.has(connId)   : false;
          const connTrash = connId ? trashedConnMap.has(connId) : false;
          const needsConn = !!connId;
          const canRestore = !needsConn || connLive;

          return (
            <Tr key={r.id}>
              <Td className="font-medium">{r.name}</Td>
              <Td className="mono text-xs text-muted-foreground">
                {r.deleted_at ? new Date(r.deleted_at).toLocaleString() : "—"}
              </Td>
              <Td className="text-right">
                {canRestore ? (
                  <Button size="sm" variant="outline" onClick={() => restore.mutate(r.id)}>
                    Restore
                  </Button>
                ) : connTrash ? (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">
                      DB connection is in Trash
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restoreConn.mutate(connId!)}
                    >
                      Restore Connection First
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-status-critical">
                    Cannot restore — original DB connection no longer exists. Recreate it first.
                  </span>
                )}
              </Td>
            </Tr>
          );
        })}
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Smart section for Data Bindings (step_data_elements) — blocks restore if
// the linked Data Element is not live, and surfaces the restore chain.
// ---------------------------------------------------------------------------
function DataBindingTrashSection() {
  const trashed      = useList<StepDataElement>("step_data_elements", { trashed: true });
  const liveDEs      = useList<DataElement>("data_elements");
  const trashedDEs   = useList<DataElement>("data_elements", { trashed: true });
  const liveConns    = useList<DbConnection>("db_connections");
  const trashedConns = useList<DbConnection>("db_connections", { trashed: true });
  const restore      = useRestore<StepDataElement>("step_data_elements");
  const restoreDE    = useRestore<DataElement>("data_elements");
  const restoreConn  = useRestore<DbConnection>("db_connections");

  const liveDEMap    = useMemo(() => new Map((liveDEs.data ?? []).map((d) => [d.id, d])), [liveDEs.data]);
  const trashedDEMap = useMemo(() => new Map((trashedDEs.data ?? []).map((d) => [d.id, d])), [trashedDEs.data]);
  const liveConnMap  = useMemo(() => new Map((liveConns.data ?? []).map((c) => [c.id, c])), [liveConns.data]);
  const trashedConnMap = useMemo(() => new Map((trashedConns.data ?? []).map((c) => [c.id, c])), [trashedConns.data]);

  const rows = trashed.data ?? [];
  if (rows.length === 0) return null;

  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Data Bindings ({rows.length})
      </h3>
      <Table columns={["Item", "Deleted", ""]}>
        {rows.map((r) => {
          const deLive    = liveDEMap.has(r.data_element_id);
          const trashDE   = !deLive ? trashedDEMap.get(r.data_element_id) : undefined;
          const deGone    = !deLive && !trashDE;
          const deName    = (liveDEMap.get(r.data_element_id) ?? trashDE)?.name ?? r.data_element_id.slice(0, 8);
          const label     = `${deName} · ${r.binding_point}`;

          // Determine the restore chain for a trashed DE
          const deConnId    = trashDE?.db_connection_id ?? null;
          const deConnLive  = deConnId ? liveConnMap.has(deConnId)   : false;
          const deConnTrash = deConnId ? trashedConnMap.has(deConnId) : false;
          const deNeedsConn = !!deConnId;
          const deCanRestore = !deNeedsConn || deConnLive;

          return (
            <Tr key={r.id}>
              <Td className="font-medium">{label}</Td>
              <Td className="mono text-xs text-muted-foreground">
                {r.deleted_at ? new Date(r.deleted_at).toLocaleString() : "—"}
              </Td>
              <Td className="text-right">
                {deLive ? (
                  <Button size="sm" variant="outline" onClick={() => restore.mutate(r.id)}>
                    Restore
                  </Button>
                ) : deGone ? (
                  <span className="text-xs text-status-critical">
                    Cannot restore — Data Element no longer exists.
                  </span>
                ) : deCanRestore ? (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">
                      Data Element "{deName}" is in Trash
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restoreDE.mutate(r.data_element_id)}
                    >
                      Restore Element First
                    </Button>
                  </div>
                ) : deConnTrash ? (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">
                      "{deName}" needs its DB connection restored first
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restoreConn.mutate(deConnId!)}
                    >
                      Restore Connection First
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-status-critical">
                    Cannot restore — original DB connection no longer exists.
                  </span>
                )}
              </Td>
            </Tr>
          );
        })}
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TrashView
// ---------------------------------------------------------------------------
export function TrashView(_props: { vsId: string }) {
  return (
    <ViewShell title="Trash" subtitle="Soft-deleted items. Nothing is ever hard-deleted from the UI.">
      <div className="space-y-5">
        {GENERIC_TRASH_KEYS.map((k) => (
          <TrashSection key={k} entityKey={k} />
        ))}
        <DataElementTrashSection />
        <DataBindingTrashSection />
        <EmptyHint>Sections appear here only when they contain trashed items.</EmptyHint>
      </div>
    </ViewShell>
  );
}
