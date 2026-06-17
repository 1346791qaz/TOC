# Decisions & Assumptions

Notable choices made during the build, per the brief's instruction to record
assumptions inline rather than pausing.

## Project structure

- **Single repo, single `package.json`** (not workspaces). Client (Vite),
  server (tsx), and `shared/` Zod schemas all resolve via the `@shared` / `@`
  path aliases. This keeps the one-command `npm run dev` simple and lets the
  same Zod schemas be the single source of truth on both sides.
- **Extensionless internal imports.** Relative/alias imports omit file
  extensions so the same source resolves cleanly under Vite (client), tsx
  (server), and `tsc`. Mixed `.js` extensions broke Vite's handling of files in
  `shared/`.

## shadcn/ui

- The brief specifies shadcn/ui. Rather than run the interactive `shadcn` CLI
  (network/interactive, and it scaffolds Radix-heavy components we don't all
  need), I **hand-authored shadcn-style primitives** (`components/ui/`) using
  the same Tailwind + CVA conventions and the project's design tokens. This is
  deterministic, offline, and dependency-light. Swapping in CLI-generated
  components later is mechanical.
- Native `<select>` is used (styled) instead of a Radix popover select, for
  density and zero extra dependencies.

## Data layer

- **better-sqlite3 (synchronous)** with a generic `Repository` that is
  soft-delete-aware. Booleans are stored as INTEGER 0/1 and converted at the
  repository boundary (the only columns are `is_leading`, `is_key`,
  `is_system_constraint`).
- **Foreign keys** are declared for the structural relationships
  (`engagement_id`, `value_stream_id`, `step_id`, `persona_id`). The
  *polymorphic* references (`constraints.target_id`, `flow_edges.from_id/to_id`)
  are intentionally **not** FK-constrained, since their target table varies by
  `target_type` / `from_type`. Referential integrity for these is the UI's job.
- **Soft delete + foreign keys:** queries filter `deleted_at IS NULL`, but FKs
  reference rows regardless of delete state, so soft-deleting a parent does not
  cascade. This matches the brief ("FKs respect soft delete" at the query
  layer) and keeps Trash/Restore lossless. A parent can be restored
  independently of its children.

## Constraint-candidate scoring

- Implemented as a **pure function** (`shared/scoring.ts`) over in-memory
  domain data, so it is trivially unit-testable and could also run client-side.
  Point weights are explicit constants and every contributing factor is
  returned with its own point value — no black-box score. The panel and the
  README document the signals.
- The ">1 active system constraint" rule is a **soft warning**
  (`/analytics/system-constraint-check`), surfaced in the Constraint Register,
  never a hard block — as specified.

## Export / import

- The engagement bundle preserves ids for a **lossless** round-trip into a clean
  DB. If any id collides with an existing row, **all** ids in the bundle are
  remapped to fresh UUIDs, and any field whose value is a known id is rewritten
  — this generically fixes FKs *and* the polymorphic target/edge references.
- Export includes soft-deleted rows so Trash state survives a round-trip.

## OIL canvas

- **@xyflow/react + elkjs** layered (Sugiyama) layout, left-to-right. elk runs
  via `elk.bundled.js` (self-contained, no separate worker file) so it works in
  the browser offline.
- Constraints render as **overlay badges** on their target node (sized by
  severity, ★ for the system constraint) rather than as separate nodes, keeping
  the graph readable. Data elements and personas are separate nodes gated by
  layer toggles. "Constraint focus" highlights the system constraint and its
  downstream (subordinate) reachable set, dimming the rest.
- Detail-drawer edits write through via a Save button + query invalidation
  (effectively optimistic given the local, synchronous DB). True React Query
  optimistic mutations could be layered on later.

## Tauri upgrade path

The app is structured so a later wrap in **Tauri v2** is feasible without a
rewrite. All persistence is already behind a thin data-access module
(`server/src/repositories/Repository` + the route layer), and the client never
scatters raw `fetch` calls — it goes through `client/src/lib/api.ts`. To move to
Tauri: keep `better-sqlite3` logic in a Rust-invoked sidecar **or** port the
repository methods to Tauri commands backed by `tauri-plugin-sql`, then point
`lib/api.ts` at `@tauri-apps/api/core`'s `invoke` instead of HTTP. Because the
Zod schemas in `shared/` define every payload shape, the command surface maps
one-to-one to the current REST endpoints. No Rust was introduced now.

## Scope / non-goals honored

No auth, no cloud sync, no multi-user, no arbitrary Visio/Lucidchart/BPMN
parsing (structured CSV/JSON only), no AI/LLM features (scoring is
deterministic), desktop-width only.
