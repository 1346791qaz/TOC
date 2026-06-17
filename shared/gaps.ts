import type { DataElement, ProcessStep } from "./schemas";

// The Data Gap Report — surfaces where the Operational Intelligence Layer is
// blind. A row qualifies as a "gap" if its data is missing/partial, or if it is
// a key data component (key data is always worth tracking explicitly).

export interface DataGapStep {
  step_id: string;
  step_name: string;
  sequence_index: number;
  gaps: DataElement[];
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
  dataElements: DataElement[],
): DataGapReport {
  const isGap = (d: DataElement): boolean =>
    d.presence === "missing" || d.presence === "partial" || d.is_key;

  const gapElements = dataElements.filter(isGap);

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
