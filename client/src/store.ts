import { create } from "zustand";

export type ViewKey =
  | "overview"
  | "canvas"
  | "steps"
  | "personas"
  | "data"
  | "gaps"
  | "constraints"
  | "candidates"
  | "metrics"
  | "assumptions"
  | "trash"
  | "io";

export type LayoutMode = "spine" | "full" | "constraint_focus";

export interface Selection {
  key:
    | "engagements"
    | "value_streams"
    | "process_steps"
    | "personas"
    | "data_elements"
    | "constraints"
    | "metrics"
    | "assumptions";
  id: string;
}

interface UiState {
  engagementId: string | null;
  valueStreamId: string | null;
  view: ViewKey;
  selection: Selection | null;
  commandOpen: boolean;

  // Canvas transient state
  layoutMode: LayoutMode;
  layers: { personas: boolean; data: boolean; constraints: boolean };

  // Drill-down path into sub-steps (empty = value-stream top level). The last
  // entry is the step whose sub-steps are currently shown.
  stepPath: { id: string; name: string }[];

  setEngagement: (id: string | null) => void;
  setValueStream: (id: string | null) => void;
  setView: (v: ViewKey) => void;
  select: (sel: Selection | null) => void;
  setCommandOpen: (open: boolean) => void;
  setLayoutMode: (m: LayoutMode) => void;
  toggleLayer: (l: keyof UiState["layers"]) => void;
  setStepPath: (path: { id: string; name: string }[]) => void;
  clearStepPath: () => void;
}

export const useUi = create<UiState>((set) => ({
  engagementId: null,
  valueStreamId: null,
  view: "overview",
  selection: null,
  commandOpen: false,
  layoutMode: "full",
  layers: { personas: true, data: true, constraints: true },
  stepPath: [],

  setEngagement: (id) =>
    set({ engagementId: id, valueStreamId: null, selection: null, stepPath: [] }),
  setValueStream: (id) => set({ valueStreamId: id, selection: null, stepPath: [] }),
  setView: (view) => set({ view }),
  select: (selection) => set({ selection }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setLayoutMode: (layoutMode) => set({ layoutMode }),
  toggleLayer: (l) =>
    set((s) => ({ layers: { ...s.layers, [l]: !s.layers[l] } })),
  setStepPath: (stepPath) => set({ stepPath }),
  clearStepPath: () => set({ stepPath: [] }),
}));
