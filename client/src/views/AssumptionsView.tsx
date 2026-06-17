import { useState } from "react";
import { Plus } from "lucide-react";
import type { Assumption } from "@shared/schemas";
import { useList } from "@/lib/queries";
import { assumptionFields } from "@/lib/entityConfig";
import { ViewShell, Table, Tr, Td, EmptyHint } from "@/components/ViewShell";
import { Badge, Button } from "@/components/ui/primitives";
import { EntityModalForm } from "@/components/EntityModalForm";
import { RowActions } from "@/components/RowActions";

const tone = { unvalidated: "gap", supported: "healthy", refuted: "critical" } as const;

export function AssumptionsView({ vsId }: { vsId: string }) {
  const assumptions = useList<Assumption>("assumptions", { where: { value_stream_id: vsId } });
  const [editing, setEditing] = useState<Assumption | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <ViewShell
      title="Assumptions"
      subtitle="Current operating assumptions, captured explicitly so they can be challenged."
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={14} /> Assumption
        </Button>
      }
    >
      {(assumptions.data ?? []).length === 0 ? (
        <EmptyHint>No assumptions logged yet.</EmptyHint>
      ) : (
        <Table columns={["Assumption", "Status", "Evidence", ""]}>
          {assumptions.data!.map((a) => (
            <Tr key={a.id}>
              <Td className="max-w-md font-medium">{a.statement}</Td>
              <Td>
                <Badge tone={tone[a.status]}>{a.status}</Badge>
              </Td>
              <Td className="max-w-sm text-xs text-muted-foreground">{a.evidence ?? "—"}</Td>
              <Td>
                <RowActions entityKey="assumptions" id={a.id} onEdit={() => setEditing(a)} />
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      <EntityModalForm
        open={creating}
        onClose={() => setCreating(false)}
        entityKey="assumptions"
        title="New Assumption"
        fields={assumptionFields}
        extra={{ value_stream_id: vsId }}
      />
      {editing && (
        <EntityModalForm
          open
          onClose={() => setEditing(null)}
          entityKey="assumptions"
          title="Edit Assumption"
          fields={assumptionFields}
          initial={editing}
        />
      )}
    </ViewShell>
  );
}
