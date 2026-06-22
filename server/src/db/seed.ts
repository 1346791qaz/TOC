import { pathToFileURL } from "node:url";
import { runMigrations } from "./migrate";
import { getDb } from "./connection";
import { repos } from "../repositories";
import { seedAcme } from "./seedAcme";
import { seedBoeing737 } from "./seedBoeing737";

// Deterministic ids keep the seed idempotent and make cross-references stable.
const ID = {
  engagement: "00000000-0000-4000-8000-000000000001",
  vs: "00000000-0000-4000-8000-000000000010",
  steps: {
    intake: "00000000-0000-4000-8000-000000000100",
    material: "00000000-0000-4000-8000-000000000101",
    cnc: "00000000-0000-4000-8000-000000000102",
    inspect: "00000000-0000-4000-8000-000000000103",
    finish: "00000000-0000-4000-8000-000000000104",
    ship: "00000000-0000-4000-8000-000000000105",
  },
  personas: {
    planner: "00000000-0000-4000-8000-000000000200",
    machinist: "00000000-0000-4000-8000-000000000201",
    qa: "00000000-0000-4000-8000-000000000202",
    shipping: "00000000-0000-4000-8000-000000000203",
  },
} as const;

export function seed(): { seeded: boolean; subStepsAdded: number } {
  runMigrations();

  // If the primary engagement already exists, still ensure the ACME sample is
  // present (it has its own idempotency guard) and return.
  if (repos.engagements.get(ID.engagement, { includeDeleted: true })) {
    const acme    = seedAcme();
    const boeing  = seedBoeing737();
    return { seeded: acme.seeded, subStepsAdded: acme.subStepsAdded + boeing.subStepsAdded };
  }

  repos.engagements.create(
    {
      name: "Precision Components Co.",
      client_org: "Aerospace machined-parts division",
      notes: "Initial engagement focused on the made-to-order machining line.",
    },
    ID.engagement,
  );

  repos.value_streams.create(
    {
      engagement_id: ID.engagement,
      name: "Made-to-Order Machined Parts",
      problem_statement:
        "On-time delivery has fallen to 72%. Parts sit between machining and inspection, and expedites are routine.",
      scope_level: "stream",
      narrative:
        "Order-to-ship flow for custom CNC parts. Suspected constraint around inspection capacity, but data is thin.",
    },
    ID.vs,
  );

  // ---- assumptions ------------------------------------------------------
  repos.assumptions.create({
    value_stream_id: ID.vs,
    statement: "Inspection is the bottleneck because parts queue there longest.",
    status: "unvalidated",
    evidence: "Anecdotal from floor supervisor.",
  });
  repos.assumptions.create({
    value_stream_id: ID.vs,
    statement: "CNC machines run near full utilization.",
    status: "supported",
    evidence: "MES utilization report shows 88% spindle time.",
  });

  // ---- metrics ----------------------------------------------------------
  repos.metrics.create({
    value_stream_id: ID.vs,
    name: "On-time delivery",
    unit: "%",
    metric_type: "quality",
    baseline_value: 72,
    current_value: 72,
    target_value: 95,
    is_leading: false,
    source: "ERP shipment records",
  });
  repos.metrics.create({
    value_stream_id: ID.vs,
    name: "Lead time",
    unit: "days",
    metric_type: "lead_time",
    baseline_value: 18,
    current_value: 18,
    target_value: 10,
    is_leading: false,
    source: "Order-to-ship timestamps",
  });
  repos.metrics.create({
    value_stream_id: ID.vs,
    name: "WIP at inspection",
    unit: "jobs",
    metric_type: "inventory_wip",
    baseline_value: 14,
    current_value: 22,
    target_value: 5,
    is_leading: true,
    source: "Daily floor count",
  });

  // ---- personas ---------------------------------------------------------
  repos.personas.create(
    {
      value_stream_id: ID.vs,
      name: "Production Planner",
      role_title: "Planner / Scheduler",
      function: "Planning",
      scope_level: "stream",
      responsibilities: "Sequences jobs, releases work orders.",
      authority_notes: "Can reprioritize the queue; cannot add capacity.",
    },
    ID.personas.planner,
  );
  repos.personas.create(
    {
      value_stream_id: ID.vs,
      name: "CNC Machinist",
      role_title: "Machine Operator",
      function: "Machining",
      scope_level: "local",
      responsibilities: "Sets up and runs CNC jobs.",
      authority_notes: "Owns setup; no scheduling authority.",
    },
    ID.personas.machinist,
  );
  repos.personas.create(
    {
      value_stream_id: ID.vs,
      name: "QA Inspector",
      role_title: "Quality Inspector",
      function: "Quality",
      scope_level: "stream",
      responsibilities: "First-article and final inspection, CMM programming.",
      authority_notes: "Sole authority to release/scrap parts. Single qualified inspector on shift.",
    },
    ID.personas.qa,
  );
  repos.personas.create(
    {
      value_stream_id: ID.vs,
      name: "Shipping Clerk",
      role_title: "Logistics",
      function: "Shipping",
      scope_level: "local",
      responsibilities: "Packs and ships released parts.",
      authority_notes: "None beyond shipping.",
    },
    ID.personas.shipping,
  );

  // ---- process steps ----------------------------------------------------
  const steps: [keyof typeof ID.steps, Record<string, unknown>][] = [
    ["intake", {
      name: "Order Intake", sequence_index: 0,
      entry_criteria: "Customer PO received", action: "Validate spec, create work order", exit_criteria: "Released work order",
      cycle_time: 0.5, wait_time: 0.5, pct_complete_accurate: 85,
    }],
    ["material", {
      name: "Material Prep", sequence_index: 1,
      entry_criteria: "Released work order", action: "Pull/cut raw stock", exit_criteria: "Staged material at machine",
      cycle_time: 1, wait_time: 1, pct_complete_accurate: 70,
    }],
    ["cnc", {
      name: "CNC Machining", sequence_index: 2,
      entry_criteria: "Material staged + program loaded", action: "Setup and run CNC operations", exit_criteria: "Machined part, deburred",
      cycle_time: 3, wait_time: 1, pct_complete_accurate: 90,
    }],
    ["inspect", {
      name: "Inspection", sequence_index: 3,
      entry_criteria: "Machined part with traveler", action: "CMM + manual inspection vs drawing", exit_criteria: "Pass/fail dispositioned",
      cycle_time: 1, wait_time: 6, pct_complete_accurate: 60,
      pain_points: "Single CMM-qualified inspector creates a hard bottleneck; parts queue here far longer than they take to inspect. No standardized inspection plan and dispositions are verbal, so rework loops are common.",
      data_source_systems: "CMM software, paper traveler, QMS", data_databases: "CMM local store, QMS", data_tables: "qms.inspection_results", data_etl_jobs: "None — CMM results stored locally, not linked to job",
    }],
    ["finish", {
      name: "Finishing", sequence_index: 4,
      entry_criteria: "Inspection pass", action: "Anodize / coat / mark", exit_criteria: "Finished part",
      cycle_time: 2, wait_time: 1, pct_complete_accurate: 80,
    }],
    ["ship", {
      name: "Pack & Ship", sequence_index: 5,
      entry_criteria: "Finished, released part", action: "Pack, generate docs, ship", exit_criteria: "Shipped + tracking recorded",
      cycle_time: 0.5, wait_time: 0.5, pct_complete_accurate: 95,
    }],
  ];
  for (const [key, data] of steps) {
    repos.process_steps.create({ value_stream_id: ID.vs, ...data }, ID.steps[key]);
  }

  // ---- step <-> persona (RACI) -----------------------------------------
  const sp: [string, string, string][] = [
    [ID.steps.intake, ID.personas.planner, "executor"],
    [ID.steps.material, ID.personas.planner, "approver"],
    [ID.steps.material, ID.personas.machinist, "executor"],
    [ID.steps.cnc, ID.personas.machinist, "executor"],
    [ID.steps.inspect, ID.personas.qa, "executor"],
    [ID.steps.finish, ID.personas.machinist, "consulted"],
    [ID.steps.ship, ID.personas.shipping, "executor"],
  ];
  for (const [step_id, persona_id, role_on_step] of sp) {
    repos.step_personas.create({ step_id, persona_id, role_on_step });
  }

  // ---- data elements (with deliberate gaps) -----------------------------
  // Each entry defines the field (data_elements) and its step binding (step_data_elements).
  type DEDef = { step_id: string; name: string; binding_point: string; data_type?: string; source_system?: string; presence: string; quality_notes?: string; is_key: boolean };
  const de: DEDef[] = [
    { step_id: ID.steps.intake, name: "Customer drawing rev", binding_point: "entry", data_type: "PDF", source_system: "PLM", presence: "present", is_key: true },
    { step_id: ID.steps.intake, name: "Promised ship date", binding_point: "exit", data_type: "date", source_system: "ERP", presence: "partial", quality_notes: "Often a placeholder, refined later", is_key: true },
    { step_id: ID.steps.material, name: "Material certs", binding_point: "entry", data_type: "doc", source_system: "Supplier portal", presence: "missing", quality_notes: "Certs arrive late, block traceability", is_key: true },
    { step_id: ID.steps.cnc, name: "CNC program", binding_point: "entry", data_type: "G-code", source_system: "CAM", presence: "present", is_key: true },
    { step_id: ID.steps.cnc, name: "Actual cycle time", binding_point: "exit", data_type: "number", source_system: "MES", presence: "partial", quality_notes: "Logged inconsistently per operator", is_key: false },
    { step_id: ID.steps.inspect, name: "Inspection plan", binding_point: "entry", data_type: "doc", source_system: "Paper traveler", presence: "missing", quality_notes: "No standardized plan; inspector improvises", is_key: true },
    { step_id: ID.steps.inspect, name: "CMM results", binding_point: "action", data_type: "report", source_system: "CMM", presence: "partial", quality_notes: "Stored locally, not linked to job", is_key: true },
    { step_id: ID.steps.inspect, name: "Disposition record", binding_point: "exit", data_type: "status", source_system: "None", presence: "missing", quality_notes: "Verbal pass/fail; not captured", is_key: true },
    { step_id: ID.steps.finish, name: "Coating spec", binding_point: "entry", data_type: "doc", source_system: "PLM", presence: "present", is_key: false },
    { step_id: ID.steps.ship, name: "Shipping docs", binding_point: "exit", data_type: "doc", source_system: "ERP", presence: "present", is_key: false },
  ];
  for (const d of de) {
    const def = repos.data_elements.create({
      value_stream_id: ID.vs,
      name: d.name,
      data_type: d.data_type ?? null,
      source_system: d.source_system ?? null,
      business_description: null,
      length: null,
      table_or_view: null,
      field_name: null,
      example_value: null,
    });
    repos.step_data_elements.create({
      step_id: d.step_id,
      data_element_id: def.id,
      binding_point: d.binding_point,
      presence: d.presence,
      quality_notes: d.quality_notes ?? null,
      is_key: d.is_key,
    });
  }

  // ---- constraints ------------------------------------------------------
  repos.constraints.create({
    value_stream_id: ID.vs,
    title: "Single qualified inspector",
    description: "Only one inspector is CMM-qualified; all parts funnel through one person.",
    kind: "constraint",
    target_type: "step",
    target_id: ID.steps.inspect,
    severity: "critical",
    likelihood: null,
    toc_status: "identified",
    is_system_constraint: false,
  });
  repos.constraints.create({
    value_stream_id: ID.vs,
    title: "No captured disposition record",
    description: "Pass/fail decisions are verbal, creating rework and audit risk.",
    kind: "breakdown",
    target_type: "step",
    target_id: ID.steps.inspect,
    severity: "high",
    likelihood: null,
    toc_status: "none",
    is_system_constraint: false,
  });
  repos.constraints.create({
    value_stream_id: ID.vs,
    title: "Late material certs",
    description: "Traceability docs lag, occasionally holding shipment.",
    kind: "risk",
    target_type: "step",
    target_id: ID.steps.material,
    severity: "medium",
    likelihood: "high",
    toc_status: "none",
    is_system_constraint: false,
  });
  repos.constraints.create({
    value_stream_id: ID.vs,
    title: "Machining → Inspection handoff seam",
    description: "Parts pile up untracked between machining and inspection.",
    kind: "seam",
    target_type: "step",
    target_id: ID.steps.inspect,
    severity: "high",
    likelihood: null,
    toc_status: "none",
    is_system_constraint: false,
  });

  // ---- sequence flow edges ---------------------------------------------
  const order = [ID.steps.intake, ID.steps.material, ID.steps.cnc, ID.steps.inspect, ID.steps.finish, ID.steps.ship];
  for (let i = 0; i < order.length - 1; i++) {
    repos.flow_edges.create({
      value_stream_id: ID.vs,
      from_type: "step",
      from_id: order[i],
      to_type: "step",
      to_id: order[i + 1],
      edge_type: "sequence",
      notes: null,
    });
  }
  // A convergent dependency: finishing also waits on a planning sign-off (handoff).
  repos.flow_edges.create({
    value_stream_id: ID.vs,
    from_type: "persona", from_id: ID.personas.qa,
    to_type: "step", to_id: ID.steps.inspect,
    edge_type: "handoff", notes: "Inspector availability gates this step.",
  });
  repos.flow_edges.create({
    value_stream_id: ID.vs,
    from_type: "step", from_id: ID.steps.material,
    to_type: "step", to_id: ID.steps.inspect,
    edge_type: "dependency", notes: "Missing certs can block inspection sign-off.",
  });

  getDb(); // ensure connection materialized

  // Seed the ACME sample engagement after the primary so the primary remains
  // the default-selected engagement on first load.
  const acme = seedAcme();
  const boeing = seedBoeing737();

  return { seeded: true, subStepsAdded: acme.subStepsAdded + boeing.subStepsAdded };
}

// Cross-platform "run directly?" check (Windows paths break a string compare).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = seed();
  const base = result.seeded ? "seed data inserted" : "base seed already present";
  const subs =
    result.subStepsAdded > 0
      ? `; added ${result.subStepsAdded} ACME sub-steps`
      : result.seeded
        ? ""
        : " (no changes)";
  console.log(`[seed] ${base}${subs}`);
}
