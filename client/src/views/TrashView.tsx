import type { EntityKey } from "@shared/schemas";
import { useList, useRestore } from "@/lib/queries";
import { titleCase } from "@/lib/display";
import { ViewShell, Table, Tr, Td, EmptyHint } from "@/components/ViewShell";
import { Button } from "@/components/ui/primitives";

// Entities surfaced in Trash, in a sensible order.
const TRASH_KEYS: EntityKey[] = [
  "value_streams",
  "process_steps",
  "personas",
  "data_elements",
  "constraints",
  "metrics",
  "assumptions",
  "flow_edges",
  "step_personas",
];

function labelOf(row: Record<string, unknown>): string {
  return (
    (row.name as string) ||
    (row.title as string) ||
    (row.statement as string) ||
    (row.id as string).slice(0, 8)
  );
}

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
        {titleCase(entityKey)} ({rows.length})
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

export function TrashView(_props: { vsId: string }) {
  return (
    <ViewShell title="Trash" subtitle="Soft-deleted items. Nothing is ever hard-deleted from the UI.">
      <div className="space-y-5">
        {TRASH_KEYS.map((k) => (
          <TrashSection key={k} entityKey={k} />
        ))}
        <EmptyHint>Sections appear here only when they contain trashed items.</EmptyHint>
      </div>
    </ViewShell>
  );
}
