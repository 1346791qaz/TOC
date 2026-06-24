# CLAUDE.md — Working Agreement for This Project

This file tells Claude how to behave in this project. Read it at the start of every session.

---

## Who I Am

I am a non-technical user. I can't read code. Treat me like a smart person who just doesn't know programming — explain things in plain English, use analogies, and never assume I understand jargon like "async", "hydration", "SSR", "monorepo", or similar terms. If you must use a technical term, define it in the same sentence.

---

## Communication Rules

**Always explain tradeoffs in plain English.**
Before doing anything non-trivial, tell me: what we're doing, why, and what the downside is if there is one. One short paragraph is enough. Don't skip this even if the task seems obvious to you.

**Flag bad ideas before executing them.**
If I ask for something that is slow, wasteful, fragile, or violates common sense in software, say so first. Give me one sentence explaining the problem and propose the better path. Then ask if I want to proceed with my original idea or the better one. Never silently do the expensive/wrong thing.

**No jargon without a plain-English translation.**
Bad: "We need to refactor this into a higher-order component."
Good: "We need to rewrite this so the same logic can be reused in multiple places — it'll save us time later."

---

## Protecting My Token / Context Budget

**Warn before dumping large output.**
If any action is about to print more than ~50 lines into our conversation (running a full test suite, printing a large file, generating a long diff), warn me first. Example: "This will print about 200 lines of test output — do you want me to summarize it instead, or show only failures?"

**Tell me when to run /clear.**
When the conversation is getting long and you notice it approaching the context limit, proactively tell me: "We should run /clear soon to save your usage — here's a quick summary of where we are so you can paste it back after clearing." This is one of the most important things you can do to protect my subscription.

**Don't repeat large blocks of code in chat.**
When you show me code changes, show only the changed lines with a little context, not the whole file.

---

## Testing Rules

### Two-Tier Approach

**During iteration (fixing a bug, building a feature):**
Run only the specific test file(s) that cover what we just changed. Use:
```
npx vitest run <test-file-path> --reporter=dot
```
This is fast and focused. Tell me which file you're targeting and why.

**At checkpoints (before a commit, end of a feature, before pushing):**
Run the full unit test suite:
```
npm test
```
And only run end-to-end (browser) tests if we changed something that affects the full user flow:
```
npm run test:e2e
```
Explicitly tell me "we're at a checkpoint — running the full suite now" so I know why it's slower.

**Always tell me before running e2e tests** — they spin up the full app and take 30–120 seconds.

### Show Only Failures

When running tests, never paste the full pass log into chat. Only show:
- The count of tests that passed (one line)
- The full detail for any test that failed

If all tests pass, just say "All N tests passed."

---

## Model Selection

**Default to Sonnet for all routine work.**
Routine work includes: writing code, fixing bugs, reading files, running tests, explaining things, writing CLAUDE.md updates.

**Tell me explicitly before switching to Opus.**
Only switch to Opus when the task is genuinely hard: complex architectural decisions, debugging a subtle multi-system interaction, reviewing a large design, or when Sonnet has already failed at the same task. Say something like: "This problem is complex enough that I'd recommend switching to Opus for this — it costs more per message but is less likely to make a mistake here. Want me to switch?"

**Switch back to Sonnet after the hard task is done.**
Don't stay on Opus for the follow-up routine work.

---

## Project Context

**App:** Value Stream Model Engine (VSME) — a local-first Theory of Constraints analysis console by Nexum Solutions.
**Stack:** React frontend (Vite), Express backend, SQLite database (better-sqlite3), TypeScript throughout.
**Test setup:**
- Unit/integration tests: Vitest, covering `server/` and `shared/` (4 test files currently)
- End-to-end tests: Playwright browser tests in `e2e/`

**Git branch for development:** `claude/friendly-thompson-gh5l7u`

---

## Commit Habits

Before committing, always:
1. Run the full unit test suite (`npm test`)
2. Run typecheck (`npm run typecheck`)
3. Tell me the results in plain English before committing

---

## E2E Test Structure

The `e2e/` folder is modular:

| File | Purpose |
|---|---|
| `helpers.ts` | Shared utilities: `gotoApp`, `nav`, `confirmDialog` |
| `oil.spec.ts` | Full serial regression walk-through of every feature (runs in order) |
| `data-elements.spec.ts` | Focused tests for Data Elements: catalog section, catalog edit, BindDataModal tabs |
| `delete-confirm.spec.ts` | Regression for the ConfirmDialog delete pattern (No cancels / Yes deletes) |

**Rules for new tests:**
- Add a new spec file (e.g. `metrics.spec.ts`) for any major feature area — don't pile everything into `oil.spec.ts`.
- Use `test.describe.configure({ mode: "serial" })` in every spec file so tests in that file run in order.
- Import `gotoApp`, `nav`, and `confirmDialog` from `./helpers` — never redefine them inline.
- Each spec file must be self-contained: create any data it needs, don't depend on data created by other spec files.
- After any change that affects delete behavior, ConfirmDialog wiring, or a modal form: add or update a test in the relevant spec file.
- The `confirmDialog(page)` helper in `helpers.ts` clicks "Yes" in the styled ConfirmDialog modal. Use it whenever testing a delete flow — do NOT use `page.on("dialog", ...)` (native confirm is gone).

**Key test IDs to know:**
- `data-testid="modal"` — any open Modal/ConfirmDialog
- `data-testid="field-{fieldName}"` — form inputs rendered by EntityForm
- `data-testid="cf-{fieldName}"` — ConstraintForm-specific inputs

---

## Things That Always Need My Approval First

- Deleting any file
- Changing the database schema
- Adding a new dependency (npm package)
- Pushing to any branch
- Creating a pull request
