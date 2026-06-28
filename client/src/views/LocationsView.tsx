import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Location } from "@shared/schemas";
import { LOCATION_TYPE_LABELS } from "@shared/enums";
import { useList } from "@/lib/queries";
import { ViewShell, SearchBar, Table, Tr, Td, EmptyHint, type SortDir } from "@/components/ViewShell";
import { Badge, Button } from "@/components/ui/primitives";
import { RowActions } from "@/components/RowActions";
import { LocationModal } from "@/components/LocationModal";

const COLS = ["Name", "Type", "Address", "Description", ""] as const;

function getVal(l: Location, col: string): string {
  switch (col) {
    case "Name": return l.name ?? "";
    case "Type": return l.location_type ?? "";
    case "Address": return l.address ?? "";
    case "Description": return l.description ?? "";
    default: return "";
  }
}

function searchText(l: Location) {
  return [l.name, l.location_type, l.address, l.description].filter(Boolean).join(" ").toLowerCase();
}

export function LocationsView({ vsId: _vsId }: { vsId: string }) {
  const locations = useList<Location>("locations");
  const [editing, setEditing] = useState<Location | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<string>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const rows = useMemo(() => {
    let data = locations.data ?? [];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      data = data.filter((l) => searchText(l).includes(q));
    }
    if (sortCol) {
      data = [...data].sort((a, b) => {
        const av = getVal(a, sortCol).toLowerCase();
        const bv = getVal(b, sortCol).toLowerCase();
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return data;
  }, [locations.data, query, sortCol, sortDir]);

  return (
    <ViewShell
      title="Locations"
      subtitle="Physical workcenters, stations, and facilities where process steps occur. Shared across all value streams."
      actions={
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Search locations…" />
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> Location
          </Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyHint>No locations{query ? ` matching "${query}"` : ""} yet.</EmptyHint>
      ) : (
        <Table columns={[...COLS]} sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
          {rows.map((l) => (
            <Tr key={l.id}>
              <Td className="font-medium">{l.name}</Td>
              <Td>
                <Badge tone="info">
                  {LOCATION_TYPE_LABELS[l.location_type as keyof typeof LOCATION_TYPE_LABELS] ?? l.location_type}
                </Badge>
              </Td>
              <Td className="max-w-xs truncate text-xs text-muted-foreground">{l.address ?? "—"}</Td>
              <Td className="max-w-xs truncate text-xs text-muted-foreground">{l.description ?? "—"}</Td>
              <Td>
                <RowActions entityKey="locations" id={l.id} label={l.name} onEdit={() => setEditing(l)} />
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      {creating && <LocationModal open onClose={() => setCreating(false)} />}
      {editing && <LocationModal open onClose={() => setEditing(null)} initial={editing} />}
    </ViewShell>
  );
}
