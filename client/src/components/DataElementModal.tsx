import { useState } from "react";
import type { LinkedDataElement } from "@shared/gaps";
import { ApiError } from "@/lib/api";
import { useCreate, useUpdate } from "@/lib/queries";
import { dataElementFields, stepDataElementFields } from "@/lib/entityConfig";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { EntityForm, type DynamicOption } from "@/components/EntityForm";
import type { FieldDef } from "@/lib/entityConfig";

const DEF_FIELD_NAMES = new Set(dataElementFields.map((f) => f.name));

/**
 * Combined modal for creating or editing a data element + its step binding.
 *
 * Create mode: fires POST data_elements → POST step_data_elements.
 * Edit mode: fires PATCH data_elements/:data_element_id + PATCH step_data_elements/:id.
 *
 * The `stepId` prop fixes the step (StepsView context). When omitted a step
 * picker is shown (DataView context) and `stepOptions` must be supplied.
 */
export function DataElementModal({
  open,
  onClose,
  vsId,
  stepId,
  stepOptions,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  vsId: string;
  stepId?: string;
  stepOptions?: DynamicOption[];
  initial?: LinkedDataElement;
}) {
  const createDE = useCreate("data_elements");
  const createSDE = useCreate("step_data_elements");
  const updateDE = useUpdate("data_elements");
  const updateSDE = useUpdate("step_data_elements");
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  // Build a single flat field list: step picker (DataView only) + def fields + usage fields.
  const stepPickerField: FieldDef | null =
    !stepId && !initial
      ? { name: "step_id", label: "Process step", type: "select", optionsKey: "steps", required: true, full: true }
      : null;

  const allFields: FieldDef[] = [
    ...(stepPickerField ? [stepPickerField] : []),
    ...dataElementFields,
    ...stepDataElementFields,
  ];

  const combinedInitial: Record<string, unknown> | undefined = initial
    ? {
        name: initial.name,
        business_description: initial.business_description,
        source_system: initial.source_system,
        table_or_view: initial.table_or_view,
        field_name: initial.field_name,
        data_type: initial.data_type,
        length: initial.length,
        example_value: initial.example_value,
        binding_point: initial.binding_point,
        presence: initial.presence,
        is_key: initial.is_key,
        quality_notes: initial.quality_notes,
      }
    : undefined;

  const isPending =
    createDE.isPending || createSDE.isPending || updateDE.isPending || updateSDE.isPending;

  const onErr = (err: unknown) =>
    setError(err instanceof ApiError ? err.message : "Save failed — check required fields.");

  const handleSubmit = (values: Record<string, unknown>) => {
    setError(null);

    const defValues: Record<string, unknown> = {};
    const usageValues: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (DEF_FIELD_NAMES.has(k)) defValues[k] = v;
      else usageValues[k] = v;
    }

    if (isEdit && initial) {
      updateDE.mutate(
        { id: initial.data_element_id, data: defValues },
        {
          onError: onErr,
          onSuccess: () => {
            updateSDE.mutate(
              { id: initial.id, data: usageValues },
              { onSuccess: onClose, onError: onErr },
            );
          },
        },
      );
    } else {
      const sid = stepId ?? (usageValues.step_id as string);
      const { step_id: _omit, ...usageWithoutStepId } = usageValues as Record<string, unknown> & { step_id?: unknown };
      createDE.mutate(
        { ...defValues, value_stream_id: vsId },
        {
          onError: onErr,
          onSuccess: (created) => {
            const rec = created as { id: string };
            createSDE.mutate(
              { ...usageWithoutStepId, step_id: sid, data_element_id: rec.id },
              { onSuccess: onClose, onError: onErr },
            );
          },
        },
      );
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Data Element" : "Bind Data Element"}
      footer={
        <>
          {error && <span className="mr-auto text-xs text-status-critical">{error}</span>}
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" form="de-form" disabled={isPending}>
            {isEdit ? "Save changes" : "Create"}
          </Button>
        </>
      }
    >
      <EntityForm
        formId="de-form"
        fields={allFields}
        initial={combinedInitial}
        dynamicOptions={stepOptions ? { steps: stepOptions } : undefined}
        onSubmit={handleSubmit}
      />
    </Modal>
  );
}
