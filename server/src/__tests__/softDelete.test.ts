import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { freshDb } from "./setup";
import { repos } from "../repositories";

let cleanup: () => void;
beforeEach(() => {
  cleanup = freshDb();
});
afterEach(() => cleanup());

function makeEngagement() {
  return repos.engagements.create({ name: "Acme", client_org: null, notes: null });
}

describe("soft-delete query layer", () => {
  it("excludes soft-deleted rows from default list and get", () => {
    const e = makeEngagement();
    expect(repos.engagements.list()).toHaveLength(1);

    expect(repos.engagements.softDelete(e.id)).toBe(true);
    expect(repos.engagements.list()).toHaveLength(0);
    expect(repos.engagements.get(e.id)).toBeNull();
    // Still reachable when explicitly including deleted.
    expect(repos.engagements.get(e.id, { includeDeleted: true })?.id).toBe(e.id);
  });

  it("surfaces soft-deleted rows only in the trash view", () => {
    const e = makeEngagement();
    repos.engagements.softDelete(e.id);
    const trashed = repos.engagements.list({ trashed: true });
    expect(trashed).toHaveLength(1);
    expect(trashed[0].id).toBe(e.id);
  });

  it("restores a soft-deleted row", () => {
    const e = makeEngagement();
    repos.engagements.softDelete(e.id);
    expect(repos.engagements.restore(e.id)).toBe(true);
    expect(repos.engagements.list()).toHaveLength(1);
    expect(repos.engagements.list({ trashed: true })).toHaveLength(0);
  });

  it("does not double-delete or restore live rows", () => {
    const e = makeEngagement();
    expect(repos.engagements.restore(e.id)).toBe(false); // already live
    repos.engagements.softDelete(e.id);
    expect(repos.engagements.softDelete(e.id)).toBe(false); // already deleted
  });

  it("update ignores soft-deleted rows", () => {
    const e = makeEngagement();
    repos.engagements.softDelete(e.id);
    const updated = repos.engagements.update(e.id, { name: "Renamed" });
    // get() returns null because the row is deleted; the live update was a no-op
    expect(updated).toBeNull();
    expect(repos.engagements.get(e.id, { includeDeleted: true })?.name).toBe("Acme");
  });

  it("round-trips boolean columns through 0/1 storage", () => {
    const e = makeEngagement();
    const vs = repos.value_streams.create({
      engagement_id: e.id,
      name: "VS",
      problem_statement: null,
      scope_level: "local",
      narrative: null,
    });
    const m = repos.metrics.create({
      value_stream_id: vs.id,
      name: "Throughput",
      unit: "u/hr",
      metric_type: "throughput",
      baseline_value: 10,
      current_value: 12,
      target_value: 20,
      is_leading: true,
      source: null,
    });
    expect(m.is_leading).toBe(true);
    const reread = repos.metrics.get(m.id);
    expect(reread?.is_leading).toBe(true);
  });
});
