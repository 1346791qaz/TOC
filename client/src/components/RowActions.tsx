import { Pencil, Trash2 } from "lucide-react";
import type { EntityKey } from "@shared/schemas";
import { useSoftDelete } from "@/lib/queries";
import { Button } from "@/components/ui/primitives";

export function RowActions({
  entityKey,
  id,
  onEdit,
}: {
  entityKey: EntityKey;
  id: string;
  onEdit: () => void;
}) {
  const del = useSoftDelete(entityKey);
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        aria-label="Edit"
      >
        <Pencil size={13} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm("Move to Trash? It can be restored later.")) del.mutate(id);
        }}
        aria-label="Delete"
      >
        <Trash2 size={13} className="text-status-critical/80" />
      </Button>
    </div>
  );
}
