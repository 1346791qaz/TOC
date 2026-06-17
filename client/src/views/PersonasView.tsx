import { useState } from "react";
import { Plus } from "lucide-react";
import type { Persona } from "@shared/schemas";
import { SCOPE_LEVELS } from "@shared/enums";
import { useList } from "@/lib/queries";
import { personaFields } from "@/lib/entityConfig";
import { titleCase } from "@/lib/display";
import { ViewShell, Table, Tr, Td, EmptyHint } from "@/components/ViewShell";
import { Badge, Button, Select } from "@/components/ui/primitives";
import { EntityModalForm } from "@/components/EntityModalForm";
import { RowActions } from "@/components/RowActions";

export function PersonasView({ vsId }: { vsId: string }) {
  const personas = useList<Persona>("personas", { where: { value_stream_id: vsId } });
  const [editing, setEditing] = useState<Persona | null>(null);
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<string>("");

  const rows = (personas.data ?? []).filter((p) => !scope || p.scope_level === scope);

  return (
    <ViewShell
      title="Personas"
      subtitle="Roles touching the value stream — widen scope as the analysis reveals system-level actors."
      actions={
        <>
          <Select value={scope} onChange={(e) => setScope(e.target.value)} className="h-8 w-32">
            <option value="">All scopes</option>
            {SCOPE_LEVELS.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> Persona
          </Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyHint>No personas{scope ? ` at ${scope} scope` : ""} yet.</EmptyHint>
      ) : (
        <Table columns={["Name", "Role title", "Function", "Scope", "Authority", ""]}>
          {rows.map((p) => (
            <Tr key={p.id}>
              <Td className="font-medium">{p.name}</Td>
              <Td className="text-muted-foreground">{p.role_title ?? "—"}</Td>
              <Td className="text-muted-foreground">{p.function ?? "—"}</Td>
              <Td>
                <Badge tone="info">{p.scope_level}</Badge>
              </Td>
              <Td className="max-w-xs truncate text-xs text-muted-foreground">
                {p.authority_notes ?? "—"}
              </Td>
              <Td>
                <RowActions entityKey="personas" id={p.id} onEdit={() => setEditing(p)} />
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      <EntityModalForm
        open={creating}
        onClose={() => setCreating(false)}
        entityKey="personas"
        title="New Persona"
        fields={personaFields}
        extra={{ value_stream_id: vsId }}
      />
      {editing && (
        <EntityModalForm
          open
          onClose={() => setEditing(null)}
          entityKey="personas"
          title="Edit Persona"
          fields={personaFields}
          initial={editing}
        />
      )}
    </ViewShell>
  );
}
