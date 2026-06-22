import { ChevronsUpDown, Plus, X } from "lucide-react";
import type { EntityKey } from "@shared/schemas";
import { useUpdate } from "@/lib/queries";
import { dataElementFields, personaFields, processStepFields } from "@/lib/entityConfig";
import type { FieldDef } from "@/lib/entityConfig";
import { Button } from "@/components/ui/primitives";
import { EntityForm } from "@/components/EntityForm";
import type { OilNodeData } from "./buildGraph";

function configFor(node: OilNodeData): { key: EntityKey; fields: FieldDef[]; record: Record<string, unknown> } | null {
  if (node.nodeKind === "step" && node.step)
    return { key: "process_steps", fields: processStepFields, record: node.step };
  if (node.nodeKind === "persona" && node.persona)
    return { key: "personas", fields: personaFields, record: node.persona };
  if (node.nodeKind === "data_element" && node.data) {
    const d = node.data;
    return {
      key: "data_elements",
      fields: dataElementFields,
      // Edit the definition record using data_element_id as the target id.
      record: { id: d.data_element_id, name: d.name, business_description: d.business_description, source_system: d.source_system, table_or_view: d.table_or_view, field_name: d.field_name, data_type: d.data_type, length: d.length, example_value: d.example_value },
    };
  }
  return null;
}

export function DetailDrawer({
  node,
  onClose,
  onAddSub,
  onToggleExpand,
}: {
  node: OilNodeData | null;
  onClose: () => void;
  onAddSub?: (stepId: string) => void;
  onToggleExpand?: (stepId: string) => void;
}) {
  const cfg = node ? configFor(node) : null;
  // Hook order is stable: the key only changes which entity we PATCH.
  const updateForKey = useUpdate((cfg?.key ?? "process_steps") as EntityKey);

  if (!node || !cfg) return null;

  const isStep = node.nodeKind === "step";

  return (
    <aside
      data-testid="detail-drawer"
      className="flex w-96 shrink-0 flex-col border-l border-border bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {node.nodeKind.replace("_", " ")}
          </p>
          <h2 className="text-sm font-semibold">{node.label}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X size={16} />
        </Button>
      </div>
      {isStep && (
        <div className="flex gap-2 border-b border-border p-3">
          {onAddSub && (
            <Button variant="outline" className="flex-1" onClick={() => onAddSub(node.entityId)}>
              <Plus size={14} /> Add sub-step
            </Button>
          )}
          {onToggleExpand && !!node.subStepCount && (
            <Button variant="subtle" className="flex-1" onClick={() => onToggleExpand(node.entityId)}>
              <ChevronsUpDown size={14} /> {node.isExpanded ? "Collapse" : "Show"} sub-steps ({node.subStepCount})
            </Button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3">
        <EntityForm
          key={cfg.record.id as string}
          formId="drawer-form"
          fields={cfg.fields}
          initial={cfg.record}
          onSubmit={(values) =>
            updateForKey.mutate({ id: cfg.record.id as string, data: values })
          }
        />
      </div>
      <div className="border-t border-border p-3">
        <Button type="submit" form="drawer-form" className="w-full" disabled={updateForKey.isPending}>
          {updateForKey.isPending ? "Saving…" : "Save changes"}
        </Button>
        {updateForKey.isSuccess && (
          <p className="mt-1 text-center text-xs text-status-healthy">Saved.</p>
        )}
      </div>
    </aside>
  );
}
