import { pathToFileURL } from "node:url";
import { runMigrations } from "./migrate";
import { repos } from "../repositories";

// ---------------------------------------------------------------------------
// Aviation Company — Large Commercial Aircraft Fuselage Integration
// Value Stream: Parts Missing & Omitted (PM&O) in the Integration line
//
// Aviation Company manufactures major fuselage sections for large commercial
// aircraft: forward fuselage sections and forward cabin sections, joined at
// the integration facility before shipment to the OEM customer's final
// assembly location.
//
// Systems referenced:
//   SAP ERP   — production system (materials, PP, QM modules)
//   MES       — manufacturing execution system for electronic traveler,
//               work-order routing, and inspection records
//   PDM       — engineering data / drawing control
//   OPR tracking log — shared Excel maintained by Production Control (notional
//                      but representative of common aerospace practice)
//
// Process logic and metrics are calibrated to standard aerospace large-structure
// assembly practice; specific numbers are notional estimates.
// ---------------------------------------------------------------------------

const E = "00000000-0000-4000-8000-0000000c0001";
const V = "00000000-0000-4000-8000-0000000c0010";

const pad2 = (n: number) => String(n).padStart(2, "0");
const S   = (n: number) => `00000000-0000-4000-8000-0000000c01${pad2(n)}`;
const P   = (n: number) => `00000000-0000-4000-8000-0000000c02${pad2(n)}`;
// Sub-step namespaces nested under Steps 6 and 11
const FS6  = (n: number) => `00000000-0000-4000-8000-0000000c06${pad2(n)}`;
const FS11 = (n: number) => `00000000-0000-4000-8000-0000000c11${pad2(n)}`;

// ---- step definitions (16 total: 10 normal flow + 6 OPR reactive path) ---
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
  sys?: string;
  dbs?: string;
  tbls?: string;
  etl?: string;
}

const STEPS: StepDef[] = [
  // ---- normal integration flow (Steps 1–10) --------------------------------
  {
    n: 1, name: "Build Plan Release & Work Order Authorization",
    entry: "Engineering-released drawing revision and BOM available in PDM; MSN (Manufacturing Serial Number) assigned to this fuselage section",
    action: "Manufacturing Engineer reviews traveler package in MES for completeness and ECN reconciliation; Production Control opens the SAP PP production order; MES creates the MSN-linked traveler instance for this section",
    exit: "Released MES traveler for this MSN; SAP production order open and released to the floor",
    cycle: 0.5, wait: 2.0, pca: 72,
    pain: "Engineering Change Notices (ECNs) frequently arrive after the traveler is already released — sometimes mid-build — requiring traveler amendments. the company tracks the build-to vs. as-designed delta manually, and the reconciliation creates coordination overhead that delays build start. Traveler packages released with open TBD items are common, particularly on recently revised sections.",
    sys: "MES system, SAP PP, PDM",
    dbs: "SAP ERP, MES, PDM",
    tbls: "SAP: AUFK (production order), MAST (BOM header), STPO (BOM items); MES: traveler/router instance",
    etl: "PDM drawing release → MES traveler update (manual trigger by Manufacturing Engineer per ECN)",
  },
  {
    n: 2, name: "BOM-to-Kit (Kitting)",
    entry: "Released SAP production order; component requirements list (RESB) available; MES kit list printed or queued for MCC",
    action: "Material Control Coordinator (MCC) picks parts from bonded stores and bulk fastener stock against the kit list; parts are bagged, tagged, and placed in labeled kit containers organized by station and traveler step",
    exit: "Kit containers assembled and labeled with MSN, station, and step reference; kit list annotated with picker initials",
    cycle: 1.0, wait: 0.5, pca: 61,
    pain: "Kit completeness at line delivery is the primary originating failure for PM&O OPRs. SAP MARD shows positive on-hand balances that frequently do not reflect physical availability in bonded stores — phantom inventory is pervasive. Engineering changes can silently alter the part requirement after the kit is already pulled, creating an immediate PM&O at station. Life-limited items (sealants, adhesives) occasionally expire before use, requiring replacement that triggers a shortage with no prior warning.",
    sys: "SAP MM (inventory management), MES (kit list generation), bonded stores management",
    dbs: "SAP ERP, MES",
    tbls: "SAP: RESB (component requirements), MARD (storage location stock), MARC (plant/material), MCHB (batch stock)",
    etl: "SAP RESB → MES kit list (interface job; triggered per production order release)",
  },
  {
    n: 3, name: "Kit Inspection & Verification",
    entry: "Assembled kit containers with annotated picker kit list; inspector scheduling from Production Control",
    action: "Receiving/Kit Inspector cross-checks part numbers, quantities, and drawing revision levels on kit list vs. physical parts; verifies material certifications for life-limited and traceable items; checks shelf life on adhesives and sealants; stamps and signs the paper kit list",
    exit: "Inspector-signed kit list; kit containers sealed and tagged 'Released for Delivery to Line'",
    cycle: 0.5, wait: 1.0, pca: 58,
    pain: "No digital checklist or barcode scan — the inspector works from a printed kit list, cross-referencing part markings by eye. The ECN database is not accessible at the inspection station, so revision-level verification is against the printed kit list which may lag the latest ECN. When shortages or wrong-revision parts are found, the kit returns to kitting for correction, adding 0.5–1 day of delay. One inspector may cover multiple sections simultaneously, and kit inspection is frequently deprioritized under schedule pressure.",
    sys: "Paper kit list, SAP QM (material cert lookup)",
    dbs: "SAP ERP",
    tbls: "SAP: MARA (material master), QALS (inspection lot for cert verification)",
  },
  {
    n: 4, name: "Line-Side Delivery & Staging",
    entry: "Cleared, sealed kit containers; delivery schedule from Production Control",
    action: "MCC or material handler moves kit containers from bonded stores to the assigned station on the integration floor; places containers in the station staging rack in the designated bay location; logs delivery in MES traveler",
    exit: "Kit at station; MES traveler updated with delivery timestamp",
    cycle: 0.25, wait: 0.5, pca: 88,
    pain: "MES delivery-log update is manual and frequently delayed or missed — the floor is active and the MCC is managing multiple simultaneous deliveries. Occasionally kits are staged at the wrong station (adjacent fuselage sections look similar in the integration bay). Station congestion during high-build-rate periods leads to kits being stacked, which obscures whether the correct kit is present at the right station.",
    sys: "MES system, production floor staging racks",
    dbs: "MES",
  },
  {
    n: 5, name: "Station Authorization & Tooling Verification",
    entry: "Kit at station; MES traveler open; required special tooling list identified in traveler",
    action: "Lead Mechanic activates the traveler step in MES; verifies required special tools and fixtures (jigs, calibrated torque multipliers, drill templates) are checked out from tool crib and current on calibration; briefs Technicians on the operation sequence and any active ECNs or traveler amendments affecting this station",
    exit: "Traveler step activated in MES; all required tooling at station with calibration confirmed; team briefed",
    cycle: 0.25, wait: 0.5, pca: 82,
    pain: "Calibrated special tooling is shared across concurrent sections and may be in use elsewhere or out of calibration when needed, delaying start. The MES traveler may reference tooling from a superseded engineering revision if the ME did not complete the traveler amendment in time. This step is also the first moment a Technician physically opens the kit — and the most common point of PM&O discovery.",
    sys: "MES system, Tool Crib management system",
    dbs: "MES, Tool Crib system",
  },
  {
    n: 6, name: "Structural Integration — Major Section Join",
    entry: "Authorized traveler step; barrel sections positioned in join fixture; structural kit (splice plates, fasteners, shims, sealant) confirmed at station",
    action: "Technicians execute the structural join per traveler: fit-up and shim the join interface to tolerance, apply faying surface sealant, install splice plates and shear ties, drill and ream fastener holes to drawing diameter, install fasteners (Hi-Loks, Lockbolts, or structural bolts per drawing) to witnessed torque spec, install frames and clips through the join zone",
    exit: "Structural join complete per traveler; Lead Mechanic signs traveler step; dimensional check recorded",
    cycle: 5.0, wait: 1.0, pca: 84,
    pain: "Parts missing from the structural kit (splice plate at wrong revision, fastener at wrong diameter or grip length, shim pack incomplete) stop the join completely — structural fastener substitution is never permitted without engineering disposition. Any PM&O here can halt the join fixture and potentially back up the upstream barrel section waiting its turn. Out-of-sequence installation of a structural fastener after closeout begins is physically among the most access-constrained and costly recovery operations on the section.",
    sys: "MES system, PDM (drawing references), calibrated torque tooling",
    dbs: "MES, PDM",
    tbls: "MES: traveler step records, fastener lot log (manual entry)",
  },
  {
    n: 7, name: "Systems Rough-In (Wiring / Hydraulics / Pneumatics)",
    entry: "Structural join complete and signed; systems rough-in traveler steps active; systems kit at station",
    action: "Technicians route wiring harnesses, hydraulic lines, and pneumatic ducting through the integration zone per drawing; install brackets, P-clamps, and attachment hardware; pull harnesses through the join zone before structural closeout panels are installed; verify routing and clearances per stress drawing",
    exit: "All rough-in systems routed, supported, and protected; no FOD; visual inspection by Lead Mechanic; MES rough-in steps signed off",
    cycle: 8.0, wait: 1.0, pca: 76,
    pain: "Wiring harness brackets, P-clamps, and attachment hardware (primarily MS/NAS/AN-series fasteners) are the top PM&O category in this step — bulk hardware stockouts are frequently handled by informal borrowing from adjacent stations before an OPR is raised, masking the true defect rate. Routing drawings occasionally conflict with structural drawings at the join zone, generating engineering queries (EQs) that pause work while the Manufacturing Engineer resolves the drawing conflict. EQs are tracked informally (verbal and email) with no system log.",
    sys: "MES system, PDM (routing and stress drawings), SAP MM (bulk hardware stock)",
    dbs: "MES, SAP ERP, PDM",
  },
  {
    n: 8, name: "Post-Join Dimensional & Structural Inspection",
    entry: "Structural integration and rough-in complete; Designated Inspector (DI) scheduled and available",
    action: "DI performs dimensional inspection of the join zone: skin flush, step, and gap measurements at the splice; frame station positions; fastener installation (correct part number, head condition, correct Hi-Lok collar, witness marks); harness support locations and clearances; signs each traveler inspection point; opens SAP QM Quality Notifications for any out-of-tolerance or non-conforming conditions",
    exit: "All traveler inspection points DI-signed in MES; SAP QN opened for any findings; section cleared to proceed to systems test",
    cycle: 1.0, wait: 2.0, pca: 68,
    pain: "DI availability is the scheduling constraint at this step. With multiple fuselage sections in flow simultaneously, one DI may carry sign-off responsibility for 3–4 sections at once, and the inspection requires the DI to be physically at the section. Inspection findings that trace to a PM&O (wrong fastener installed, missing bracket) must be dispositioned as separate OPRs before the traveler step can be signed, creating a feedback loop between the normal flow and the OPR reactive path.",
    sys: "MES system, SAP QM (Quality Notifications — QM01)",
    dbs: "SAP ERP (QM module), MES",
    tbls: "SAP: QMEL (quality notification header), QMFE (defect items), QMMA (activities)",
  },
  {
    n: 9, name: "Systems Integration & Continuity Testing",
    entry: "Structural and rough-in inspection complete; systems test authorization from DI; test equipment at station",
    action: "Systems technicians perform electrical continuity and insulation resistance checks on wiring harnesses through the join zone; hydraulic lines are pressure-tested per the test specification; pneumatic ducts are leak-checked; test results are recorded in MES",
    exit: "Test results recorded in MES; pass/fail for each system segment documented; any failures written up for troubleshooting disposition",
    cycle: 2.0, wait: 1.0, pca: 74,
    pain: "Test failures that trace to mis-routed harnesses or missing connectors (a PM&O from Step 7) require troubleshooting that can consume 0.5–2 additional days. Test records are entered manually in MES but traceability to the specific harness part number and lot is not always captured, making root-cause analysis difficult. Pressure test equipment is shared across stations and occasionally unavailable when needed.",
    sys: "MES system, portable electrical and hydraulic test equipment",
    dbs: "MES",
  },
  {
    n: 10, name: "Section Buy-Off & Shipment Authorization",
    entry: "All MES traveler steps signed off; all open OPRs closed or formally deferred with QE-approved written disposition; Quality Engineer scheduled for review",
    action: "Quality Engineer reviews the complete traveler package for step completeness, inspection sign-offs, and OPR closure status; confirms no open SAP Quality Notifications without written dispositions; issues the Section Conformance sign-off document; Production Control coordinates with the OEM customer's final assembly facility schedule for the shipment window; section transferred to shipping preparation",
    exit: "Signed Section Conformance document; SAP production order technically completed (TECO); MES traveler closed; section on shipment schedule to the OEM customer's final assembly facility",
    cycle: 0.5, wait: 1.0, pca: 82,
    pain: "Open OPRs at buy-off are the single biggest driver of section schedule slip. When the OPR backlog accumulates — particularly near program delivery milestones — weekend overtime and emergency expedites become the norm and the VP of Supply Chain & Fabrication is frequently drawn into disposition decisions. The buy-off review requires manually reconciling three data sources (MES traveler, SAP QN status, and the OPR tracking Excel) because these systems are not integrated.",
    sys: "MES system, SAP PP (production order close — TECO), OPR tracking log (shared Excel)",
    dbs: "SAP ERP, MES, OPR tracking log",
    tbls: "SAP: AUFK (order status), JEST (object status — TECO), QMEL (open QN check)",
  },

  // ---- OPR reactive path (Steps 11–16) ------------------------------------
  {
    n: 11, name: "PM&O Discovery & OPR Initiation",
    entry: "Technician at station discovers a part is missing from the kit, the wrong revision was kitted, or a required part cannot be located at station",
    action: "Technician notifies Lead Mechanic; Lead Mechanic documents the shortage on a paper Non-Conformance Report (NCR) at the station; SAP QM Quality Notification (PM&O category) is opened in transaction QM01; OPR entered in the shared OPR tracking log; Production Control is notified to assess schedule impact",
    exit: "SAP Quality Notification number assigned and status 'Open'; OPR tracking log updated; Production Control flagged; MCC assigned to begin material search",
    cycle: 0.5, wait: 1.0, pca: 65,
    pain: "OPR initiation is routinely delayed because Technicians first attempt informal resolution — checking adjacent kit containers, borrowing from nearby stations, asking if a substitute is acceptable. This informal search, which is not tracked anywhere, typically consumes 1–4 hours before the formal OPR is raised. The delay compresses the window for Material Control to locate and deliver the part before downstream work is blocked. The SAP QN open-date timestamp is therefore not a reliable proxy for actual time of PM&O discovery.",
    sys: "SAP QM (Quality Notifications — QM01), OPR tracking log (shared Excel)",
    dbs: "SAP ERP (QM module), OPR tracking log",
    tbls: "SAP: QMEL (QN header), QMFE (defect items), QMMA (activities)",
  },
  {
    n: 12, name: "Material Control Search & Inventory Disposition",
    entry: "Assigned SAP Quality Notification with affected part number and quantity; MCC assigned to search",
    action: "MCC queries SAP MMBE for current stock balance across all storage locations; physically walks bonded stores, overstock areas, and adjacent kit containers to verify availability; documents search result in OPR tracking log; if found, pulls and delivers to station and routes OPR to Step 15; if not found, confirms shortage in writing and initiates expedite routing through Step 13",
    exit: "Found path: part delivered to station, OPR routed to out-of-sequence installation. Not-found path: shortage confirmed in OPR log; supply chain expedite initiated",
    cycle: 0.5, wait: 1.0, pca: 71,
    pain: "Phantom inventory is a systemic problem: SAP MMBE shows a positive on-hand balance, but the physical search finds nothing. The root cause is a combination of unreversed mis-picks, parts sitting in Quality Hold (inspection-pending status) that are system-blocked but physically present, and delayed receiving transactions. Each phantom finding requires a SAP inventory adjustment (MI07 physical inventory document) that adds administrative time and cannot always be completed before the expedite must start to protect the schedule.",
    sys: "SAP MM (MMBE inventory overview, MB52 warehouse stock, MIGO goods movements)",
    dbs: "SAP ERP",
    tbls: "SAP: MARD (storage location stock), MCHB (batch stock), S032 (WM stock overview)",
  },
  {
    n: 13, name: "Engineering Impact Assessment",
    entry: "Confirmed parts shortage from Step 12; active traveler with blocked step; SAP Quality Notification with shortage details",
    action: "Quality Engineer and Manufacturing Engineer jointly review the impact: Can work continue at other traveler steps while the part is expedited (parallel path)? Is there a drawing-approved substitution? Does the missing part affect structural integrity or airworthiness, requiring OEM customer engineering review? Written disposition is documented in the SAP Quality Notification activity record.",
    exit: "Written engineering disposition in SAP QN: (a) Continue — downstream steps authorized to proceed in parallel; (b) Wait — the blocked step halts all work on the section; (c) Substitute — engineering-approved alternative part specified; or (d) Defer — part will be installed before buy-off with downstream impacts formally understood",
    cycle: 1.0, wait: 2.0, pca: 63,
    pain: "Engineering assessment is a bottleneck when OPR volume spikes. Two or three Quality Engineers may be responsible for 4–6 active sections simultaneously, each with multiple open OPRs. Prioritization is informal and driven by which Production Manager calls most urgently. Dispositions are frequently communicated verbally before the SAP QN activity record is written — for airworthiness-relevant parts, this creates an FAA traceability gap where the formal record does not reflect the actual decision sequence.",
    sys: "SAP QM (QN activity update), PDM (drawing review for substitution or disposition), MES (downstream traveler dependency check)",
    dbs: "SAP ERP, PDM, MES",
    tbls: "SAP: QMMA (QN activities), QMEL (QN status); MES: traveler dependency map (manual lookup)",
  },
  {
    n: 14, name: "Supply Chain Expedite",
    entry: "Confirmed shortage with engineering disposition of 'Wait' or 'Defer'; supplier identified from SAP purchase info record; expedite authorization from Production Control",
    action: "Supply Chain Expeditor contacts supplier to confirm stock availability and negotiate accelerated delivery; arranges premium freight (air freight requires VP-level cost authorization above threshold); if the prime supplier cannot deliver, searches for FAA-approved alternate sources or contacts the OEM supply chain network for available inventory",
    exit: "Confirmed delivery date from supplier entered in OPR tracking log and SAP QN; premium freight arranged if authorized; delivery date communicated to Production Control for schedule replanning",
    cycle: 1.0, wait: 7.0, pca: 55,
    pain: "Single-source proprietary parts — company-designed brackets, doublers, composite clips, and window-frame details — have no approved alternate source. When these are the missing part, the section may sit at station for 10–21 days waiting for the supplier to manufacture and ship. the company has limited real-time visibility into supplier subcomponent lead times, so expedite date-promises are frequently optimistic. The gap between the supplier's first-promised delivery date and actual receipt has averaged several days over recent build cycles.",
    sys: "SAP MM (vendor data — EINE purchase info record, EKKO/EKPO purchase orders), supplier portals, email",
    dbs: "SAP ERP",
    tbls: "SAP: EINE (purchasing info record), EKKO/EKPO (purchase order header/items), EKET (delivery schedule lines)",
  },
  {
    n: 15, name: "Out-of-Sequence Installation",
    entry: "Replacement part received at the manufacturing facility and cleared through receiving inspection; engineering disposition authorizing out-of-sequence (OOS) installation; Lead Mechanic and QE notified",
    action: "Technician installs the part out of its planned sequence, which may require partial disassembly (removing access panels, relocating harnesses, or removing previously installed hardware to create access), use of elevated work platforms and extended-reach tooling, and re-installation of displaced components; Lead Mechanic witnesses the installation; steps documented in the SAP QN and retroactively completed in MES",
    exit: "Part installed per drawing; Lead Mechanic installation sign-off; MES traveler step retroactively completed; SAP QN updated with installation record; ready for OPR closure inspection (Step 16)",
    cycle: 1.0, wait: 1.0, pca: 75,
    pain: "Out-of-sequence installation is physically harder and slower than planned installation: access panels that would normally be open are closed, structural closeout may have occurred over the installation zone, and lighting and ergonomics are degraded. Direct labor hours for OOS installation routinely run 2–5× the planned task hours for the same part installed in sequence. There is no systematic tracking of this OOS labor premium — it is absorbed into the Technician's general production labor code — so the true cost of PM&O is invisible to management and never enters the cost model.",
    sys: "MES (retroactive traveler step completion), SAP QM (QN activity update), access platform / work stand management",
    dbs: "MES, SAP ERP",
    tbls: "SAP: QMMA (QN activities); MES: traveler retroactive completion record",
  },
  {
    n: 16, name: "OPR Closure Inspection & Documentation",
    entry: "Part installed OOS with Lead Mechanic sign-off; Designated Inspector scheduled for closure inspection",
    action: "Designated Inspector physically inspects the installation: confirms correct part number, correct drawing revision, correct orientation, fastener torque (if applicable), sealant application (if applicable), and no FOD left in the work zone; DI signs the SAP QN closure record; Quality Engineer performs the formal QN closure transaction in SAP QM (QM02); MES traveler updated to reflect OPR resolution; OPR removed from open backlog in the tracking log",
    exit: "SAP QN formally closed (status 'Completed') with DI and QE signatures; MES traveler reflects step completion; OPR tracking log updated; Production Control notified that OPR is cleared",
    cycle: 0.5, wait: 1.5, pca: 72,
    pain: "OPR closure inspections compete directly for DI time with normal build-progress traveler sign-offs on active sections. During high-OPR periods, the DI is context-switching between closure inspections and normal traveler sign-offs across multiple sections simultaneously, creating task-switching overhead and extending total DI calendar time per section. Not all DIs are trained on the SAP QM02 closure transaction, requiring QE intervention to complete the SAP record — adding a hand-off delay. Retroactive MES traveler updates are sometimes missed, leaving the traveler in an incomplete state that re-flags at section buy-off review.",
    sys: "SAP QM (QN closure — QM02 transaction), MES (retroactive traveler update), OPR tracking log",
    dbs: "SAP ERP (QM module), MES, OPR tracking log",
    tbls: "SAP: QMEL (QN status → NOPR/CLSD), QMMA (closure activities), JEST (object status update)",
  },
];

// ---- persona definitions (12 personas) ------------------------------------
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
  { n: 1,  name: "Assembly Technician",           role: "Journey Mechanic / Mechanic A",       fn: "Integration / Assembly",      scope: "local",  resp: "Performs structural integration and systems rough-in tasks per the MES traveler; installs fasteners, routes harnesses, and reports parts shortages to Lead Mechanic.",         auth: "Authorized to perform traveler-assigned steps only. Cannot deviate from drawing or substitute parts without a written engineering disposition." },
  { n: 2,  name: "Lead Mechanic",                 role: "Lead Mechanic",                       fn: "Integration / Assembly",      scope: "stream", resp: "Supervises Technicians at the integration station; activates MES traveler steps; witnesses critical operations (torque, sealant); initiates OPRs; first escalation point for all parts shortages.",  auth: "Authorizes daily work sequence and tool checkout; can pause work for safety or quality cause. Cannot authorize part substitutions or drawing deviations." },
  { n: 3,  name: "Material Control Coordinator",  role: "Material Control Coordinator (MCC)",  fn: "Materials / Supply Chain",    scope: "stream", resp: "Manages parts kitting against the SAP component list; delivers kits to the integration floor; executes physical inventory searches and delivers replacement parts for OPRs.",  auth: "Can pull and deliver parts from bonded stores. Cannot approve part substitutions or accept non-conforming materials." },
  { n: 4,  name: "Production Control Manager",    role: "Production Control Manager",          fn: "Production Planning",         scope: "stream", resp: "Owns the integration section schedule; maintains section flow-days vs. plan; coordinates OPR impact on station sequencing; escalates to Section VSM when ship date is at risk.",   auth: "Can reprioritize station sequences and authorize limited schedule float. Cannot authorize part substitutions or capital expenditures." },
  { n: 5,  name: "Designated Inspector (DI)",     role: "Designated Inspector",                fn: "Quality Assurance",           scope: "stream", resp: "Performs traveler inspection sign-offs, post-join dimensional inspection (Step 8), and OPR closure inspections (Step 16). Sole authority to sign traveler inspection points.",   auth: "Sole authority to sign traveler inspection points and clear sections to next step. Can stop work for safety or quality cause." },
  { n: 6,  name: "Quality Engineer (QE)",         role: "Quality Engineer",                    fn: "Quality Engineering",         scope: "system", resp: "Owns engineering dispositions on non-conformances; formally closes SAP Quality Notifications; performs section buy-off (Step 10); supports Root Cause / Corrective Action on PM&O trends.",  auth: "Issues written engineering dispositions on non-conformances; authority to defer, repair, or reject. Does not own schedule." },
  { n: 7,  name: "Manufacturing Engineer (ME)",   role: "Manufacturing / Industrial Engineer", fn: "Engineering",                 scope: "stream", resp: "Owns the MES traveler package; reconciles ECNs against the active build; resolves engineering queries (EQs) from the floor; participates in OPR engineering impact assessment (Step 13).", auth: "Can issue traveler amendments and accept engineering queries for resolution. Cannot unilaterally approve deviations from the approved drawing." },
  { n: 8,  name: "Supply Chain Expeditor",        role: "Supply Chain Expeditor",              fn: "Supply Chain",                scope: "stream", resp: "Manages supplier communication and accelerated delivery for OPR shortages; coordinates premium freight authorization; tracks supplier delivery commitments against OPR due dates.", auth: "Can authorize expedite fees up to the standard threshold. Premium freight above threshold requires Production Control Manager or VP approval." },
  { n: 9,  name: "Tool Crib Technician",          role: "Tool Crib Technician",                fn: "Tooling / Maintenance",       scope: "local",  resp: "Issues and receives calibrated special tooling; maintains calibration records; flags out-of-calibration tools and withholds them from use.",   auth: "Can withhold out-of-calibration tooling from issue. No authority beyond tool management." },
  { n: 10, name: "Receiving Inspector",           role: "Receiving Inspector",                 fn: "Quality Assurance",           scope: "local",  resp: "Inspects incoming parts and materials against receiving inspection criteria; verifies material certifications; accepts or places holds on incoming lots; performs kit verification inspection (Step 3).",  auth: "Can accept or place on Quality Hold incoming parts and materials." },
  { n: 11, name: "Section Value Stream Manager",  role: "Section Value Stream Manager",        fn: "Operations Leadership",       scope: "system", resp: "Owns flow performance of the fuselage integration section; accountable to the VP Supply Chain & Fabrication for section throughput, schedule adherence, and OPR backlog metrics.",  auth: "Can authorize overtime, temporary labor additions, and capital within program budget. Escalates to VP for significant schedule risk or supplier failures." },
  { n: 12, name: "VP, Supply Chain & Fabrication", role: "Vice President, Supply Chain & Fabrication", fn: "Executive Leadership", scope: "system", resp: "Accountable for fuselage integration program delivery commitments to the OEM customer's final assembly facility; has initiated engagement with Nexum Solutions to reduce PM&O OPR backlog and address its root causes.", auth: "Full program authority. Approves premium freight above threshold, significant schedule deviations, and supplier escalations above Expeditor authority." },
];

export function seedAviationCo(): { seeded: boolean; subStepsAdded: number } {
  runMigrations();
  if (repos.engagements.get(E, { includeDeleted: true })) {
    const added = seedAviationCoSubSteps();
    return { seeded: false, subStepsAdded: added };
  }

  // ---- engagement ----------------------------------------------------------
  repos.engagements.create(
    {
      name: "Aviation Company",
      client_org: "Aviation Company — Large Commercial Aircraft Fuselage Integration",
      notes: "OPR reduction engagement focused on Parts Missing & Omitted defects in the fuselage integration stream. VP Supply Chain & Fabrication is the executive sponsor; Lean 6 Sigma Black Belt leading the internal team.",
    },
    E,
  );

  // ---- value stream --------------------------------------------------------
  repos.value_streams.create(
    {
      engagement_id: E,
      name: "Fuselage Integration — Parts Missing & Omitted (PM&O)",
      problem_statement:
        "The fuselage integration line carries an average of 22 open PM&O OPRs per section, the majority traceable to BOM inaccuracies, phantom inventory, and late ECNs. Out-of-sequence installation to close OPRs adds an estimated 55 untracked labor hours per section, routinely extends station dwell beyond plan, and drives end-of-period overtime to meet customer shipment commitments.",
      scope_level: "system",
      narrative:
        "End-to-end process from build plan release through section buy-off, covering both the normal-flow integration steps and the reactive OPR path triggered when PM&O is discovered at station. Root causes spread across engineering (BOM accuracy, ECN timing), material control (phantom inventory, no digital kit verification), and supply chain (single-source risk, limited upstream visibility) — but the cost accumulates on the integration floor where out-of-sequence access is physically constrained and DI capacity is the scheduling governor.",
    },
    V,
  );

  // ---- assumptions ---------------------------------------------------------
  repos.assumptions.create({
    value_stream_id: V,
    statement: "BOM errors and late ECNs are the single largest root-cause category for PM&O OPRs, accounting for more than 40% of OPR volume.",
    status: "supported",
    evidence: "Pareto analysis of OPR tracking log (last 6 months, notional) shows engineering data mismatches as the leading category.",
  });
  repos.assumptions.create({
    value_stream_id: V,
    statement: "Phantom inventory in SAP bonded stores is a top-3 root cause of PM&O OPRs in the kitting step.",
    status: "supported",
    evidence: "MCC informal interviews; frequency of MI07 physical inventory adjustments following OPR searches.",
  });
  repos.assumptions.create({
    value_stream_id: V,
    statement: "The true cost of OOS installation labor is 2–5× the planned task hours, but this premium is not tracked in any system.",
    status: "unvalidated",
    evidence: "Lead Mechanic and QE estimates; no formal time study exists for OOS labor premium.",
  });
  repos.assumptions.create({
    value_stream_id: V,
    statement: "Digital kit verification (barcode scan at kit inspection and at station receipt) would catch the majority of PM&O OPRs before they reach the integration floor.",
    status: "unvalidated",
    evidence: "Hypothesis from kitting-step analysis; no pilot data yet.",
  });

  // ---- personas ------------------------------------------------------------
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

  // ---- process steps -------------------------------------------------------
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

  // ---- RACI ----------------------------------------------------------------
  type Role = "executor" | "approver" | "consulted" | "informed";
  const raci: [number, number, Role][] = [
    // Step: personas
    [1,  7, "executor"], [1,  4, "approver"], [1,  6, "informed"], [1, 11, "informed"],
    [2,  3, "executor"], [2,  2, "consulted"], [2,  4, "informed"],
    [3, 10, "executor"], [3,  3, "consulted"],
    [4,  3, "executor"], [4,  2, "informed"],
    [5,  2, "executor"], [5,  1, "informed"],  [5,  9, "consulted"],
    [6,  1, "executor"], [6,  2, "approver"],  [6,  5, "consulted"],
    [7,  1, "executor"], [7,  2, "approver"],
    [8,  5, "executor"], [8,  6, "approver"],
    [9,  1, "executor"], [9,  5, "consulted"],
    [10, 6, "executor"], [10, 4, "approver"],  [10, 11, "informed"], [10, 12, "informed"],
    // OPR path
    [11, 2, "executor"], [11, 3, "informed"],  [11, 4, "informed"],
    [12, 3, "executor"], [12, 2, "informed"],  [12, 4, "informed"],
    [13, 6, "executor"], [13, 7, "consulted"], [13, 4, "informed"],
    [14, 8, "executor"], [14, 4, "informed"],  [14, 11, "informed"],
    [15, 1, "executor"], [15, 2, "approver"],  [15, 6, "consulted"],
    [16, 5, "executor"], [16, 6, "approver"],
  ];
  for (const [step, persona, role] of raci) {
    repos.step_personas.create({ step_id: S(step), persona_id: P(persona), role_on_step: role });
  }

  // ---- data elements -------------------------------------------------------
  type DE = {
    step: number;
    name: string;
    bind: "entry" | "action" | "exit";
    presence: "present" | "partial" | "missing";
    type?: string;
    src?: string;
    key?: boolean;
    notes?: string;
    desc?: string;
    tbl?: string;
    fld?: string;
    ex?: string;
  };
  const data: DE[] = [
    // Step 1 — Build Plan Release
    { step: 1, name: "Engineering BOM",                  bind: "entry",  presence: "present", type: "BOM dataset",     src: "PDM",        key: true,  desc: "Released component requirements list that drives the kit list and SAP production order",               tbl: "SAP: MAST/STPO",       fld: "MATNR (component)",   ex: "P/N 65B32524-1" },
    { step: 1, name: "ECN Reconciliation Status",        bind: "entry",  presence: "partial", type: "status",          src: "PDM / ME",   key: true,  desc: "Confirmation that all active Engineering Change Notices are reflected in the issued traveler",        tbl: "(PDM — manual review)", fld: "ECN status",          ex: "3 of 4 ECNs incorporated", notes: "No automated check; ME manually reviews pending ECNs against the traveler at release — frequently done incompletely under schedule pressure" },
    { step: 1, name: "MSN (Manufacturing Serial Number)", bind: "entry", presence: "present", type: "string(8)",       src: "SAP PP",            key: true,  desc: "Unique serial number for this fuselage section, linking all traveler and quality records",         tbl: "SAP: AFKO",            fld: "AUFNR / serialized",  ex: "MSN-2026-1024" },
    { step: 1, name: "MES Traveler Release",        bind: "exit",   presence: "present", type: "traveler record", src: "MES system", key: false, desc: "MES traveler instance confirming this MSN's router is active and released to the floor" },

    // Step 2 — Kitting
    { step: 2, name: "SAP Component Requirements (RESB)", bind: "entry", presence: "present", type: "report",         src: "SAP MM",            key: true,  desc: "Component list generated from BOM for this production order; primary driver of the kit list",           tbl: "SAP: RESB",            fld: "MATNR, BDMNG",        ex: "P/N 65B32524-1 × 4 EA" },
    { step: 2, name: "SAP Stock Overview (MMBE)",        bind: "action", presence: "partial", type: "qty",            src: "SAP MM",            key: true,  desc: "On-hand stock balance queried to verify parts are available before kitting",                           tbl: "SAP: MARD",            fld: "LABST (unrestricted)", ex: "12 EA (system) / 0 EA (physical)", notes: "Phantom inventory causes SAP balance to overstate physical availability; MCC relies on this without physical verification before picking" },
    { step: 2, name: "Material Certification",           bind: "entry",  presence: "partial", type: "document",       src: "Supplier / SAP QM", key: true,  desc: "Certificate of Conformance or Material Test Report required for traceable raw materials and life-limited items", tbl: "SAP: QALS",           fld: "PRUEFLOS",            ex: "CoC-2026-98234",       notes: "Life-limited items (sealants, adhesives) require cert; certs sometimes arrive separately from parts, creating a temporary hold" },
    { step: 2, name: "Completed Kit Sheet",              bind: "exit",   presence: "missing", type: "document",       src: "None (paper only)", key: true,  desc: "Signed confirmation of 100% kit completeness verified before delivery to the line",                    tbl: "(paper only)", notes: "No digital confirmation exists; paper kit list with picker initials is the only record. Incomplete kits exit kitting undetected." },

    // Step 3 — Kit Inspection
    { step: 3, name: "Inspector Sign-Off Record",        bind: "exit",   presence: "missing", type: "record",         src: "None (paper stamp)", key: true, desc: "Digital record of kit inspection results and approval before delivery to the integration floor",       tbl: "(none — paper stamp only)", notes: "Inspector stamps the paper kit list; no digital record is created. Paper is not retrievable after delivery." },
    { step: 3, name: "Drawing Revision Verification",   bind: "action", presence: "partial", type: "status",          src: "PDM (manual)", key: true, desc: "Confirmation that kitted parts match the drawing revision required at time of installation",          tbl: "(PDM — manual lookup)", notes: "Inspector verifies revision from part markings against the printed kit list. ECN database is not accessible at the inspection station." },
    { step: 3, name: "Shelf-Life Check Record",         bind: "action", presence: "present", type: "date check",     src: "Material cert / part marking",  desc: "Verification that life-limited items are within their expiration window" },

    // Step 4 — Line Delivery
    { step: 4, name: "MES Kit Delivery Log",        bind: "exit",   presence: "partial", type: "timestamp",      src: "MES system", desc: "MES record of kit delivery to station with timestamp", notes: "Update is manual and frequently delayed; delivery time is unreliable for schedule tracking" },

    // Step 5 — Station Authorization
    { step: 5, name: "Tool Calibration Record",          bind: "entry",  presence: "partial", type: "certificate",    src: "Tool Crib system",  key: true,  desc: "Calibration certificate confirming all special tooling required by the traveler is within its calibration window", notes: "Calibration records exist in the tool crib system but are not linked to the MES traveler tooling requirement; Lead Mechanic verifies verbally" },
    { step: 5, name: "Kit Receipt Confirmation",         bind: "entry",  presence: "missing", type: "sign-off",       src: "None",              key: true,  desc: "Formal confirmation by Technician that the kit has been received and verified complete at the station before work begins", notes: "No formal receipt step exists. Technician begins work assuming kit is complete. PM&O is often discovered only when the missing part is reached mid-operation." },
    { step: 5, name: "Traveler Step Activation",         bind: "exit",   presence: "present", type: "MES record", src: "MES system", desc: "MES confirmation that the Lead Mechanic has activated the traveler step for this MSN at this station" },

    // Step 6 — Structural Integration
    { step: 6, name: "Fastener Lot Traceability Record", bind: "action", presence: "partial", type: "record",         src: "MES / paper traveler", key: true, desc: "Lot number and quantity of each fastener type installed in the join zone, required for FAA airworthiness traceability", tbl: "MES: traveler step record", notes: "Lot numbers are manually recorded on the paper traveler under workload; barcode scan does not link to the fastener container. Wrong lot is occasionally recorded." },
    { step: 6, name: "Shim Pack Dimension Record",       bind: "action", presence: "present", type: "record",         src: "Paper traveler",    desc: "Record of shim pack thickness used at each joint location, for as-built documentation" },
    { step: 6, name: "Dimensional Sign-Off",             bind: "exit",   presence: "present", type: "sign-off",       src: "MES / paper traveler", key: true, desc: "Lead Mechanic witness signature confirming join dimensions are within drawing tolerance before sealant cure" },

    // Step 7 — Systems Rough-In
    { step: 7, name: "Engineering Query (EQ) Log",       bind: "action", presence: "missing", type: "log",            src: "None",              key: true,  desc: "Formal log of drawing conflicts or ambiguities raised by Technicians during rough-in that require ME resolution", notes: "EQs are raised verbally or by email to the ME; no system captures open EQs, resolution timelines, or impact. EQs that take longer than expected silently consume dwell time." },
    { step: 7, name: "Harness Routing Sign-Off",         bind: "action", presence: "partial", type: "sign-off",       src: "MES traveler", desc: "MES traveler step completion confirming harness routing is complete per drawing", notes: "Step completion is recorded but specific routing deviations or deferred adjustments are not captured" },

    // Step 8 — Post-Join Inspection
    { step: 8, name: "DI Traveler Inspection Sign-Off",  bind: "exit",   presence: "present", type: "sign-off",       src: "MES system", key: true,  desc: "Designated Inspector signature on each required inspection point in the MES traveler",              tbl: "MES: inspection records" },
    { step: 8, name: "SAP Quality Notification (QN)",   bind: "exit",   presence: "partial", type: "QN record",      src: "SAP QM",            key: true,  desc: "SAP QM Quality Notification opened for each out-of-tolerance or non-conforming condition found at inspection", tbl: "SAP: QMEL", fld: "QMNUM", ex: "10000045678", notes: "Minor findings are sometimes handled verbally without a formal QN, creating an audit trail gap" },
    { step: 8, name: "Dimensional Measurement Data",    bind: "action", presence: "partial", type: "measurements",   src: "Paper traveler / CMM (where available)", key: true, desc: "Actual measured values for skin step/gap, flush, and frame station positions at the join zone", notes: "Measurements recorded on paper traveler; values are not entered into any database, so trend analysis across sections is not possible" },

    // Step 9 — Systems Test
    { step: 9, name: "Continuity Test Results",          bind: "exit",   presence: "partial", type: "test record",    src: "MES system", key: true,  desc: "Electrical continuity and insulation resistance measurements for each harness segment through the join zone", notes: "Pass/fail entered in MES; specific measured values not always recorded — traceability to root cause on failures is limited" },
    { step: 9, name: "Hydraulic Pressure Test Results",  bind: "exit",   presence: "present", type: "test record",    src: "MES traveler", desc: "Pressure test results for hydraulic lines in the integration zone" },

    // Step 10 — Section Buy-Off
    { step: 10, name: "Open OPR Status Report",          bind: "entry",  presence: "partial", type: "report",         src: "OPR tracking log (Excel)", key: true, desc: "List of all open OPRs against this MSN at time of buy-off review", notes: "Tracking log is maintained separately from SAP and MES; buy-off requires manual reconciliation of three systems. OPR status can lag actual closure by hours." },
    { step: 10, name: "Section Conformance Document",    bind: "exit",   presence: "present", type: "sign-off doc",   src: "Quality Engineering",       key: true, desc: "QE sign-off confirming all traveler steps are complete and all OPRs are closed or formally deferred" },

    // Step 11 — PM&O Discovery & OPR Initiation
    { step: 11, name: "Paper NCR at Station",            bind: "action", presence: "partial", type: "paper form",     src: "NCR form at station",       key: true, desc: "Initial paper Non-Conformance Report written by Lead Mechanic at the station at time of PM&O discovery", notes: "NCR forms are not standardized across stations. Incomplete fields (missing part revision, missing traveler step reference) create downstream problems for QE disposition." },
    { step: 11, name: "SAP Quality Notification Number", bind: "exit",   presence: "present", type: "string(10)",     src: "SAP QM (QM01)",             key: true, desc: "Unique SAP QN number assigned when the OPR is formally opened in SAP QM, used to track the OPR through resolution", tbl: "SAP: QMEL", fld: "QMNUM", ex: "10000098765" },
    { step: 11, name: "OPR Tracking Log Entry",          bind: "exit",   presence: "partial", type: "Excel row",      src: "OPR tracking log (shared Excel)", key: true, desc: "Entry in the shared Production Control OPR tracking log recording the OPR for management visibility", notes: "Not always updated same day as the SAP QN is opened; the tracking log and SAP QN frequently show conflicting status" },

    // Step 12 — MCC Search
    { step: 12, name: "SAP MMBE Stock Query",            bind: "action", presence: "partial", type: "qty",            src: "SAP MM (MMBE)",             key: true, desc: "SAP stock overview query result showing on-hand balance by storage location for the shortage part", tbl: "SAP: MARD", fld: "LABST", ex: "3 EA (system) / 0 EA (physical)", notes: "Phantom inventory: SAP balance regularly does not reflect physical stock. The gap is not systematically reconciled." },
    { step: 12, name: "Physical Search Record",          bind: "action", presence: "missing", type: "record",         src: "None",                      key: true, desc: "Written documentation of the physical bonded-stores search (locations checked, result found or not)", notes: "Physical search result is communicated verbally; no written record is created. Repeat phantom-inventory findings for the same part are not detectable from records alone." },
    { step: 12, name: "Shortage Confirmation",           bind: "exit",   presence: "partial", type: "status",         src: "OPR tracking log / email",  desc: "Written confirmation that the part is not available in stock and supply chain expedite is required" },

    // Step 13 — Engineering Impact Assessment
    { step: 13, name: "Engineering Disposition",         bind: "exit",   presence: "partial", type: "SAP QN activity", src: "SAP QM (QMMA)",            key: true, desc: "Written QE/ME disposition on OPR impact: Continue (parallel work OK), Wait, Substitute, or Defer", tbl: "SAP: QMMA", fld: "MATNR / VORGTEXT (activity text)", notes: "Disposition is frequently communicated verbally before the SAP QN activity is written. For airworthiness-relevant parts, this creates an FAA traceability gap." },
    { step: 13, name: "Downstream Traveler Dependency Check", bind: "action", presence: "partial", type: "list", src: "MES (manual review)", desc: "Assessment of which downstream MES traveler steps are blocked by the missing part", notes: "ME manually traces dependencies in MES; no automated impact analysis tool exists" },

    // Step 14 — Supply Chain Expedite
    { step: 14, name: "Confirmed Supplier Delivery Date", bind: "exit",  presence: "partial", type: "date",           src: "Supplier portal / email",   key: true, desc: "Supplier-committed delivery date entered in OPR tracking log for production schedule replanning", notes: "Supplier date commitments are frequently revised; the company has limited real-time visibility into supplier manufacturing status. Average date-slip vs. first commitment is estimated at several days." },
    { step: 14, name: "Premium Freight Authorization",   bind: "action", presence: "partial", type: "approval record", src: "Production Control / VP",  desc: "Written authorization for air freight or premium courier above the standard freight allowance", notes: "Authorization threshold requires VP approval for larger spend; creates a decision bottleneck during high-OPR periods" },

    // Step 15 — OOS Installation
    { step: 15, name: "OOS Labor Hours",                 bind: "action", presence: "missing", type: "decimal (hours)", src: "None",                     key: true, desc: "Actual direct labor hours expended on the out-of-sequence installation task, including access disassembly and re-installation of displaced components", notes: "OOS labor is not tracked separately from planned labor — it is absorbed into the Technician's general production labor code. The 2–5× cost premium of PM&O is invisible to management." },
    { step: 15, name: "OOS Installation Record in QN",   bind: "exit",   presence: "present", type: "SAP QN activity", src: "SAP QM",                   desc: "Record of out-of-sequence installation details documented in the SAP Quality Notification activity log" },
    { step: 15, name: "Access Disassembly Record",       bind: "action", presence: "missing", type: "record",          src: "None",                     desc: "Record of components removed and re-installed to gain access for OOS installation", notes: "Verbal between Lead Mechanic and Technician; re-installation is confirmed at OPR closure inspection but the access work itself is not documented" },

    // Step 16 — OPR Closure
    { step: 16, name: "DI Closure Sign-Off",             bind: "exit",   presence: "present", type: "sign-off",        src: "SAP QM",                   key: true, desc: "Designated Inspector signature on QN closure record confirming installation is correct, complete, and FOD-free" },
    { step: 16, name: "SAP QN Closure Transaction",      bind: "exit",   presence: "partial", type: "SAP transaction",  src: "SAP QM (QM02)",            key: true, desc: "SAP QM formal QN closure setting notification status to Completed with closure date", tbl: "SAP: QMEL", fld: "QMDAB (completion date)", notes: "Not all DIs have access to or are trained on the QM02 transaction; QE must complete it, adding a hand-off delay that can be 2–4 hours." },
    { step: 16, name: "MES Retroactive Traveler Update", bind: "exit", presence: "partial", type: "MES record", src: "MES system",      key: true, desc: "Retroactive completion of the affected MES traveler step to reflect OPR resolution", notes: "Retroactive updates are sometimes delayed or missed entirely, leaving the traveler in an incomplete state that re-flags at section buy-off review." },
  ];
  for (const d of data) {
    const def = repos.data_elements.create({
      value_stream_id: V,
      name: d.name,
      business_description: d.desc ?? null,
      data_type: d.type ?? null,
      source_system: d.src ?? null,
      table_or_view: d.tbl ?? null,
      field_name: d.fld ?? null,
      example_value: d.ex ?? null,
      length: null,
    });
    repos.step_data_elements.create({
      step_id: S(d.step),
      data_element_id: def.id,
      binding_point: d.bind,
      presence: d.presence,
      quality_notes: d.notes ?? null,
      is_key: d.key ?? false,
    });
  }

  // ---- metrics -------------------------------------------------------------
  type MetricRow = [string, string, string, number, number, number, boolean, string];
  const metrics: MetricRow[] = [
    ["OPR Open Count per Section",           "OPRs/section",          "inventory_wip",    18,   22,   5,    true,  "OPR tracking log (shared Excel)"],
    ["PM&O OPR Average Age",                 "days open",             "lead_time",         7,    9,   3,    true,  "OPR tracking log"],
    ["Kit Completeness Rate at Line Delivery", "%",                   "quality",           87,   85,  98,   true,  "Kit inspection records (paper, notional)"],
    ["Section Flow Days vs. Plan",           "days over plan",        "lead_time",          4,    6,   0,    false, "Production Control schedule"],
    ["First-Pass Section Buy-Off Rate",      "%",                     "quality",           72,   68,  95,   false, "Quality department records"],
    ["OOS Labor Premium per Section",        "hours/section",         "operating_expense", 40,   55,   0,   false, "Estimated — OOS labor not formally tracked separately from planned labor"],
    ["PM&O OPR Rate",                        "OPRs/100 install ops",  "quality",           3.2,  3.8,  0.5, false, "OPR tracking log vs. MES work content (notional ratio)"],
    ["Section Throughput",                   "sections/month",        "throughput",        28,   25,  31,   false, "Production Control"],
  ];
  for (const [name, unit, type, base, cur, tgt, leading, src] of metrics) {
    repos.metrics.create({
      value_stream_id: V,
      name, unit,
      metric_type: type as "quality" | "lead_time" | "throughput" | "inventory_wip" | "operating_expense",
      baseline_value: base,
      current_value: cur,
      target_value: tgt,
      is_leading: leading,
      source: src,
    });
  }

  // ---- constraints ---------------------------------------------------------
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
      title: "PM&O OPR Backlog (System Constraint)",
      desc: "The accumulated backlog of open PM&O OPRs is the governing constraint on section flow rate. With an average of 22 open OPRs per section, each requiring MCC search, engineering assessment, potential supply chain expedite, out-of-sequence installation, and DI closure inspection, the OPR process competes for every bottleneck resource — DI time, QE time, and floor access — and holds sections at station past their planned dwell window. The constraint manifests visibly at Section Buy-Off (Step 10) where open OPRs are the primary driver of schedule slip.",
      kind: "constraint", target: "value_stream", sev: "critical", toc: "identified", sys: true,
    },
    {
      title: "BOM Accuracy and ECN Timing Gap",
      desc: "Engineering Change Notices arrive after kits are pulled, silently changing the part requirement. More than 40% of PM&O OPRs (notional Pareto) trace to a mismatch between the issued kit list (reflecting the BOM at kit-pull time) and the drawing revision at point of installation. the company has no automated downstream notification when a BOM changes against an already-released kit or active traveler.",
      kind: "constraint", target: "step", step: 1, sev: "high", toc: "identified",
    },
    {
      title: "Phantom Inventory in SAP Bonded Stores",
      desc: "SAP on-hand balances in bonded stores regularly overstate physical availability. Root causes include unreversed mis-picks, parts sitting in Quality Hold that are system-blocked but physically present, and delayed receiving transactions. MCC cites phantom inventory as the top cause of unexpected shortages at kitting. Each phantom finding requires a SAP MI07 physical inventory document that adds administrative time and cannot be completed before the expedite must begin.",
      kind: "breakdown", target: "step", step: 2, sev: "high",
    },
    {
      title: "No Digital Kit Completeness Verification",
      desc: "Kit verification is performed by eye against a printed list with no barcode scan or system-enforced completeness check. There is no automated comparison between the MES kit list and the physical kit contents. A mismatch that is not caught here becomes a PM&O OPR on the integration floor, where the recovery cost is 2–5× the cost of catching it at kit inspection.",
      kind: "breakdown", target: "step", step: 3, sev: "high",
    },
    {
      title: "DI Availability Bottleneck",
      desc: "Designated Inspectors are the scheduling constraint at both Post-Join Inspection (Step 8) and OPR Closure Inspection (Step 16). One DI may carry sign-off responsibility for 3–4 concurrent sections. The OPR closure inspection queue competes directly with normal traveler sign-off requests, creating a feedback loop: high OPR volume means more DI time on closures, which delays normal build sign-offs, which extends section dwell time, which delays the next section from entering the fixture.",
      kind: "constraint", target: "step", step: 8, sev: "high", toc: "identified",
    },
    {
      title: "No Kit Receipt Confirmation at Station",
      desc: "There is no formal step where a Technician confirms the kit is complete before beginning installation work. Technicians begin work assuming the kit is correct, and PM&O is discovered only when the missing part is physically needed — often mid-operation, after work has started and access constraints have increased.",
      kind: "breakdown", target: "step", step: 5, sev: "high",
    },
    {
      title: "Single-Source Proprietary Parts Supply Risk",
      desc: "company-designed and company-sole-sourced parts — specific brackets, doublers, composite clips, and window-frame details — have no FAA-qualified alternate source. When these are the missing part, the section may sit at station for 10–21 days waiting for the supplier to manufacture and deliver a new run. the company has limited real-time visibility into supplier subcomponent availability, making expedite date-promises frequently unreliable.",
      kind: "risk", target: "step", step: 14, sev: "high", like: "medium",
    },
    {
      title: "OPR Tracking Disconnected from SAP and MES",
      desc: "The OPR backlog is maintained in a shared Excel spreadsheet that is not integrated with SAP QM or MES. This creates three separate data sources that must be manually reconciled at Section Buy-Off (Step 10), introduces transcription errors, and makes real-time OPR visibility impossible from any production dashboard or executive report. Status discrepancies between the Excel and SAP QN are common.",
      kind: "breakdown", target: "value_stream", sev: "high",
    },
    {
      title: "OOS Installation Physical Access Constraint",
      desc: "Out-of-sequence installation into a structurally closed or systems-populated section requires partial disassembly, non-standard access equipment, and re-installation of displaced components. Direct labor hours for OOS installation routinely run 2–5× the planned task hours. This premium is not tracked separately — it is absorbed into the Technician's general labor code — making the true cost of PM&O invisible to both operations management and the program cost model.",
      kind: "pain_point", target: "step", step: 15, sev: "medium",
    },
    {
      title: "Informal Engineering Disposition Practice",
      desc: "Engineering dispositions on OPRs are frequently communicated verbally before the formal SAP QN activity record is written. For structurally or airworthiness-relevant parts, this creates an FAA traceability gap where the formal record does not reflect the actual decision sequence. The seam between the verbal disposition and the written record is a recurring audit finding.",
      kind: "seam", target: "step", step: 13, sev: "medium",
    },
    {
      title: "Buy-Off OPR Backlog Batch Closure Crunch",
      desc: "When OPRs are not closed continuously through the build, they accumulate and create a batch-closure crunch at Section Buy-Off. This is the most visible manifestation of the systemic PM&O problem and the primary driver of end-of-period overtime, emergency freight, and VP-level involvement. Closing 15–20 OPRs in the final 2–3 days before the section ship date is a recurring pattern.",
      kind: "seam", target: "step", step: 10, sev: "high",
    },
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

  // ---- flow edges ----------------------------------------------------------
  // Normal integration sequence spine (Steps 1–10)
  for (let i = 1; i < 10; i++) {
    repos.flow_edges.create({ value_stream_id: V, from_type: "step", from_id: S(i), to_type: "step", to_id: S(i + 1), edge_type: "sequence", notes: null });
  }
  // OPR reactive path sequence spine (Steps 11–16)
  for (let i = 11; i < 16; i++) {
    repos.flow_edges.create({ value_stream_id: V, from_type: "step", from_id: S(i), to_type: "step", to_id: S(i + 1), edge_type: "sequence", notes: null });
  }
  // Cross-cutting edges: OPR branch triggers and resolution paths
  const cross: { from: ["step" | "persona", number]; to: ["step" | "persona", number]; type: "dependency" | "handoff" | "data_flow"; notes: string }[] = [
    { from: ["step", 5],   to: ["step", 11],  type: "dependency", notes: "PM&O most commonly discovered when Technician first opens the kit at station authorization." },
    { from: ["step", 6],   to: ["step", 11],  type: "dependency", notes: "PM&O also discovered mid-structural-integration when a specific fastener or splice plate is physically needed and absent from the kit." },
    { from: ["step", 15],  to: ["step", 6],   type: "dependency", notes: "Successful OOS installation unblocks the structural or systems step that was waiting on the missing part." },
    { from: ["step", 16],  to: ["step", 10],  type: "dependency", notes: "OPR must be formally closed in SAP and MES before the section is eligible for buy-off." },
    { from: ["step", 2],   to: ["step", 11],  type: "dependency", notes: "Kit completeness failures originating in kitting (phantom inventory, BOM errors) are the upstream root cause of the majority of PM&O OPRs at station." },
    { from: ["persona", 5], to: ["step", 8],  type: "handoff",    notes: "DI availability gates the start of post-join dimensional inspection; DI cannot be substituted." },
    { from: ["persona", 5], to: ["step", 16], type: "handoff",    notes: "Same DI resource gates OPR closure inspection — competing demand with normal traveler sign-offs." },
    { from: ["persona", 6], to: ["step", 10], type: "handoff",    notes: "QE availability gates section buy-off; QE must personally review the complete traveler and OPR closure status." },
    { from: ["persona", 6], to: ["step", 13], type: "handoff",    notes: "QE is required for engineering impact assessment on every OPR before the expedite path can be authorized." },
    { from: ["step", 3],    to: ["step", 5],  type: "data_flow",  notes: "Signed kit list from kit inspection is the authorization that the kit is complete and correct for the station." },
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

  const added = seedAviationCoSubSteps();
  return { seeded: true, subStepsAdded: added };
}

// ---------------------------------------------------------------------------
// Sub-steps: drill-down into Step 6 (Structural Integration — the constrained
// operation) and Step 11 (PM&O Discovery — the OPR trigger event).
// Additive and idempotent.
// ---------------------------------------------------------------------------
export function seedAviationCoSubSteps(): number {
  runMigrations();
  if (!repos.process_steps.get(S(6), { includeDeleted: true })) return 0;

  let added = 0;

  // ---- Sub-steps of Step 6: Structural Integration -------------------------
  if (!repos.process_steps.get(FS6(1), { includeDeleted: true })) {
    const s6Subs: { n: number; name: string; entry: string; action: string; exit: string; cycle: number; wait: number; pca: number; pain?: string }[] = [
      { n: 1, name: "Position & Align Barrel Sections",
        entry: "Barrel sections on the integration floor; join fixture set up per tooling drawing",
        action: "Position forward and aft barrel sections in the join fixture jigs; align using laser tracker to station, waterline, and buttline datums; verify alignment per dimensional check sheet",
        exit: "Sections aligned within tolerance per dimensional check sheet; Lead Mechanic approves alignment before drilling",
        cycle: 0.5, wait: 0.5, pca: 88 },
      { n: 2, name: "Fit-Up, Shim Selection & Sealant Application",
        entry: "Sections aligned in fixture",
        action: "Fit-up the joint interface; measure and select shim pack to achieve design gap at each fastener row; apply faying surface sealant per drawing callout within pot-life window; complete fit-up before sealant working time expires",
        exit: "Sealant applied; shim pack thicknesses recorded on traveler; joint clamped and ready for drilling",
        cycle: 1.0, wait: 0.5, pca: 80,
        pain: "Sealant has a fixed pot life (working time). If shim selection or fit-up takes longer than planned, the sealant batch must be discarded and re-applied, adding material cost and dwell time. Shim packs are cut from stock — if the required thickness is not in the kit, a PM&O OPR is raised immediately and the joint cannot be sealed until resolved." },
      { n: 3, name: "Drill, Ream & Deburr Fastener Holes",
        entry: "Sealant applied; joint clamped within working time",
        action: "Drill fastener holes through the splice plate and skin using the drill template; ream each hole to drawing diameter and tolerance; deburr on both sides per drawing note; blow clean with dry air; Lead Mechanic spot-checks hole diameter sample",
        exit: "All fastener holes drilled, reamed, and deburred; sample diameter check recorded on traveler",
        cycle: 1.5, wait: 0.5, pca: 87 },
      { n: 4, name: "Install Fasteners & Witness Torque",
        entry: "Holes complete; correct fasteners (Hi-Loks, Lockbolts, or structural bolts per drawing) at station from kit",
        action: "Install fasteners per drawing — correct part number, diameter, grip length, and collar for Hi-Loks; torque or pull-up per drawing torque table; apply witness marks on fastener heads; Lead Mechanic witnesses torque on all critical fastener rows per traveler",
        exit: "All fasteners installed and torqued per drawing; fastener lot numbers recorded on traveler; witness marks applied",
        cycle: 1.5, wait: 0.5, pca: 84,
        pain: "Fasteners of the wrong diameter, grip length, or material (titanium vs. steel) create an immediate PM&O OPR — no substitution is permitted. Incorrect fasteners discovered after installation require removal, hole inspection for damage, and potential Engineering disposition before re-installation, adding rework labor and structural risk." },
      { n: 5, name: "Install Frames, Shear Ties & Join-Zone Clips",
        entry: "Fasteners installed; frames and shear tie parts from kit at station",
        action: "Install station frames, shear ties, and attachment clips through the join zone per drawing; secure to skin and primary structure using specified fasteners; verify part numbers and orientations against drawing",
        exit: "Join-zone structural elements complete; Lead Mechanic inspects and signs traveler step; section cleared for systems rough-in",
        cycle: 0.5, wait: 0.0, pca: 85 },
    ];
    for (const s of s6Subs) {
      repos.process_steps.create(
        { value_stream_id: V, parent_step_id: S(6), name: s.name, sequence_index: s.n - 1, entry_criteria: s.entry, action: s.action, exit_criteria: s.exit, pain_points: s.pain ?? null, cycle_time: s.cycle, wait_time: s.wait, pct_complete_accurate: s.pca },
        FS6(s.n),
      );
      added++;
      repos.step_personas.create({ step_id: FS6(s.n), persona_id: P(1), role_on_step: "executor" });
      if (s.n >= 4) repos.step_personas.create({ step_id: FS6(s.n), persona_id: P(2), role_on_step: "approver" });
    }
    // DI consulted on the final structural sign-off
    repos.step_personas.create({ step_id: FS6(5), persona_id: P(5), role_on_step: "consulted" });
    // Data elements on the two highest-risk sub-steps
    const ftLot = repos.data_elements.create({ value_stream_id: V, name: "Fastener lot number (per row)", business_description: "Lot number of fasteners installed in each row of the join splice, required for airworthiness traceability", data_type: "string(20)", source_system: "Paper traveler / MES", table_or_view: "MES: traveler step record", field_name: "lot_ref (manual entry)", example_value: "LOT-2026-A44921", length: null });
    repos.step_data_elements.create({ step_id: FS6(4), data_element_id: ftLot.id, binding_point: "action", presence: "partial", quality_notes: "Lot numbers recorded manually under workload; barcode scan not used. Wrong lot occasionally recorded.", is_key: true });
    const shimRec = repos.data_elements.create({ value_stream_id: V, name: "Shim pack selection record", business_description: "Thickness and location of each shim pack used at the joint interface", data_type: "record", source_system: "Paper traveler", table_or_view: "(paper traveler)", field_name: "shim_loc / shim_thk", example_value: "Sta 380 / 0.012 in.", length: null });
    repos.step_data_elements.create({ step_id: FS6(2), data_element_id: shimRec.id, binding_point: "action", presence: "present", quality_notes: null, is_key: false });
    // Sequence spine
    for (let i = 1; i < s6Subs.length; i++) {
      repos.flow_edges.create({ value_stream_id: V, from_type: "step", from_id: FS6(i), to_type: "step", to_id: FS6(i + 1), edge_type: "sequence", notes: null });
    }
  }

  // ---- Sub-steps of Step 11: PM&O Discovery & OPR Initiation ---------------
  if (!repos.process_steps.get(FS11(1), { includeDeleted: true })) {
    const s11Subs: { n: number; name: string; entry: string; action: string; exit: string; cycle: number; wait: number; pca: number; pain?: string }[] = [
      { n: 1, name: "Informal Parts Search at Station",
        entry: "Technician cannot locate a part that should be in the station kit",
        action: "Technician checks all containers in the kit; checks the station floor and staging rack for misplaced items; asks nearby Technicians and Lead Mechanic if the part was seen or borrowed from the kit",
        exit: "Part found (OPR avoided) OR part confirmed not at station (escalate to Lead Mechanic)",
        cycle: 0.25, wait: 0, pca: 50,
        pain: "The informal search is not tracked and its duration is not captured anywhere. Searches typically run 1–4 hours before formal escalation. During this time, the Technician is partially working around the missing part — productive time is lost but not classified as OPR time, so the full cost of PM&O discovery is understated." },
      { n: 2, name: "Lead Mechanic Notification & Triage",
        entry: "Informal search unsuccessful; Technician notifies Lead Mechanic",
        action: "Lead Mechanic confirms the part is missing from the kit; determines whether work can continue at other traveler steps (parallel path) or whether the station is blocked; makes the decision to proceed to formal OPR initiation; notifies Production Control and MCC",
        exit: "OPR decision made; station impact assessed (blocked vs. parallel work available); MCC and Production Control notified",
        cycle: 0.25, wait: 0.25, pca: 80 },
      { n: 3, name: "Paper NCR Written at Station",
        entry: "OPR decision confirmed by Lead Mechanic",
        action: "Lead Mechanic completes a paper Non-Conformance Report (NCR) form at the station: records part number, quantity short, revision level, MSN, station, traveler step reference, and date/time of discovery; countersigned by Technician",
        exit: "Completed and countersigned paper NCR at station; first formal written record of the PM&O event",
        cycle: 0.25, wait: 0.25, pca: 70,
        pain: "NCR forms are not standardized across all stations — some Lead Mechanics use the approved form, others use blank paper or notebook entries. Incomplete NCR fields (missing part revision, missing traveler step reference) create downstream problems when the QE must formally disposition the OPR in SAP." },
      { n: 4, name: "SAP Quality Notification Opened (QM01)",
        entry: "Completed paper NCR",
        action: "Lead Mechanic or MCC opens a SAP QM Quality Notification (transaction QM01) entering: defect category (PM&O), part number, quantity short, revision, MSN, station, traveler step reference, and discovery date; assigns MCC to the search activity",
        exit: "SAP QN number assigned and QN status set to Open; OPR backlog count incremented by one",
        cycle: 0.25, wait: 0.5, pca: 62,
        pain: "SAP QM access is not available at all floor terminals on the integration line. The Lead Mechanic must walk to an office terminal or wait for a shared terminal, resulting in QN open-time lagging the actual NCR write-up by 1–3 hours. The QN open-date is therefore not a reliable proxy for the true time of PM&O discovery, distorting age-of-OPR metrics." },
      { n: 5, name: "Production Control Schedule Impact Assessment",
        entry: "SAP QN opened; station impact (blocked vs. parallel) confirmed by Lead Mechanic",
        action: "Production Control Manager is formally notified of the OPR and its station impact; updates the section schedule in the tracking system to reflect potential delay; enters the OPR in the shared OPR tracking log (Excel); escalates to Section VSM if the delay threatens the section ship date",
        exit: "OPR tracking log updated; section schedule revised to show delay risk; Section VSM aware if ship date at risk",
        cycle: 0.25, wait: 0.5, pca: 65,
        pain: "The OPR tracking log (Excel) must be updated separately from the SAP QN — two manual updates from the same data source. Inconsistencies between the SAP QN and the tracking log are common, and both are reviewed at buy-off. Conflicting status between the two records is a recurring frustration during section buy-off review." },
    ];
    for (const s of s11Subs) {
      repos.process_steps.create(
        { value_stream_id: V, parent_step_id: S(11), name: s.name, sequence_index: s.n - 1, entry_criteria: s.entry, action: s.action, exit_criteria: s.exit, pain_points: s.pain ?? null, cycle_time: s.cycle, wait_time: s.wait, pct_complete_accurate: s.pca },
        FS11(s.n),
      );
      added++;
      repos.step_personas.create({ step_id: FS11(s.n), persona_id: P(2), role_on_step: "executor" });
    }
    // Technician executes sub-steps 1 and 3; Production Control executes step 5
    repos.step_personas.create({ step_id: FS11(1), persona_id: P(1),  role_on_step: "executor" });
    repos.step_personas.create({ step_id: FS11(3), persona_id: P(1),  role_on_step: "consulted" });
    repos.step_personas.create({ step_id: FS11(5), persona_id: P(4),  role_on_step: "executor" });
    repos.step_personas.create({ step_id: FS11(5), persona_id: P(11), role_on_step: "informed" });
    // Data elements inside the OPR initiation drill-down
    const ncrForm = repos.data_elements.create({ value_stream_id: V, name: "Paper NCR (at station)", business_description: "Initial paper Non-Conformance Report completed by Lead Mechanic at station at time of PM&O discovery", data_type: "paper form", source_system: "NCR form at station", table_or_view: "(paper)", field_name: "—", example_value: "NCR form station A-32, date 2026-06-22", length: null });
    repos.step_data_elements.create({ step_id: FS11(3), data_element_id: ncrForm.id, binding_point: "exit", presence: "partial", quality_notes: "Forms not standardized; incomplete fields are common. Paper NCR is not retrievable electronically after departure from the station.", is_key: true });
    const sapQnId = repos.data_elements.create({ value_stream_id: V, name: "SAP QN number (PM&O)", business_description: "Unique SAP Quality Notification number assigned when the OPR is formally opened, used to track the OPR through to closure", data_type: "string(10)", source_system: "SAP QM (QM01)", table_or_view: "SAP: QMEL", field_name: "QMNUM", example_value: "10000098765", length: null });
    repos.step_data_elements.create({ step_id: FS11(4), data_element_id: sapQnId.id, binding_point: "exit", presence: "present", quality_notes: "QN open date lags actual discovery time by 1–3 hours; not a reliable timestamp for age-of-OPR metrics.", is_key: true });
    // Sequence spine
    for (let i = 1; i < s11Subs.length; i++) {
      repos.flow_edges.create({ value_stream_id: V, from_type: "step", from_id: FS11(i), to_type: "step", to_id: FS11(i + 1), edge_type: "sequence", notes: null });
    }
  }

  return added;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = seedAviationCo();
  const base = r.seeded ? "Aviation Company fuselage integration engagement inserted" : "already present";
  const subs = r.subStepsAdded > 0 ? `; added ${r.subStepsAdded} sub-steps` : "";
  console.log(`[seed:aviation-co] ${base}${subs}`);
}
