import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { LinkedDataElement } from "@shared/gaps";
import type { DataElement, ProcessStep, StepDataElement } from "@shared/schemas";
import { linkDataElements } from "@shared/gaps";
import type { BindingPoint, Presence } from "@shared/enums";
import { useList } from "@/lib/queries";
import { presenceTone } from "@/lib/display";
import { ViewShell, SearchBar, Table, Tr, Td, EmptyHint, type SortDir } from "@/components/ViewShell";
import { Badge, Button } from "@/components/ui/primitives";
import { DataElementModal } from "@/components/DataElementModal";
import { RowActions } from "@/components/RowActions";

const COLS = ["Step", "Binding", "Element", "Source / Target", "Table.Field", "Type", "Key", "Presence", ""] as const;

function getVal(d: LinkedDataElement, stepName: string, col: string): string {
  switch (col) {
    case "Step": return stepName;
    case "Binding": return d.binding_point === "entry" ? "entry src" : `${d.binding_point} tgt`;
    case "Element": return [d.name, d.business_description].filter(Boolean).join(" ");
    case "Source / Target": return d.source_system ?? "";
    case "Table.Field": return [d.table_or_view, d.field_name].filter(Boolean).join(".");
    case "Type": return [d.data_type, d.example_value].filter(Boolean).join(" ");
    case "Key": return d.is_key ? "key" : "";
    case "Presence": return d.presence ?? "";
    default: return "";
  }
}

export function DataView({ vsId }: { vsId: string }) {
  const steps = useList<ProcessStep>("process_steps", {
    where: { value_stream_id: vsId },
    orderBy: "sequence_index ASC",
  });
  const dataElementDefs = useList<DataElement>("data_elements", {
    where: { value_stream_id: vsId },
  });
  const allSDEs = useList<StepDataElement>("step_data_elements");

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LinkedDataElement | null>(null);
  const [editingCatalog, setEditingCatalog] = useState<DataElement | null>(null);
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<string>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const stepById = useMemo(
    () => new Map((steps.data ?? []).map((s) => [s.id, s])),
    [steps.data],
  );

  const stepIds = useMemo(() => new Set((steps.data ?? []).map((s) => s.id)), [steps.data]);

  const linkedElements = useMemo(() => {
    const vsSDEs = (allSDEs.data ?? []).filter((sde) => stepIds.has(sde.step_id));
    return linkDataElements(dataElementDefs.data ?? [], vsSDEs);
  }, [dataElementDefs.data, allSDEs.data, stepIds]);

  // Data elements that exist in the catalog but aren't bound to any step yet
  const unboundElements = useMemo(() => {
    const boundDefIds = new Set(linkedElements.map((e) => e.data_element_id));
    return (dataElementDefs.data ?? []).filter((de) => !boundDefIds.has(de.id));
  }, [dataElementDefs.data, linkedElements]);

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const rows = useMemo(() => {
    let data = linkedElements;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      data = data.filter((d) => {
        const stepName = stepById.get(d.step_id)?.name ?? "";
        return COLS.slice(0, -1).some((col) =>
          getVal(d, stepName, col).toLowerCase().includes(q)
        );
      });
    }
    if (sortCol) {
      data = [...data].sort((a, b) => {
        const stepA = stepById.get(a.step_id)?.name ?? "";
        const stepB = stepById.get(b.step_id)?.name ?? "";
        const av = getVal(a, stepA, sortCol).toLowerCase();
        const bv = getVal(b, stepB, sortCol).toLowerCase();
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedElements, stepById, query, sortCol, sortDir]);

  const filteredUnbound = useMemo(() => {
    if (!query.trim()) return unboundElements;
    const q = query.trim().toLowerCase();
    return unboundElements.filter(
      (de) =>
        (de.name ?? "").toLowerCase().includes(q) ||
        (de.business_description ?? "").toLowerCase().includes(q) ||
        (de.source_system ?? "").toLowerCase().includes(q) ||
        (de.field_name ?? "").toLowerCase().includes(q),
    );
  }, [unboundElements, query]);

  return (
    <ViewShell
      title="Data Elements"
      subtitle="Data bound to each step's entry / action / exit. One field definition can span multiple steps."
      actions={
        <>
          <SearchBar value={query} onChange={setQuery} placeholder="Search data…" />
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> Data element
          </Button>
        </>
      }
    >
      {rows.length === 0 && filteredUnbound.length === 0 ? (
        <EmptyHint>{query ? `No data elements matching "${query}".` : "No data elements defined yet."}</EmptyHint>
      ) : (
        <>
          {rows.length > 0 && (
            <Table columns={[...COLS]} sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
              {rows.map((d) => {
                const loc = [d.table_or_view, d.field_name].filter(Boolean).join(".");
                return (
                  <Tr key={d.id}>
                    <Td className="text-muted-foreground">{stepById.get(d.step_id)?.name ?? "—"}</Td>
                    <Td>
                      <Badge>{d.binding_point === "entry" ? "entry · src" : `${d.binding_point} · tgt`}</Badge>
                    </Td>
                    <Td className="font-medium">
                      {d.name}
                      {d.business_description && (
                        <span className="block max-w-xs truncate text-[10px] font-normal text-muted-foreground">
                          {d.business_description}
                        </span>
                      )}
                    </Td>
                    <Td className="text-xs text-muted-foreground">{d.source_system ?? "—"}</Td>
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
                    <Td>{d.is_key ? <Badge tone="accent">key</Badge> : "—"}</Td>
                    <Td>
                      <Badge tone={presenceTone[d.presence]}>{d.presence}</Badge>
                    </Td>
                    <Td>
                      {/* Soft-delete the step_data_elements junction row (not the definition) */}
                      <RowActions entityKey="step_data_elements" id={d.id} label={d.name} onEdit={() => setEditing(d)} />
                    </Td>
                  </Tr>
                );
              })}
            </Table>
          )}

          {/* Catalog elements not yet bound to any step */}
          {filteredUnbound.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Catalog — not yet bound to a step
              </p>
              <Table columns={[...COLS]} sortCol="" sortDir="asc" onSort={() => {}}>
                {filteredUnbound.map((de) => {
                  const loc = [de.table_or_view, de.field_name].filter(Boolean).join(".");
                  return (
                    <Tr key={de.id}>
                      <Td className="text-muted-foreground">—</Td>
                      <Td><Badge tone="muted">catalog</Badge></Td>
                      <Td className="font-medium">
                        {de.name}
                        {de.business_description && (
                          <span className="block max-w-xs truncate text-[10px] font-normal text-muted-foreground">
                            {de.business_description}
                          </span>
                        )}
                      </Td>
                      <Td className="text-xs text-muted-foreground">{de.source_system ?? "—"}</Td>
                      <Td className="mono text-xs text-accent">{loc || "—"}</Td>
                      <Td className="text-xs text-muted-foreground">
                        {de.data_type ?? "—"}
                        {de.length && (
                          <span className="text-muted-foreground/70"> ({de.length})</span>
                        )}
                        {de.example_value && (
                          <span className="block truncate text-[10px] text-muted-foreground/70">
                            e.g. {de.example_value}
                          </span>
                        )}
                      </Td>
                      <Td>—</Td>
                      <Td>—</Td>
                      <Td>
                        <RowActions entityKey="data_elements" id={de.id} label={de.name} onEdit={() => setEditingCatalog(de)} />
                      </Td>
                    </Tr>
                  );
                })}
              </Table>
            </div>
          )}
        </>
      )}

      {creating && (
        <DataElementModal
          open
          onClose={() => setCreating(false)}
          vsId={vsId}
          availableDefs={dataElementDefs.data ?? []}
          mode="define"
        />
      )}
      {editing && (
        <DataElementModal
          open
          onClose={() => setEditing(null)}
          vsId={vsId}
          availableDefs={dataElementDefs.data ?? []}
          initial={editing}
          mode="define"
        />
      )}
      {editingCatalog && (
        <DataElementModal
          open
          onClose={() => setEditingCatalog(null)}
          vsId={vsId}
          availableDefs={dataElementDefs.data ?? []}
          initial={{
            id: editingCatalog.id,
            data_element_id: editingCatalog.id,
            step_id: "",
            binding_point: "entry" as BindingPoint,
            presence: "present" as Presence,
            quality_notes: null,
            is_key: false,
            created_at: editingCatalog.created_at,
            updated_at: editingCatalog.updated_at,
            deleted_at: editingCatalog.deleted_at,
            value_stream_id: editingCatalog.value_stream_id,
            name: editingCatalog.name,
            business_description: editingCatalog.business_description,
            data_type: editingCatalog.data_type,
            length: editingCatalog.length,
            source_system: editingCatalog.source_system,
            table_or_view: editingCatalog.table_or_view,
            field_name: editingCatalog.field_name,
            example_value: editingCatalog.example_value,
          }}
          mode="define"
        />
      )}
    </ViewShell>
  );
}
