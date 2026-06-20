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
  // Step-level data landscape (optional).
  sys?: string;
  dbs?: string;
  tbls?: string;
  etl?: string;
}

const STEPS: StepDef[] = [
  { n: 1, name: "Order Intake & Validation", entry: "Customer PO received via portal / EDI", action: "Validate SKU, pricing, credit and requested date", exit: "Confirmed sales order in ERP", cycle: 0.5, wait: 0.5, pca: 88, pain: "Configured SKUs require manual price lookups; promised dates are guessed before the schedule exists, so commitments are often unrealistic.", sys: "SAP ECC, EDI gateway, customer portal", dbs: "SAP ECC", tbls: "VBAK, VBAP, KNA1", etl: "EDI inbound IDoc → SAP (job EDI_ORDERS_IN)" },
  { n: 2, name: "Demand Planning & Scheduling", entry: "Confirmed orders + rolling forecast", action: "Run MRP, release work orders, sequence the line", exit: "Released production schedule", cycle: 1, wait: 1.5, pca: 70, pain: "The schedule lives on a whiteboard, so priorities are invisible to upstream and downstream teams. Re-sequencing after an expedite is manual and error-prone.", sys: "SAP PP, Excel, floor whiteboard", dbs: "SAP ECC, planning spreadsheet", tbls: "RESB, PLAF, AFKO", etl: "MRP run (RMMRP000); forecast loaded manually from Excel" },
  { n: 3, name: "Raw Material Procurement", entry: "Released WO with BOM shortages", action: "Issue POs, expedite resin and electronics", exit: "Materials on order / received", cycle: 2, wait: 4, pca: 64, pain: "Single-source resin with volatile lead times. Buyers rely on tribal knowledge of supplier reliability; expedite fees are routine.", sys: "SAP MM, supplier portal, email", dbs: "SAP ECC", tbls: "EKKO, EKPO, EBAN", etl: "Supplier ASN → SAP (job ASN_IMPORT)" },
  { n: 4, name: "Incoming Inspection", entry: "Materials received at dock", action: "Sample-inspect resin lots and purchased parts vs spec", exit: "Materials accepted to stock", cycle: 0.5, wait: 2, pca: 58, pain: "No standardized inspection plan — the inspector improvises. Accept/reject is verbal and not recorded, so traceability breaks here.", sys: "QMS (paper-backed), SAP QM", dbs: "QMS, SAP ECC", tbls: "QALS, QAVE", etl: "—" },
  { n: 5, name: "Injection Molding", entry: "Resin staged + mold/tool ready", action: "Mold widget housings and covers", exit: "Molded parts binned to WIP", cycle: 2, wait: 1, pca: 91, pain: "Shot/cycle data is logged inconsistently by shift; scrap is hand-counted at end of shift, so true yield is unknown until later.", sys: "MES, manual scrap tally", dbs: "MES (SQL Server)", tbls: "mes.production_runs, mes.scrap", etl: "MES → EDW hourly (job MES_PROD_LOAD)" },
  { n: 6, name: "Component Sub-Assembly", entry: "Molded parts + electronics kits", action: "Assemble PCB into housing sub-units", exit: "Sub-assemblies complete", cycle: 1.5, wait: 1.5, pca: 82, pain: "Work-instruction revisions aren't always current at the station, leading to occasional rework when a rev changes mid-run.", sys: "PLM, MES", dbs: "PLM, MES", tbls: "plm.work_instructions, mes.subassembly", etl: "—" },
  { n: 7, name: "Final Assembly", entry: "Sub-assemblies + hardware kit", action: "Final assemble widget, torque, fasten, label internally", exit: "Assembled widget", cycle: 3, wait: 6, pca: 76, pain: "THE CHOKE POINT. Only two builders are cross-trained; the cell idles on any absence. Torque specs live in senior builders' heads, no serialized build record is captured, and WIP stacks up in front of this step. Overtime and expedites concentrate here.", sys: "Paper traveler, MES (partial), label printer", dbs: "MES (partial); as-built not stored anywhere", tbls: "mes.assembly (cycle only)", etl: "None for build records — gap" },
  { n: 8, name: "Functional Test & QA", entry: "Assembled widget + traveler", action: "Power-on, calibrate, leak / EMC checks", exit: "Pass / fail dispositioned", cycle: 1, wait: 3, pca: 54, pain: "The test program runs from one engineer's laptop — a single point of failure. Parametric results are discarded (only pass/fail kept) and the release decision is verbal.", sys: "Test rig (engineer laptop), QMS", dbs: "QMS; parametric data not persisted", tbls: "qms.test_results (pass/fail only)", etl: "Manual CSV export, ad hoc" },
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
  if (repos.engagements.get(E, { includeDeleted: true })) {
    // ACME already exists — top up any newly-added notional sub-steps.
    seedAcmeSubSteps();
    return { seeded: false };
  }

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
        data_source_systems: s.sys ?? null,
        data_databases: s.dbs ?? null,
        data_tables: s.tbls ?? null,
        data_etl_jobs: s.etl ?? null,
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
    desc?: string; // business name / description
    tbl?: string; // table or view
    fld?: string; // field name
    ex?: string; // example value
  };
  const data: DE[] = [
    { step: 1, name: "Customer PO", bind: "entry", presence: "present", type: "string(10)", src: "EDI / Portal", key: true, desc: "Customer purchase order number", tbl: "VBAK", fld: "BSTNK", ex: "PO-2026-04417" },
    { step: 1, name: "Credit check", bind: "action", presence: "partial", type: "char(1)", src: "SAP FI", notes: "Sometimes overridden verbally", desc: "Credit release status", tbl: "VBUK", fld: "CMGST", ex: "A (approved)" },
    { step: 1, name: "Promised ship date", bind: "exit", presence: "partial", type: "date", src: "SAP SD", key: true, notes: "Often a placeholder, refined later", desc: "Confirmed delivery date committed to customer", tbl: "VBAP", fld: "EDATU", ex: "2026-05-12" },
    { step: 2, name: "Demand forecast", bind: "entry", presence: "partial", type: "decimal", src: "Excel", key: true, notes: "Maintained in a spreadsheet, weekly", desc: "Weekly demand forecast by SKU", tbl: "forecast.xlsx", fld: "qty_wk", ex: "1,250" },
    { step: 2, name: "MRP output", bind: "action", presence: "present", type: "report", src: "SAP PP", desc: "Planned orders from MRP", tbl: "PLAF", fld: "GSMNG", ex: "320" },
    { step: 2, name: "Production schedule", bind: "exit", presence: "missing", type: "plan", src: "Whiteboard", key: true, notes: "Lives on the floor whiteboard; not in any system", desc: "Sequenced build schedule for the line", tbl: "(none — whiteboard)", fld: "—", ex: "Line 2: WO-8841, WO-8839…" },
    { step: 3, name: "Supplier lead times", bind: "entry", presence: "partial", type: "int (days)", src: "Email", notes: "Tribal; varies by buyer", desc: "Expected supplier lead time", tbl: "EINE", fld: "PLIFZ", ex: "21" },
    { step: 3, name: "Purchase orders", bind: "action", presence: "present", type: "string(10)", src: "SAP MM", desc: "Purchase order to supplier", tbl: "EKKO", fld: "EBELN", ex: "4500091234" },
    { step: 3, name: "Material certs", bind: "exit", presence: "missing", type: "doc", src: "Supplier portal", key: true, notes: "Arrive late; block traceability", desc: "Material certificate of analysis", tbl: "(supplier portal)", fld: "cert_id", ex: "COA-RS-22918" },
    { step: 4, name: "Inspection plan", bind: "entry", presence: "missing", type: "doc", src: "Paper", key: true, notes: "No standard plan; inspector improvises" },
    { step: 4, name: "Sample results", bind: "action", presence: "partial", type: "report", src: "QMS", notes: "Stored locally, not linked to lot" },
    { step: 4, name: "Disposition record", bind: "exit", presence: "missing", type: "status", src: "None", key: true, notes: "Accept/reject is verbal" },
    { step: 5, name: "Mold setup sheet", bind: "entry", presence: "present", type: "doc", src: "MES" },
    { step: 5, name: "Shot / cycle data", bind: "action", presence: "partial", type: "number", src: "MES", notes: "Logged inconsistently per shift" },
    { step: 5, name: "Scrap count", bind: "exit", presence: "missing", type: "number", src: "Manual tally", notes: "Counted by hand, end of shift" },
    { step: 6, name: "Electronics kit list", bind: "entry", presence: "present", type: "BOM", src: "ERP" },
    { step: 6, name: "Work instructions", bind: "action", presence: "partial", type: "doc", src: "PLM", notes: "Rev not always current at station" },
    { step: 7, name: "Assembly traveler", bind: "entry", presence: "partial", type: "paper", src: "Paper", key: true, notes: "Handwritten; frequently incomplete", desc: "Build traveler accompanying the unit", tbl: "(paper)", fld: "—", ex: "Traveler #A-5521" },
    { step: 7, name: "Torque spec", bind: "action", presence: "missing", type: "N·m", src: "Tribal knowledge", key: true, notes: "Known only to senior builders", desc: "Fastener torque specification", tbl: "(none)", fld: "—", ex: "2.4 N·m ±0.2" },
    { step: 7, name: "As-built record", bind: "exit", presence: "missing", type: "record", src: "None", key: true, notes: "No serialized build record captured", desc: "Serialized as-built configuration", tbl: "(none — gap)", fld: "—", ex: "SN→component map" },
    { step: 7, name: "Labor hours", bind: "action", presence: "missing", type: "decimal", src: "Manual", notes: "Not captured per unit", desc: "Direct labor hours per unit", tbl: "(none)", fld: "—", ex: "0.85" },
    { step: 8, name: "Test program", bind: "entry", presence: "missing", type: "software", src: "Engineer's PC", key: true, notes: "Single copy on one laptop; undocumented", desc: "Functional test sequence/program", tbl: "(laptop file)", fld: "—", ex: "widget_fct_v7.seq" },
    { step: 8, name: "Test results", bind: "action", presence: "partial", type: "report", src: "QMS", key: true, notes: "Pass/fail captured; parametric data lost", desc: "Functional test outcome", tbl: "qms.test_results", fld: "result", ex: "PASS" },
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
      business_description: d.desc ?? null,
      binding_point: d.bind,
      data_type: d.type ?? null,
      source_system: d.src ?? null,
      table_or_view: d.tbl ?? null,
      field_name: d.fld ?? null,
      example_value: d.ex ?? null,
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
  repos.data_elements.create({ step_id: FS(3), name: "Torque values", business_description: "Measured fastener torque per joint", binding_point: "action", data_type: "N·m", source_system: "None (driver not networked)", table_or_view: "(none — gap)", field_name: "—", example_value: "2.41, 2.38, 2.45", presence: "missing", quality_notes: "Not captured per unit.", is_key: true });
  repos.data_elements.create({ step_id: FS(5), name: "As-built record", business_description: "Serialized as-built configuration + sign-off", binding_point: "exit", data_type: "record", source_system: "None", table_or_view: "(none — gap)", field_name: "—", example_value: "SN 22918 → builder JD", presence: "missing", quality_notes: "Verbal sign-off only.", is_key: true });
  // Sequence spine among the sub-steps (drives the drilled-in canvas).
  for (let i = 1; i < subSteps.length; i++) {
    repos.flow_edges.create({
      value_stream_id: V,
      from_type: "step", from_id: FS(i),
      to_type: "step", to_id: FS(i + 1),
      edge_type: "sequence", notes: null,
    });
  }

  seedAcmeSubSteps();
  return { seeded: true };
}

// ---------------------------------------------------------------------------
// Additive, idempotent notional sub-steps across several ACME steps. Each
// parent is guarded by its first sub-step id, so this can top up an existing
// ACME engagement (or run during a fresh seed) without duplicating.
// ---------------------------------------------------------------------------
interface SubDataDef {
  name: string;
  bind: "entry" | "action" | "exit";
  presence: "present" | "partial" | "missing";
  key?: boolean;
  desc?: string;
  type?: string;
  src?: string;
  tbl?: string;
  fld?: string;
  ex?: string;
  notes?: string;
}
interface SubStepDef {
  k: number;
  name: string;
  entry: string;
  action: string;
  exit: string;
  cycle?: number;
  wait?: number;
  pca?: number;
  data?: SubDataDef[];
}
interface ParentSubs {
  parent: number; // S(parent)
  block: string; // 2-hex id block (must not collide: 01=steps, 02=personas, 07=FA)
  executor: number; // P(executor)
  subs: SubStepDef[];
}

const SUB_DEFS: ParentSubs[] = [
  {
    parent: 1, block: "03", executor: 1,
    subs: [
      { k: 1, name: "Receive & log PO", entry: "PO arrives (EDI / portal)", action: "Capture PO into the order queue", exit: "PO logged", data: [{ name: "PO number", bind: "entry", presence: "present", key: true, desc: "Customer purchase order number", type: "string(10)", src: "EDI gateway", tbl: "VBAK", fld: "BSTNK", ex: "PO-2026-04417" }] },
      { k: 2, name: "Validate SKU & pricing", entry: "Logged PO", action: "Verify SKU validity and price", exit: "Priced order lines", data: [{ name: "Net price", bind: "action", presence: "partial", desc: "Line net price", type: "decimal", src: "SAP SD", tbl: "VBAP", fld: "NETPR", ex: "189.00", notes: "Manual lookups for configured SKUs" }] },
      { k: 3, name: "Credit check", entry: "Priced order", action: "Run / clear the credit check", exit: "Credit cleared or held", data: [{ name: "Credit status", bind: "action", presence: "partial", desc: "Credit release status", type: "char(1)", src: "SAP FI", tbl: "VBUK", fld: "CMGST", ex: "A (approved)" }] },
      { k: 4, name: "Confirm & promise date", entry: "Credit cleared", action: "Confirm order and set the promised date", exit: "Confirmed order in ERP", data: [{ name: "Promised date", bind: "exit", presence: "partial", key: true, desc: "Committed delivery date", type: "date", src: "SAP SD", tbl: "VBAP", fld: "EDATU", ex: "2026-05-12" }] },
    ],
  },
  {
    parent: 2, block: "04", executor: 2,
    subs: [
      { k: 1, name: "Load forecast", entry: "Weekly forecast file", action: "Import forecast into planning", exit: "Forecast loaded", data: [{ name: "Forecast qty", bind: "entry", presence: "partial", key: true, desc: "Weekly demand by SKU", type: "decimal", src: "Excel", tbl: "forecast.xlsx", fld: "qty_wk", ex: "1,250" }] },
      { k: 2, name: "Run MRP", entry: "Forecast + confirmed orders", action: "Execute the MRP run", exit: "Planned orders generated", data: [{ name: "Planned order qty", bind: "action", presence: "present", desc: "MRP planned order quantity", type: "int", src: "SAP PP", tbl: "PLAF", fld: "GSMNG", ex: "320" }] },
      { k: 3, name: "Sequence the line", entry: "Planned orders", action: "Sequence work orders by priority", exit: "Sequenced schedule", data: [{ name: "Schedule sequence", bind: "exit", presence: "missing", key: true, desc: "Build sequence for the line", src: "Whiteboard", tbl: "(none)", fld: "—", ex: "WO-8841, WO-8839…", notes: "On the floor whiteboard only" }] },
      { k: 4, name: "Release work orders", entry: "Sequenced schedule", action: "Release work orders to the floor", exit: "Released work orders", data: [{ name: "Work order", bind: "exit", presence: "present", desc: "Released production order", type: "string(12)", src: "SAP PP", tbl: "AFKO", fld: "AUFNR", ex: "000080012345" }] },
    ],
  },
  {
    parent: 4, block: "05", executor: 4,
    subs: [
      { k: 1, name: "Receive at dock", entry: "Truck arrives", action: "Receive and stage materials", exit: "Materials received", data: [{ name: "Goods receipt", bind: "entry", presence: "present", desc: "Goods-receipt document", type: "string(10)", src: "SAP MM", tbl: "MSEG", fld: "MBLNR", ex: "5000456789" }] },
      { k: 2, name: "Sample per plan", entry: "Received lot", action: "Pull sample and measure vs spec", exit: "Sample measured", data: [{ name: "Inspection plan", bind: "entry", presence: "missing", key: true, desc: "Standard sampling / inspection plan", src: "Paper", tbl: "(none)", fld: "—", ex: "AQL 1.0", notes: "No standardized plan" }] },
      { k: 3, name: "Disposition lot", entry: "Sample results", action: "Accept / reject and record", exit: "Lot dispositioned", data: [{ name: "Disposition", bind: "exit", presence: "missing", key: true, desc: "Accept / reject decision", src: "None", tbl: "(none)", fld: "—", ex: "Accept", notes: "Verbal, not recorded" }] },
    ],
  },
  {
    parent: 8, block: "06", executor: 8,
    subs: [
      { k: 1, name: "Load test program", entry: "Unit + traveler", action: "Load the FCT program on the rig", exit: "Rig ready", data: [{ name: "Test program", bind: "entry", presence: "missing", key: true, desc: "Functional test sequence", src: "Engineer laptop", tbl: "(file)", fld: "—", ex: "widget_fct_v7.seq", notes: "Single laptop copy" }] },
      { k: 2, name: "Power-on & calibrate", entry: "Rig ready", action: "Power on and calibrate", exit: "Calibrated", data: [{ name: "Calibration cert", bind: "action", presence: "partial", desc: "Calibration record", type: "string", src: "QMS", tbl: "qms.calibration", fld: "cert_id", ex: "CAL-7741" }] },
      { k: 3, name: "Leak / EMC check", entry: "Calibrated unit", action: "Run leak and EMC checks", exit: "Checks complete", data: [{ name: "Parametric results", bind: "action", presence: "missing", key: true, desc: "Measured test parameters", src: "Test rig", tbl: "(not persisted)", fld: "—", ex: "leak 2.1 sccm", notes: "Discarded; only pass/fail kept" }] },
      { k: 4, name: "Disposition & release", entry: "Checks complete", action: "Pass / fail and release", exit: "Released or scrapped", data: [{ name: "Final disposition", bind: "exit", presence: "missing", key: true, desc: "Release decision", src: "None", tbl: "(none)", fld: "—", ex: "PASS", notes: "Verbal" }] },
    ],
  },
];

export function seedAcmeSubSteps(): void {
  runMigrations();
  // Require the ACME value stream / parent steps to exist.
  if (!repos.process_steps.get(S(1), { includeDeleted: true })) return;

  const SUB = (block: string, k: number) =>
    `00000000-0000-4000-8000-0000000a${block}${String(k).padStart(2, "0")}`;

  for (const def of SUB_DEFS) {
    // Idempotency guard: if the first sub-step exists, this parent is done.
    if (repos.process_steps.get(SUB(def.block, 1), { includeDeleted: true })) continue;

    for (const s of def.subs) {
      repos.process_steps.create(
        {
          value_stream_id: V,
          parent_step_id: S(def.parent),
          name: s.name,
          sequence_index: s.k - 1,
          entry_criteria: s.entry,
          action: s.action,
          exit_criteria: s.exit,
          cycle_time: s.cycle ?? 0.4,
          wait_time: s.wait ?? 0.5,
          pct_complete_accurate: s.pca ?? 80,
        },
        SUB(def.block, s.k),
      );
      repos.step_personas.create({ step_id: SUB(def.block, s.k), persona_id: P(def.executor), role_on_step: "executor" });
      for (const d of s.data ?? []) {
        repos.data_elements.create({
          step_id: SUB(def.block, s.k),
          name: d.name,
          business_description: d.desc ?? null,
          binding_point: d.bind,
          data_type: d.type ?? null,
          source_system: d.src ?? null,
          table_or_view: d.tbl ?? null,
          field_name: d.fld ?? null,
          example_value: d.ex ?? null,
          presence: d.presence,
          quality_notes: d.notes ?? null,
          is_key: d.key ?? false,
        });
      }
    }
    // Sequence spine among this parent's sub-steps.
    for (let i = 1; i < def.subs.length; i++) {
      repos.flow_edges.create({
        value_stream_id: V,
        from_type: "step", from_id: SUB(def.block, def.subs[i - 1].k),
        to_type: "step", to_id: SUB(def.block, def.subs[i].k),
        edge_type: "sequence", notes: null,
      });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = seedAcme();
  console.log(r.seeded ? "[seed:acme] ACME engagement inserted" : "[seed:acme] already present, skipped");
}
