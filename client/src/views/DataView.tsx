import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { DataElement } from "@shared/schemas";
import { useList } from "@/lib/queries";
import { ViewShell, SearchBar, Table, Tr, Td, EmptyHint, type SortDir } from "@/components/ViewShell";
import { Badge, Button } from "@/components/ui/primitives";
import { DataElementModal } from "@/components/DataElementModal";
import { RowActions } from "@/components/RowActions";
import type { BindingPoint, Presence } from "@shared/enums";

const COLS = ["Element", "Source system", "Table.Field", "Type", ""] as const;

function getVal(d: DataElement, col: string): string {
  switch (col) {
    case "Element": return [d.name, d.business_description].filter(Boolean).join(" ");
    case "Source system": return d.source_system ?? "";
    case "Table.Field": return [d.table_or_view, d.field_name].filter(Boolean).join(".");
    case "Type": return [d.data_type, d.example_value].filter(Boolean).join(" ");
    default: return "";
  }
}

export function DataView({ vsId }: { vsId: string }) {
  const dataElements = useList<DataElement>("data_elements", {
    where: { value_stream_id: vsId },
  });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DataElement | null>(null);
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<string>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const rows = useMemo(() => {
    let data = dataElements.data ?? [];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      data = data.filter((d) =>
        COLS.slice(0, -1).some((col) => getVal(d, col).toLowerCase().includes(q))
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
  }, [dataElements.data, query, sortCol, sortDir]);

  // Live = linked to a DB connection; Manual = typed source system, no live connection
  const liveCount = useMemo(
    () => (dataElements.data ?? []).filter((d) => d.db_connection_id).length,
    [dataElements.data],
  );

  return (
    <ViewShell
      title="Data Elements"
      subtitle="Mappable data fields — each can be linked to a live database connection or documented manually."
      actions={
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Search data elements…" />
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> Data element
          </Button>
        </>
      }
    >
      {liveCount > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          <Badge tone="accent">{liveCount} live</Badge>{" "}
          {liveCount === 1 ? "element is" : "elements are"} connected to a live database.{" "}
          {rows.length - liveCount > 0 && `${rows.length - liveCount} manual.`}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyHint>{query ? `No data elements matching "${query}".` : "No data elements defined yet."}</EmptyHint>
      ) : (
        <Table columns={[...COLS]} sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
          {rows.map((d) => {
            const loc = [d.table_or_view, d.field_name].filter(Boolean).join(".");
            return (
              <Tr key={d.id}>
                <Td className="font-medium">
                  {d.name}
                  {d.business_description && (
                    <span className="block max-w-xs truncate text-[10px] font-normal text-muted-foreground">
                      {d.business_description}
                    </span>
                  )}
                </Td>
                <Td className="text-xs text-muted-foreground">
                  {d.source_system ?? "—"}
                  {d.db_connection_id && (
                    <Badge tone="accent" className="ml-1">live</Badge>
                  )}
                </Td>
                <Td className="mono text-xs text-accent">{loc || "—"}</Td>
                <Td className="text-xs text-muted-foreground">
                  {d.data_type ?? "—"}
                  {d.length && (
                    <span className="text-muted-foreground/70"> ({d.length})</span>
                  )}
                  {d.example_value && (
                    <span className="block truncate text-[10px] text-muted-foreground/70">
                      e.g. {d.example_value}
                    </span>
                  )}
                </Td>
                <Td>
                  <RowActions entityKey="data_elements" id={d.id} label={d.name} onEdit={() => setEditing(d)} />
                </Td>
              </Tr>
            );
          })}
        </Table>
      )}

      {creating && (
        <DataElementModal
          open
          onClose={() => setCreating(false)}
          vsId={vsId}
          availableDefs={dataElements.data ?? []}
          mode="define"
        />
      )}
      {editing && (
        <DataElementModal
          open
          onClose={() => setEditing(null)}
          vsId={vsId}
          availableDefs={dataElements.data ?? []}
          initial={{
            id: editing.id,
            data_element_id: editing.id,
            step_id: "",
            binding_point: "entry" as BindingPoint,
            presence: "present" as Presence,
            quality_notes: null,
            is_key: false,
            created_at: editing.created_at,
            updated_at: editing.updated_at,
            deleted_at: editing.deleted_at,
            value_stream_id: editing.value_stream_id,
            name: editing.name,
            business_description: editing.business_description,
            data_type: editing.data_type,
            length: editing.length,
            source_system: editing.source_system,
            table_or_view: editing.table_or_view,
            field_name: editing.field_name,
            example_value: editing.example_value,
          }}
          mode="define"
        />
      )}
    </ViewShell>
  );
}
