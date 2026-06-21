import { afterEach, describe, expect, it } from "vitest";
import { freshDb } from "./setup";
import { seed } from "../db/seed";
import { exportEngagement, importEngagement } from "../io/portable";
import { ENTITY_KEYS } from "@shared/schemas";

const SEED_ENGAGEMENT = "00000000-0000-4000-8000-000000000001";

let cleanup: () => void;
afterEach(() => cleanup());

describe("engagement export / import round-trip", () => {
  it("exports a populated bundle from the seed", () => {
    cleanup = freshDb();
    seed();
    const bundle = exportEngagement(SEED_ENGAGEMENT);
    expect(bundle.format).toBe("oil-engagement");
    expect(bundle.data.engagements).toHaveLength(1);
    expect(bundle.data.process_steps).toHaveLength(6);
    expect(bundle.data.data_elements.length).toBeGreaterThan(0);
    expect(bundle.data.step_data_elements.length).toBeGreaterThan(0);
    expect(bundle.data.constraints.length).toBeGreaterThan(0);
  });

  it("round-trips losslessly into a clean DB (ids preserved)", () => {
    // Build + export in DB #1.
    cleanup = freshDb();
    seed();
    const bundle = exportEngagement(SEED_ENGAGEMENT);
    const original = JSON.parse(JSON.stringify(bundle.data));
    cleanup();

    // Import into a fresh DB #2.
    cleanup = freshDb();
    const result = importEngagement(bundle);
    expect(result.remapped).toBe(false);
    expect(result.engagement_id).toBe(SEED_ENGAGEMENT);

    // Re-export and compare row-for-row per entity.
    const reExported = exportEngagement(SEED_ENGAGEMENT).data;
    for (const key of ENTITY_KEYS) {
      expect(reExported[key].length).toBe(original[key].length);
      const sortById = (a: Record<string, unknown>, b: Record<string, unknown>) =>
        String(a.id).localeCompare(String(b.id));
      expect([...reExported[key]].sort(sortById)).toEqual([...original[key]].sort(sortById));
    }
  });

  it("remaps ids when importing into a DB that already holds the engagement", () => {
    cleanup = freshDb();
    seed();
    const bundle = exportEngagement(SEED_ENGAGEMENT);

    // Importing the same bundle again should remap to avoid id collisions.
    const result = importEngagement(bundle);
    expect(result.remapped).toBe(true);
    expect(result.engagement_id).not.toBe(SEED_ENGAGEMENT);

    // Two engagements now exist; referential integrity preserved for the copy.
    const copies = exportEngagement(result.engagement_id);
    expect(copies.data.process_steps).toHaveLength(6);
    // Every step in the copy points at the copied value stream.
    const copiedVsId = copies.data.value_streams[0].id;
    for (const s of copies.data.process_steps) {
      expect(s.value_stream_id).toBe(copiedVsId);
    }
  });
});
