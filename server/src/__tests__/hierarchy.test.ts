import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { freshDb } from "./setup";
import { repos } from "../repositories";
import { exportEngagement, importEngagement } from "../io/portable";
import { seed } from "../db/seed";

let cleanup: () => void;
beforeEach(() => {
  cleanup = freshDb();
});
afterEach(() => cleanup());

function scaffold() {
  const e = repos.engagements.create({ name: "E", client_org: null, notes: null });
  const vs = repos.value_streams.create({
    engagement_id: e.id,
    name: "VS",
    problem_statement: null,
    scope_level: "stream",
    narrative: null,
  });
  return { e, vs };
}

describe("process step hierarchy", () => {
  it("defaults parent_step_id to null (top level)", () => {
    const { vs } = scaffold();
    const step = repos.process_steps.create({ value_stream_id: vs.id, name: "Top" });
    expect(step.parent_step_id).toBeNull();
  });

  it("nests sub-steps and fetches them by parent_step_id", () => {
    const { vs } = scaffold();
    const parent = repos.process_steps.create({ value_stream_id: vs.id, name: "Final Assembly" });
    repos.process_steps.create({ value_stream_id: vs.id, parent_step_id: parent.id, name: "Torque" });
    repos.process_steps.create({ value_stream_id: vs.id, parent_step_id: parent.id, name: "Sign-off" });

    const children = repos.process_steps.list({ where: { parent_step_id: parent.id } });
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.name).sort()).toEqual(["Sign-off", "Torque"]);

    // Top-level query excludes the sub-steps.
    const top = repos.process_steps.list({ where: { value_stream_id: vs.id, parent_step_id: null } });
    expect(top).toHaveLength(1);
    expect(top[0].name).toBe("Final Assembly");
  });

  it("seeds ACME with notional sub-steps across multiple parents (incl. 3rd gen)", () => {
    seed();
    const all = repos.process_steps.list();
    const subs = all.filter((s) => s.parent_step_id);
    // 20 second-generation + 9 third-generation sub-steps.
    expect(subs.length).toBe(29);
    const parents = new Set(subs.map((s) => s.parent_step_id));
    expect(parents.size).toBe(8);

    // A 3-generation chain exists: a sub-step whose parent is itself a sub-step.
    const byId = new Map(all.map((s) => [s.id, s]));
    const thirdGen = subs.filter((s) => {
      const parent = s.parent_step_id ? byId.get(s.parent_step_id) : undefined;
      return parent?.parent_step_id != null;
    });
    expect(thirdGen.length).toBe(9);
  });

  it("sub-step seeding is idempotent (re-seed adds nothing)", () => {
    seed();
    const before = repos.process_steps.list().filter((s) => s.parent_step_id).length;
    seed();
    const after = repos.process_steps.list().filter((s) => s.parent_step_id).length;
    expect(after).toBe(before);
  });

  it("round-trips the hierarchy through export/import", () => {
    const { e, vs } = scaffold();
    const parent = repos.process_steps.create({ value_stream_id: vs.id, name: "Parent" });
    repos.process_steps.create({ value_stream_id: vs.id, parent_step_id: parent.id, name: "Child" });

    const bundle = exportEngagement(e.id);
    cleanup();
    cleanup = freshDb();
    importEngagement(bundle);

    const steps = repos.process_steps.list({ where: { value_stream_id: vs.id } });
    const child = steps.find((s) => s.name === "Child");
    expect(child?.parent_step_id).toBe(parent.id);
  });
});
