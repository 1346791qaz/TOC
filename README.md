# OIL · Constraint Mapper

A **local-first** analysis console for mapping large, complex manufacturing
organizations and finding, engaging, and exploiting the **system constraint**
per the Theory of Constraints (Goldratt's Five Focusing Steps).

The app is the software instantiation of an **Operational Intelligence Layer
(OIL)**: personas, process steps, and the data bound to each step, organized in
dependency sequence, so an analyst can see where flow chokes and rank constraint
candidates.

Everything persists locally in SQLite. No cloud, no auth, no telemetry. Runs
fully offline.

---

## Quick start

```bash
npm install
npm run dev
```

`npm run dev` runs the local API (Express + better-sqlite3, port **3001**) and
the web client (Vite + React, port **5173**) together via `concurrently`.
Open **http://localhost:5173**. On first run the database is created, migrated,
and **seeded** with a realistic CNC machined-parts value stream so the UI is
never empty.

Other scripts:

| Command            | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| `npm run migrate`  | Apply pending migrations                            |
| `npm run seed`     | Insert the seed engagement (idempotent)             |
| `npm run typecheck`| `tsc -b --noEmit` across client / server / shared   |
| `npm test`         | Vitest suites (soft delete, scoring, round-trip)    |
| `npm run build`    | Typecheck + production client build                 |

The SQLite file lives at `data/oil.sqlite` (gitignored). Delete it to start
fresh; `npm run dev` will recreate and re-seed.

---

## Architecture

```
shared/         Zod schemas + enums (single source of truth, used by both sides)
                scoring.ts (constraint-candidate ranking), gaps.ts, csv.ts
server/src/
  db/           connection, migration runner, migrations/*.sql, seed
  repositories/ generic soft-delete-aware data access (Repository)
  routes/       crud (per entity), analytics (gaps/candidates), io (export/import)
  io/           portable bundle export/import, structured CSV/JSON import
client/src/
  lib/          api client, TanStack Query hooks, display tokens, form configs
  components/    UI primitives, EntityForm, modals, left rail, command palette
  views/         one view per feature; views/canvas/* is the React Flow OIL graph
```

- **Typed end to end.** TypeScript strict; Zod schemas are shared, so client
  and server validate the same shapes.
- **Soft delete everywhere.** Every table has `deleted_at`; default queries
  exclude soft-deleted rows; the **Trash** view restores them. There is no
  hard-delete path in the UI or API.
- **Migrations, not ad-hoc DDL.** Versioned `NNN_*.sql` files applied by a
  tracked runner. Seed data is idempotent (fixed UUIDs).

### Data model

`Engagement → Value Stream → { Personas, Process Steps, Data Elements,
Constraints } + explicit dependency edges`. Process steps carry
entry/action/exit criteria, Lean timings, pain points, and a step-level **data
landscape** (source systems, databases, tables, ETL jobs). Steps nest
recursively via `parent_step_id` (drill into a step to map its sub-steps). Data
elements bind to a step's entry/action/exit with a `presence`
(present/partial/missing) flag and a granular data-point detail (business
description, source/target table-or-view + field name, type, example value); the
`constraints` table covers the whole flow-blocker family (constraint / risk /
breakdown / pain point / seam) with the Five Focusing Steps lifecycle
(`identified → exploit → subordinate → elevate → broken`).

### Constraint-candidate ranking (decision support, not a verdict)

The **Constraint Candidates** panel computes a transparent, deterministic score
per step/persona from these signals, showing every contributing factor:

- missing / partial **key** data on a step (the OIL is blind there),
- **bottleneck topology** (many dependencies converge, no alternative path),
- **queue accumulation** (wait time ≫ cycle time),
- **persona overload** across high-severity steps,
- **severe constraints** (critical / breakdown) logged on a step.

The analyst confirms the system constraint; the app supports the *Identify*
decision, it does not automate the judgment.

---

## Import templates

The **Import / Export** view supports a portable engagement bundle (JSON,
re-importable and lossless) and **structured** CSV/JSON import for bulk entry.

> Scope boundary (v1): structured rows only. No Visio / Lucidchart / BPMN
> parsing.

Paste CSV (header row required) or a JSON array of objects. Column templates:

**process_steps**
```
name,sequence_index,entry_criteria,action,exit_criteria,cycle_time,wait_time,pct_complete_accurate
```

**personas**
```
name,role_title,function,scope_level,responsibilities,authority_notes
```

**data_elements** (resolved to a step by `step_name`)
```
step_name,name,business_description,binding_point,presence,source_system,table_or_view,field_name,data_type,example_value,is_key,quality_notes
```

`scope_level` ∈ local|stream|system · `binding_point` ∈ entry|action|exit ·
`presence` ∈ present|partial|missing · `is_key` accepts true/1/yes.

---

## Testing

```bash
npm test
```

Covers the soft-delete query layer, the constraint-candidate scoring function,
and the engagement export/import round-trip (including id remapping on
collision).

### End-to-end (Playwright)

```bash
npm run test:e2e
```

A 13-test browser suite drives every feature against a freshly seeded database
(steps CRUD + RACI + data binding, persona scope filter, gap report, constraint
register, candidate ranking + promotion, metrics, assumptions, the OIL canvas
with layout modes / layer toggles / inline-edit / drag-to-connect, command
palette, trash & restore, structured import + engagement export). The suite
starts the app automatically; if the app is already running on
`localhost:5173` it reuses it. Screenshots are written to `e2e/__screens__/`.

> Note: the suite expects each run to start from a clean seed. When driving the
> app yourself, point it at a throwaway DB:
> `OIL_DB_PATH=data/e2e.sqlite npm run seed && OIL_DB_PATH=data/e2e.sqlite npm run dev`.
