import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Assumption } from "@shared/schemas";
import { useList } from "@/lib/queries";
import { assumptionFields } from "@/lib/entityConfig";
import { ViewShell, SearchBar, Table, Tr, Td, EmptyHint, type SortDir } from "@/components/ViewShell";
import { Badge, Button } from "@/components/ui/primitives";
import { EntityModalForm } from "@/components/EntityModalForm";
import { RowActions } from "@/components/RowActions";

const tone = { unvalidated: "gap", supported: "healthy", refuted: "critical" } as const;
const COLS = ["Assumption", "Status", "Evidence", ""] as const;

function getVal(a: Assumption, col: string): string {
  switch (col) {
    case "Assumption": return a.statement ?? "";
    case "Status": return a.status ?? "";
    case "Evidence": return a.evidence ?? "";
    default: return "";
  }
}

export function AssumptionsView({ vsId }: { vsId: string }) {
  const assumptions = useList<Assumption>("assumptions", { where: { value_stream_id: vsId } });
  const [editing, setEditing] = useState<Assumption | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<string>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const rows = useMemo(() => {
    let data = assumptions.data ?? [];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      data = data.filter((a) =>
        COLS.slice(0, -1).some((col) => getVal(a, col).toLowerCase().includes(q))
      );
    }
    if (sortCol) {
      data = [...data].sort((a, b) => {
        const av = getVal(a, sortCol).toLowerCase();
        const bv = getVal(b, sortCol).toLowerCase();
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return data;
  }, [assumptions.data, query, sortCol, sortDir]);

  return (
    <ViewShell
      title="Assumptions"
      subtitle="Current operating assumptions, captured explicitly so they can be challenged."
      actions={
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Search assumptions…" />
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> Assumption
          </Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyHint>{query ? `No assumptions matching "${query}".` : "No assumptions logged yet."}</EmptyHint>
      ) : (
        <Table columns={[...COLS]} sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
          {rows.map((a) => (
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
