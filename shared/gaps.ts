import type { BindingPoint, Presence } from "./enums";
import type { DataElement, ProcessStep, StepDataElement } from "./schemas";

// ---------------------------------------------------------------------------
// LinkedDataElement: the joined view of a step_data_elements row merged with
// its parent data_elements row. This is the shape used throughout the UI,
// canvas, and analytics — it has a step_id so existing code needs minimal
// changes.
// ---------------------------------------------------------------------------
export interface LinkedDataElement {
  // From step_data_elements (the junction):
  id: string;
  step_id: string;
  data_element_id: string;
  binding_point: BindingPoint;
  presence: Presence;
  quality_notes: string | null;
  is_key: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // From data_elements (the definition):
  value_stream_id: string;
  name: string;
  business_description: string | null;
  data_type: string | null;
  length: string | null;
  source_system: string | null;
  table_or_view: string | null;
  field_name: string | null;
  example_value: string | null;
}

/** Join data_elements and step_data_elements into LinkedDataElement[]. */
export function linkDataElements(
  dataElements: DataElement[],
  stepDataElements: StepDataElement[],
): LinkedDataElement[] {
  const deMap = new Map(dataElements.map((d) => [d.id, d]));
  const result: LinkedDataElement[] = [];
  for (const sde of stepDataElements) {
    if (sde.deleted_at != null) continue;
    const de = deMap.get(sde.data_element_id);
    if (!de) continue;
    result.push({
      id: sde.id,
      step_id: sde.step_id,
      data_element_id: sde.data_element_id,
      binding_point: sde.binding_point,
      presence: sde.presence,
      quality_notes: sde.quality_notes,
      is_key: sde.is_key,
      created_at: sde.created_at,
      updated_at: sde.updated_at,
      deleted_at: sde.deleted_at,
      value_stream_id: de.value_stream_id,
      name: de.name,
      business_description: de.business_description,
      data_type: de.data_type,
      length: de.length,
      source_system: de.source_system,
      table_or_view: de.table_or_view,
      field_name: de.field_name,
      example_value: de.example_value,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// The Data Gap Report — surfaces where the Value Stream Model is
// blind. A row qualifies as a "gap" if its data is missing/partial, or if it
// is a key data component (key data is always worth tracking explicitly).
// ---------------------------------------------------------------------------

export interface DataGapStep {
  step_id: string;
  step_name: string;
  sequence_index: number;
  gaps: LinkedDataElement[];
}

export interface DataGapReport {
  total_gaps: number;
  missing_count: number;
  partial_count: number;
  key_count: number;
  steps: DataGapStep[];
}

export function buildDataGapReport(
  steps: ProcessStep[],
  linkedElements: LinkedDataElement[],
): DataGapReport {
  const isGap = (d: LinkedDataElement): boolean =>
    d.presence === "missing" || d.presence === "partial" || d.is_key;

  const gapElements = linkedElements.filter(isGap);

  const grouped: DataGapStep[] = steps
    .map((step) => ({
      step_id: step.id,
      step_name: step.name,
      sequence_index: step.sequence_index,
      gaps: gapElements.filter((d) => d.step_id === step.id),
    }))
    .filter((s) => s.gaps.length > 0)
    .sort((a, b) => a.sequence_index - b.sequence_index);

  return {
    total_gaps: gapElements.length,
    missing_count: gapElements.filter((d) => d.presence === "missing").length,
    partial_count: gapElements.filter((d) => d.presence === "partial").length,
    key_count: gapElements.filter((d) => d.is_key).length,
    steps: grouped,
  };
}
