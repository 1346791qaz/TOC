import type { Presence, Severity, TocStatus } from "@shared/enums";

type Tone = "neutral" | "gap" | "critical" | "healthy" | "info" | "accent";

export const presenceTone: Record<Presence, Tone> = {
  present: "healthy",
  partial: "gap",
  missing: "critical",
};

export const severityTone: Record<Severity, Tone> = {
  low: "neutral",
  medium: "info",
  high: "gap",
  critical: "critical",
};

export const severityRank: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const tocLabels: Record<TocStatus, string> = {
  none: "Not a candidate",
  identified: "1 · Identified",
  exploit: "2 · Exploit",
  subordinate: "3 · Subordinate",
  elevate: "4 · Elevate",
  broken: "5 · Broken (repeat)",
};

// HSL CSS values shared with the canvas node renderers.
export const nodeColors = {
  step: "hsl(210 70% 55%)",
  persona: "hsl(270 55% 62%)",
  data: "hsl(190 70% 50%)",
  constraint: "hsl(0 75% 58%)",
};

export const statusColors = {
  gap: "hsl(38 92% 55%)",
  critical: "hsl(0 80% 58%)",
  healthy: "hsl(160 60% 45%)",
};

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
