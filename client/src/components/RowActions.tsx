import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { EntityKey } from "@shared/schemas";
import { useSoftDelete } from "@/lib/queries";
import { Button } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function RowActions({
  entityKey,
  id,
  label,
  onEdit,
}: {
  entityKey: EntityKey;
  id: string;
  label: string;
  onEdit: () => void;
}) {
  const del = useSoftDelete(entityKey);
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          aria-label="Edit"
        >
          <Pencil size={13} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
          aria-label="Delete"
        >
          <Trash2 size={13} className="text-status-critical" />
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => del.mutate(id)}
        message={`Move "${label}" to Trash? It can be restored later.`}
      />
    </>
  );
}
