import { useState } from "react";
import type { EntityKey } from "@shared/schemas";
import type { FieldDef } from "@/lib/entityConfig";
import { useCreate, useUpdate } from "@/lib/queries";
import { ApiError } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { EntityForm, type DynamicOption } from "./EntityForm";

export function EntityModalForm({
  open,
  onClose,
  entityKey,
  title,
  fields,
  initial,
  extra,
  dynamicOptions,
}: {
  open: boolean;
  onClose: () => void;
  entityKey: EntityKey;
  title: string;
  fields: FieldDef[];
  /** Existing record (with id) => edit mode; undefined => create. */
  initial?: Record<string, unknown> & { id?: string };
  /** Fixed fields merged into the payload (e.g. value_stream_id). */
  extra?: Record<string, unknown>;
  dynamicOptions?: Record<string, DynamicOption[]>;
}) {
  const create = useCreate(entityKey);
  const update = useUpdate(entityKey);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(initial?.id);

  const handleSubmit = (values: Record<string, unknown>) => {
    setError(null);
    const payload = { ...extra, ...values };
    const opts = {
      onSuccess: () => onClose(),
      onError: (e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Save failed — check required fields."),
    };
    if (isEdit && initial?.id) update.mutate({ id: initial.id, data: payload }, opts);
    else create.mutate(payload, opts);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          {error && <span className="mr-auto text-xs text-status-critical">{error}</span>}
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" form="entity-form" disabled={create.isPending || update.isPending}>
            {isEdit ? "Save changes" : "Create"}
          </Button>
        </>
      }
    >
      <EntityForm
        formId="entity-form"
        fields={fields}
        initial={initial}
        dynamicOptions={dynamicOptions}
        onSubmit={handleSubmit}
      />
    </Modal>
  );
}
