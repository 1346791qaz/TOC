import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Artifact } from "@shared/schemas";
import { ARTIFACT_FORMS, ARTIFACT_TYPES } from "@shared/enums";
import { useList } from "@/lib/queries";
import { artifactFields } from "@/lib/entityConfig";
import { titleCase } from "@/lib/display";
import { ViewShell, SearchBar, Table, Tr, Td, EmptyHint, type SortDir } from "@/components/ViewShell";
import { Badge, Button, Select } from "@/components/ui/primitives";
import { EntityModalForm } from "@/components/EntityModalForm";
import { RowActions } from "@/components/RowActions";

const COLS = ["Name", "Type", "Form", "Description", ""] as const;

const FORM_TONE: Record<string, "info" | "accent" | "neutral"> = {
  digital: "info",
  physical: "neutral",
  intangible: "accent",
};

function getVal(a: Artifact, col: string): string {
  switch (col) {
    case "Name": return a.name ?? "";
    case "Type": return a.artifact_type ?? "";
    case "Form": return a.form ?? "";
    case "Description": return a.description ?? "";
    default: return "";
  }
}

function searchText(a: Artifact) {
  return [a.name, a.artifact_type, a.form, a.description]
    .filter(Boolean).join(" ").toLowerCase();
}

export function ArtifactsView({ vsId }: { vsId: string }) {
  const artifacts = useList<Artifact>("artifacts", { where: { value_stream_id: vsId } });
  const [editing, setEditing] = useState<Artifact | null>(null);
  const [creating, setCreating] = useState(false);
  const [formFilter, setFormFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<string>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const rows = useMemo(() => {
    let data = (artifacts.data ?? []).filter((a) => !formFilter || a.form === formFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      data = data.filter((a) => searchText(a).includes(q));
    }
    if (sortCol) {
      data = [...data].sort((a, b) => {
        const av = getVal(a, sortCol).toLowerCase();
        const bv = getVal(b, sortCol).toLowerCase();
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return data;
  }, [artifacts.data, formFilter, query, sortCol, sortDir]);

  return (
    <ViewShell
      title="Artifacts"
      subtitle="Documents, files, and objects that move through the value stream — not specific data fields."
      actions={
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Search artifacts…" />
          <Select value={formFilter} onChange={(e) => setFormFilter(e.target.value)} className="h-8 w-36">
            <option value="">All forms</option>
            {ARTIFACT_FORMS.map((f) => (
              <option key={f} value={f}>{titleCase(f)}</option>
            ))}
          </Select>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> Artifact
          </Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyHint>
          No artifacts{formFilter ? ` (${formFilter})` : ""}{query ? ` matching "${query}"` : ""} yet.
        </EmptyHint>
      ) : (
        <Table columns={[...COLS]} sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
          {rows.map((a) => (
            <Tr key={a.id}>
              <Td className="font-medium">{a.name}</Td>
              <Td className="text-xs text-muted-foreground">
                {ARTIFACT_TYPES.includes(a.artifact_type as typeof ARTIFACT_TYPES[number])
                  ? titleCase(a.artifact_type.replace(/_/g, " "))
                  : a.artifact_type}
              </Td>
              <Td>
                <Badge tone={FORM_TONE[a.form] ?? "neutral"}>{a.form}</Badge>
              </Td>
              <Td className="max-w-xs truncate text-xs text-muted-foreground">
                {a.description ?? "—"}
              </Td>
              <Td>
                <RowActions entityKey="artifacts" id={a.id} label={a.name} onEdit={() => setEditing(a)} />
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      <EntityModalForm
        open={creating}
        onClose={() => setCreating(false)}
        entityKey="artifacts"
        title="New Artifact"
        fields={artifactFields}
        extra={{ value_stream_id: vsId }}
      />
      {editing && (
        <EntityModalForm
          open
          onClose={() => setEditing(null)}
          entityKey="artifacts"
          title="Edit Artifact"
          fields={artifactFields}
          initial={editing}
        />
      )}
    </ViewShell>
  );
}
