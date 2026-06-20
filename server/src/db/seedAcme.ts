import { pathToFileURL } from "node:url";
import { runMigrations } from "./migrate";
import { repos } from "../repositories";

// ---------------------------------------------------------------------------
// Sample engagement: ACME Inc. — Widget manufacturing, order-to-delivery.
// A fully developed, demo-ready value stream. Idempotent via fixed UUIDs:
// re-running skips if the ACME engagement already exists.
// ---------------------------------------------------------------------------

const E = "00000000-0000-4000-8000-0000000a0001"; // engagement
const V = "00000000-0000-4000-8000-0000000a0010"; // value stream

// Step ids 01..11
const S = (n: number) => `00000000-0000-4000-8000-0000000a01${String(n).padStart(2, "0")}`;
// Persona ids 01..12
const P = (n: number) => `00000000-0000-4000-8000-0000000a02${String(n).padStart(2, "0")}`;

interface StepDef {
  n: number;
  name: string;
  entry: string;
  action: string;
  exit: string;
  cycle: number;
  wait: number;
  pca: number;
  pain: string;
}

const STEPS: StepDef[] = [
  { n: 1, name: "Order Intake & Validation", entry: "Customer PO received via portal / EDI", action: "Validate SKU, pricing, credit and requested date", exit: "Confirmed sales order in ERP", cycle: 0.5, wait: 0.5, pca: 88, pain: "Configured SKUs require manual price lookups; promised dates are guessed before the schedule exists, so commitments are often unrealistic." },
  { n: 2, name: "Demand Planning & Scheduling", entry: "Confirmed orders + rolling forecast", action: "Run MRP, release work orders, sequence the line", exit: "Released production schedule", cycle: 1, wait: 1.5, pca: 70, pain: "The schedule lives on a whiteboard, so priorities are invisible to upstream and downstream teams. Re-sequencing after an expedite is manual and error-prone." },
  { n: 3, name: "Raw Material Procurement", entry: "Released WO with BOM shortages", action: "Issue POs, expedite resin and electronics", exit: "Materials on order / received", cycle: 2, wait: 4, pca: 64, pain: "Single-source resin with volatile lead times. Buyers rely on tribal knowledge of supplier reliability; expedite fees are routine." },
  { n: 4, name: "Incoming Inspection", entry: "Materials received at dock", action: "Sample-inspect resin lots and purchased parts vs spec", exit: "Materials accepted to stock", cycle: 0.5, wait: 2, pca: 58, pain: "No standardized inspection plan — the inspector improvises. Accept/reject is verbal and not recorded, so traceability breaks here." },
  { n: 5, name: "Injection Molding", entry: "Resin staged + mold/tool ready", action: "Mold widget housings and covers", exit: "Molded parts binned to WIP", cycle: 2, wait: 1, pca: 91, pain: "Shot/cycle data is logged inconsistently by shift; scrap is hand-counted at end of shift, so true yield is unknown until later." },
  { n: 6, name: "Component Sub-Assembly", entry: "Molded parts + electronics kits", action: "Assemble PCB into housing sub-units", exit: "Sub-assemblies complete", cycle: 1.5, wait: 1.5, pca: 82, pain: "Work-instruction revisions aren't always current at the station, leading to occasional rework when a rev changes mid-run." },
  { n: 7, name: "Final Assembly", entry: "Sub-assemblies + hardware kit", action: "Final assemble widget, torque, fasten, label internally", exit: "Assembled widget", cycle: 3, wait: 6, pca: 76, pain: "THE CHOKE POINT. Only two builders are cross-trained; the cell idles on any absence. Torque specs live in senior builders' heads, no serialized build record is captured, and WIP stacks up in front of this step. Overtime and expedites concentrate here." },
  { n: 8, name: "Functional Test & QA", entry: "Assembled widget + traveler", action: "Power-on, calibrate, leak / EMC checks", exit: "Pass / fail dispositioned", cycle: 1, wait: 3, pca: 54, pain: "The test program runs from one engineer's laptop — a single point of failure. Parametric results are discarded (only pass/fail kept) and the release decision is verbal." },
  { n: 9, name: "Packaging & Labeling", entry: "Tested, passed widget", action: "Pack, serialize, label, insert manuals", exit: "Sellable packed unit", cycle: 0.5, wait: 1, pca: 86, pain: "Manual insert kitting occasionally mismatches region; serialization is solid but depends on the upstream traveler being complete." },
  { n: 10, name: "Warehouse Staging", entry: "Packed units", action: "Putaway / pick / stage by order", exit: "Staged for carrier", cycle: 0.5, wait: 1, pca: 80, pain: "Units are occasionally mis-slotted, causing pick delays and the odd short-ship that surfaces only at the dock." },
  { n: 11, name: "Shipping & Fulfillment", entry: "Staged orders", action: "Manifest, generate BOL, load and ship", exit: "Shipped + tracking sent to customer", cycle: 0.5, wait: 0.5, pca: 93, pain: "Mostly smooth, but late-day cutoffs mean anything that slips out of Final Assembly after 2pm waits a full day for the next carrier pickup." },
];

interface PersonaDef {
  n: number;
  name: string;
  role: string;
  fn: string;
  scope: "local" | "stream" | "system";
  resp: string;
  auth: string;
}

const PERSONAS: PersonaDef[] = [
  { n: 1, name: "Sales Order Coordinator", role: "Customer Service Rep", fn: "Customer Service", scope: "local", resp: "Enters and validates customer orders.", auth: "Confirms order terms; no scheduling authority." },
  { n: 2, name: "Production Planner", role: "Planner / Scheduler", fn: "Planning", scope: "stream", resp: "Runs MRP, releases and sequences work orders.", auth: "Can reprioritize the line; cannot add capacity." },
  { n: 3, name: "Procurement Buyer", role: "Buyer", fn: "Procurement", scope: "stream", resp: "Places and expedites supplier POs.", auth: "Approves POs up to threshold." },
  { n: 4, name: "Incoming QC Inspector", role: "Quality Inspector", fn: "Quality", scope: "local", resp: "Inspects incoming materials.", auth: "Accepts / rejects incoming lots." },
  { n: 5, name: "Molding Operator", role: "Machine Operator", fn: "Molding", scope: "local", resp: "Sets up and runs molding presses.", auth: "Owns press setup." },
  { n: 6, name: "Sub-Assembly Lead", role: "Assembly Lead", fn: "Assembly", scope: "local", resp: "Leads PCB / housing sub-assembly.", auth: "Schedules sub-assembly staffing." },
  { n: 7, name: "Final Assembly Builder", role: "Assembly Technician", fn: "Assembly", scope: "stream", resp: "Performs final widget assembly.", auth: "None beyond build; only 2 builders cross-trained." },
  { n: 8, name: "Test & QA Engineer", role: "Quality Engineer", fn: "Quality", scope: "stream", resp: "Owns functional test, calibration, dispositions.", auth: "Sole release/scrap authority; sole owner of the test program." },
  { n: 9, name: "Packaging Operator", role: "Operator", fn: "Packaging", scope: "local", resp: "Packs and serializes finished units.", auth: "None." },
  { n: 10, name: "Warehouse Lead", role: "Logistics Lead", fn: "Logistics", scope: "local", resp: "Manages putaway, pick and staging.", auth: "Owns warehouse slotting." },
  { n: 11, name: "Shipping Coordinator", role: "Logistics Coordinator", fn: "Logistics", scope: "local", resp: "Manifests and ships orders.", auth: "Selects carrier." },
  { n: 12, name: "Plant Manager", role: "Operations Manager", fn: "Operations", scope: "system", resp: "Owns plant P&L and flow performance.", auth: "Can authorize capacity / capital." },
];

export function seedAcme(): { seeded: boolean } {
  runMigrations();
  if (repos.engagements.get(E, { includeDeleted: true })) return { seeded: false };

  repos.engagements.create(
    {
      name: "ACME Inc.",
      client_org: "ACME Inc. — Widget Division (Plant 2)",
      notes: "Order-to-delivery flow optimization for the flagship ACME Widget line.",
    },
    E,
  );

  repos.value_streams.create(
    {
      engagement_id: E,
      name: "Widget Production: Order to Delivery",
      problem_statement:
        "Lead time has crept to 24 days and on-time delivery sits at 74%. WIP piles up before Final Assembly while expedites and overtime are routine — yet no one agrees where the true constraint is.",
      scope_level: "system",
      narrative:
        "End-to-end flow for the ACME Widget, from customer PO to shipment. Molding utilization looks high, but inventory accumulates at Final Assembly and Functional Test, where data is thin and skills are concentrated in a few people.",
    },
    V,
  );

  // ---- personas ----------------------------------------------------------
  for (const p of PERSONAS) {
    repos.personas.create(
      {
        value_stream_id: V,
        name: p.name,
        role_title: p.role,
        function: p.fn,
        scope_level: p.scope,
        responsibilities: p.resp,
        authority_notes: p.auth,
      },
      P(p.n),
    );
  }

  // ---- process steps -----------------------------------------------------
  for (const s of STEPS) {
    repos.process_steps.create(
      {
        value_stream_id: V,
        name: s.name,
        sequence_index: s.n - 1,
        entry_criteria: s.entry,
        action: s.action,
        exit_criteria: s.exit,
        pain_points: s.pain,
        cycle_time: s.cycle,
        wait_time: s.wait,
        pct_complete_accurate: s.pca,
      },
      S(s.n),
    );
  }

  // ---- step <-> persona (RACI) ------------------------------------------
  const raci: [number, number, "executor" | "approver" | "consulted" | "informed"][] = [
    [1, 1, "executor"], [1, 2, "informed"],
    [2, 2, "executor"], [2, 12, "approver"],
    [3, 3, "executor"], [3, 2, "consulted"],
    [4, 4, "executor"],
    [5, 5, "executor"],
    [6, 6, "executor"],
    [7, 7, "executor"], [7, 2, "consulted"], [7, 12, "informed"],
    [8, 8, "executor"],
    [9, 9, "executor"],
    [10, 10, "executor"],
    [11, 11, "executor"], [11, 1, "informed"],
  ];
  for (const [step, persona, role] of raci) {
    repos.step_personas.create({ step_id: S(step), persona_id: P(persona), role_on_step: role });
  }

  // ---- data elements (gaps concentrated at Final Assembly & Test) --------
  type DE = {
    step: number;
    name: string;
    bind: "entry" | "action" | "exit";
    presence: "present" | "partial" | "missing";
    type?: string;
    src?: string;
    key?: boolean;
    notes?: string;
  };
  const data: DE[] = [
    { step: 1, name: "Customer PO", bind: "entry", presence: "present", type: "EDI doc", src: "EDI / Portal", key: true },
    { step: 1, name: "Credit check", bind: "action", presence: "partial", type: "status", src: "ERP", notes: "Sometimes overridden verbally" },
    { step: 1, name: "Promised ship date", bind: "exit", presence: "partial", type: "date", src: "ERP", key: true, notes: "Often a placeholder, refined later" },
    { step: 2, name: "Demand forecast", bind: "entry", presence: "partial", type: "number", src: "Excel", key: true, notes: "Maintained in a spreadsheet, weekly" },
    { step: 2, name: "MRP output", bind: "action", presence: "present", type: "report", src: "ERP" },
    { step: 2, name: "Production schedule", bind: "exit", presence: "missing", type: "plan", src: "Whiteboard", key: true, notes: "Lives on the floor whiteboard; not in any system" },
    { step: 3, name: "Supplier lead times", bind: "entry", presence: "partial", type: "table", src: "Email", notes: "Tribal; varies by buyer" },
    { step: 3, name: "Purchase orders", bind: "action", presence: "present", type: "PO", src: "ERP" },
    { step: 3, name: "Material certs", bind: "exit", presence: "missing", type: "doc", src: "Supplier portal", key: true, notes: "Arrive late; block traceability" },
    { step: 4, name: "Inspection plan", bind: "entry", presence: "missing", type: "doc", src: "Paper", key: true, notes: "No standard plan; inspector improvises" },
    { step: 4, name: "Sample results", bind: "action", presence: "partial", type: "report", src: "QMS", notes: "Stored locally, not linked to lot" },
    { step: 4, name: "Disposition record", bind: "exit", presence: "missing", type: "status", src: "None", key: true, notes: "Accept/reject is verbal" },
    { step: 5, name: "Mold setup sheet", bind: "entry", presence: "present", type: "doc", src: "MES" },
    { step: 5, name: "Shot / cycle data", bind: "action", presence: "partial", type: "number", src: "MES", notes: "Logged inconsistently per shift" },
    { step: 5, name: "Scrap count", bind: "exit", presence: "missing", type: "number", src: "Manual tally", notes: "Counted by hand, end of shift" },
    { step: 6, name: "Electronics kit list", bind: "entry", presence: "present", type: "BOM", src: "ERP" },
    { step: 6, name: "Work instructions", bind: "action", presence: "partial", type: "doc", src: "PLM", notes: "Rev not always current at station" },
    { step: 7, name: "Assembly traveler", bind: "entry", presence: "partial", type: "paper", src: "Paper", key: true, notes: "Handwritten; frequently incomplete" },
    { step: 7, name: "Torque spec", bind: "action", presence: "missing", type: "spec", src: "Tribal knowledge", key: true, notes: "Known only to senior builders" },
    { step: 7, name: "As-built record", bind: "exit", presence: "missing", type: "record", src: "None", key: true, notes: "No serialized build record captured" },
    { step: 7, name: "Labor hours", bind: "action", presence: "missing", type: "number", src: "Manual", notes: "Not captured per unit" },
    { step: 8, name: "Test program", bind: "entry", presence: "missing", type: "software", src: "Engineer's PC", key: true, notes: "Single copy on one laptop; undocumented" },
    { step: 8, name: "Test results", bind: "action", presence: "partial", type: "report", src: "QMS", key: true, notes: "Pass/fail captured; parametric data lost" },
    { step: 8, name: "Calibration cert", bind: "entry", presence: "partial", type: "cert", src: "QMS" },
    { step: 8, name: "Final disposition", bind: "exit", presence: "missing", type: "status", src: "None", key: true, notes: "Release decision is verbal" },
    { step: 9, name: "Serial / label data", bind: "action", presence: "present", type: "record", src: "WMS", key: true },
    { step: 9, name: "Pack list", bind: "exit", presence: "present", type: "doc", src: "ERP" },
    { step: 10, name: "Inventory location", bind: "action", presence: "partial", type: "code", src: "WMS", notes: "Occasionally mis-slotted" },
    { step: 11, name: "Bill of lading", bind: "action", presence: "present", type: "doc", src: "Carrier portal" },
    { step: 11, name: "Tracking number", bind: "exit", presence: "present", type: "code", src: "ERP", key: true },
  ];
  for (const d of data) {
    repos.data_elements.create({
      step_id: S(d.step),
      name: d.name,
      binding_point: d.bind,
      data_type: d.type ?? null,
      source_system: d.src ?? null,
      presence: d.presence,
      quality_notes: d.notes ?? null,
      is_key: d.key ?? false,
    });
  }

  // ---- metrics (baseline -> current -> target) ---------------------------
  const metrics: [string, string, string, number, number, number, boolean, string][] = [
    ["On-time delivery", "%", "quality", 78, 74, 95, false, "ERP shipment records"],
    ["Order-to-ship lead time", "days", "lead_time", 21, 24, 12, false, "Order/ship timestamps"],
    ["Throughput", "units/day", "throughput", 320, 300, 450, false, "MES counts"],
    ["WIP before Final Assembly", "units", "inventory_wip", 45, 70, 15, true, "Daily floor count"],
    ["First-pass yield", "%", "quality", 88, 84, 97, false, "QMS"],
    ["Scrap rate", "%", "quality", 4, 5.5, 2, false, "MES"],
    ["Final Assembly OEE", "%", "throughput", 62, 58, 80, true, "MES"],
    ["Operating expense", "$/unit", "operating_expense", 42, 45, 36, false, "Finance"],
  ];
  for (const [name, unit, type, base, cur, tgt, leading, src] of metrics) {
    repos.metrics.create({
      value_stream_id: V,
      name,
      unit,
      metric_type: type as never,
      baseline_value: base,
      current_value: cur,
      target_value: tgt,
      is_leading: leading,
      source: src,
    });
  }

  // ---- assumptions -------------------------------------------------------
  const assumptions: [string, "unvalidated" | "supported" | "refuted", string | null][] = [
    ["The molding line is our bottleneck.", "refuted", "Molding OEE is high and WIP accumulates after molding, not at it."],
    ["Final Assembly is constrained by skilled-labor availability.", "supported", "Only two builders are cross-trained; the line idles on any absence."],
    ["Customers tolerate the current 24-day lead time.", "unvalidated", "No recent voice-of-customer data."],
    ["Most quality escapes originate at Final Assembly.", "unvalidated", "Suspected from returns, not yet traced (no build records)."],
    ["Material shortages are the main schedule disruptor.", "refuted", "Shortages explain under 20% of late orders."],
  ];
  for (const [statement, status, evidence] of assumptions) {
    repos.assumptions.create({ value_stream_id: V, statement, status, evidence });
  }

  // ---- constraints (full family + ToC lifecycle) -------------------------
  type C = {
    title: string;
    desc: string;
    kind: "constraint" | "risk" | "breakdown" | "pain_point" | "seam";
    target: "step" | "value_stream";
    step?: number;
    sev: "low" | "medium" | "high" | "critical";
    like?: "low" | "medium" | "high" | null;
    toc?: "none" | "identified" | "exploit" | "subordinate" | "elevate" | "broken";
    sys?: boolean;
  };
  const constraints: C[] = [
    {
      title: "Final Assembly capacity (skilled builders)",
      desc: "All units funnel through a single final-assembly cell staffed by only two cross-trained builders. This is the system constraint governing flow.",
      kind: "constraint", target: "step", step: 7, sev: "critical", toc: "exploit", sys: true,
    },
    { title: "No serialized as-built record", desc: "Final Assembly captures no build record, driving rework and blocking root-cause on returns.", kind: "breakdown", target: "step", step: 7, sev: "high" },
    { title: "Assembly → Test handoff pile-up", desc: "Units queue untracked between Final Assembly and Functional Test.", kind: "seam", target: "step", step: 8, sev: "high" },
    { title: "Single-owner, undocumented test program", desc: "The functional-test program lives on one engineer's laptop; a single point of failure.", kind: "constraint", target: "step", step: 8, sev: "high", toc: "identified" },
    { title: "Late material certificates", desc: "Traceability docs lag receipt and occasionally hold shipment.", kind: "risk", target: "step", step: 3, sev: "medium", like: "high" },
    { title: "Schedule lives on a whiteboard", desc: "The production schedule is not in any system, so priorities are invisible upstream and downstream.", kind: "pain_point", target: "step", step: 2, sev: "medium" },
    { title: "Incoming disposition not recorded", desc: "Accept/reject decisions at incoming inspection are verbal.", kind: "breakdown", target: "step", step: 4, sev: "medium" },
    { title: "Resin price & lead-time volatility", desc: "Single-source resin with volatile lead times threatens schedule stability.", kind: "risk", target: "value_stream", sev: "medium", like: "medium" },
  ];
  for (const c of constraints) {
    repos.constraints.create({
      value_stream_id: V,
      title: c.title,
      description: c.desc,
      kind: c.kind,
      target_type: c.target,
      target_id: c.target === "value_stream" ? V : S(c.step as number),
      severity: c.sev,
      likelihood: c.like ?? null,
      toc_status: c.toc ?? "none",
      is_system_constraint: c.sys ?? false,
    });
  }

  // ---- flow edges --------------------------------------------------------
  // Sequence spine.
  for (let i = 1; i < STEPS.length; i++) {
    repos.flow_edges.create({
      value_stream_id: V,
      from_type: "step", from_id: S(i),
      to_type: "step", to_id: S(i + 1),
      edge_type: "sequence", notes: null,
    });
  }
  // Cross-cutting dependencies that converge on Final Assembly (step 7).
  const cross: { from: ["step" | "persona", number]; to: ["step" | "persona", number]; type: "data_flow" | "handoff" | "dependency"; notes: string }[] = [
    { from: ["step", 2], to: ["step", 3], type: "data_flow", notes: "Schedule drives purchasing priorities." },
    { from: ["step", 3], to: ["step", 7], type: "dependency", notes: "Component availability gates final assembly." },
    { from: ["step", 4], to: ["step", 7], type: "dependency", notes: "Material quality holds can stop the build." },
    { from: ["step", 6], to: ["step", 7], type: "handoff", notes: "Sub-assemblies feed the final cell." },
    { from: ["persona", 7], to: ["step", 7], type: "handoff", notes: "Builder availability paces this step." },
    { from: ["persona", 8], to: ["step", 8], type: "handoff", notes: "Sole QA engineer gates test throughput." },
  ];
  for (const e of cross) {
    repos.flow_edges.create({
      value_stream_id: V,
      from_type: e.from[0],
      from_id: e.from[0] === "persona" ? P(e.from[1]) : S(e.from[1]),
      to_type: e.to[0],
      to_id: e.to[0] === "persona" ? P(e.to[1]) : S(e.to[1]),
      edge_type: e.type,
      notes: e.notes,
    });
  }

  // ---- sub-steps of Final Assembly (drill-down sample) ------------------
  // Final Assembly (S(7)) is the system constraint; break it into its detailed
  // build procedure so the analyst can drill in and exploit it.
  const FS = (n: number) => `00000000-0000-4000-8000-0000000a07${String(n).padStart(2, "0")}`;
  const subSteps: { n: number; name: string; entry: string; action: string; exit: string; cycle: number; wait: number; pca: number; pain?: string }[] = [
    { n: 1, name: "Stage hardware kit", entry: "Sub-assembly + kit list", action: "Pull and verify hardware kit at the cell", exit: "Kit staged", cycle: 0.3, wait: 0.5, pca: 85 },
    { n: 2, name: "Mechanical assembly", entry: "Staged kit", action: "Assemble housing, route harness, seat PCB", exit: "Mechanically assembled", cycle: 1.2, wait: 1, pca: 80 },
    { n: 3, name: "Torque to spec", entry: "Mechanically assembled unit", action: "Torque fasteners to drawing spec in sequence", exit: "Torqued + witnessed", cycle: 0.8, wait: 2, pca: 60, pain: "Torque values live in senior builders' heads; no torque table at the station and no recorded torque values per unit." },
    { n: 4, name: "Affix internal label", entry: "Torqued unit", action: "Apply internal serial/build label", exit: "Labeled", cycle: 0.2, wait: 0.5, pca: 90 },
    { n: 5, name: "Builder sign-off", entry: "Labeled unit", action: "Builder verifies build, records as-built", exit: "Released to test", cycle: 0.5, wait: 1.5, pca: 55, pain: "Sign-off is verbal; no serialized as-built record is captured, so returns can't be traced to a build." },
  ];
  for (const s of subSteps) {
    repos.process_steps.create(
      {
        value_stream_id: V,
        parent_step_id: S(7),
        name: s.name,
        sequence_index: s.n - 1,
        entry_criteria: s.entry,
        action: s.action,
        exit_criteria: s.exit,
        pain_points: s.pain ?? null,
        cycle_time: s.cycle,
        wait_time: s.wait,
        pct_complete_accurate: s.pca,
      },
      FS(s.n),
    );
  }
  // Builder executes every sub-step; QA is consulted on sign-off.
  for (const s of subSteps) {
    repos.step_personas.create({ step_id: FS(s.n), persona_id: P(7), role_on_step: "executor" });
  }
  repos.step_personas.create({ step_id: FS(5), persona_id: P(8), role_on_step: "consulted" });
  // A couple of data gaps inside the constraint.
  repos.data_elements.create({ step_id: FS(3), name: "Torque values", binding_point: "action", data_type: "number", source_system: "None", presence: "missing", quality_notes: "Not captured per unit.", is_key: true });
  repos.data_elements.create({ step_id: FS(5), name: "As-built record", binding_point: "exit", data_type: "record", source_system: "None", presence: "missing", quality_notes: "Verbal sign-off only.", is_key: true });
  // Sequence spine among the sub-steps (drives the drilled-in canvas).
  for (let i = 1; i < subSteps.length; i++) {
    repos.flow_edges.create({
      value_stream_id: V,
      from_type: "step", from_id: FS(i),
      to_type: "step", to_id: FS(i + 1),
      edge_type: "sequence", notes: null,
    });
  }

  return { seeded: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = seedAcme();
  console.log(r.seeded ? "[seed:acme] ACME engagement inserted" : "[seed:acme] already present, skipped");
}
