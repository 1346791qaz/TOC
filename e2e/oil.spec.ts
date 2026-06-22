import { test, expect, type Page } from "@playwright/test";

// Thorough end-to-end walkthrough of every Value Stream Model Engine feature,
// driven against a freshly seeded database (see playwright.config.ts webServer).
// Runs serially so created/deleted entities have a predictable lifecycle.

test.describe.configure({ mode: "serial" });

// Auto-accept the soft-delete confirm() dialogs.
test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => d.accept());
});

const nav = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true }).click();

async function gotoApp(page: Page) {
  await page.goto("/");
  // Bootstrap selects the seed engagement + value stream.
  await expect(page.getByText("Value Stream Model Engine")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Made-to-Order Machined Parts" })).toBeVisible({
    timeout: 15_000,
  });
}

test("01 · app boots with the seeded engagement and overview", async ({ page }) => {
  await gotoApp(page);
  // Overview stats + top candidate.
  await expect(page.getByText("Problem statement")).toBeVisible();
  await expect(page.getByText("Top constraint candidate")).toBeVisible();
  await expect(page.getByText("Inspection", { exact: true })).toBeVisible();
  await page.screenshot({ path: "e2e/__screens__/01-overview.png", fullPage: true });
});

test("02 · process steps: entry/action/exit, edit, RACI persona, data binding, create", async ({
  page,
}) => {
  await gotoApp(page);
  await nav(page, "Process Steps");

  // Spine shows the six seeded steps.
  await expect(page.getByRole("button", { name: /Order Intake/ })).toBeVisible();
  await page.getByRole("button", { name: /Inspection/ }).click();

  // Detail shows the action criterion.
  await expect(page.getByText("CMM + manual inspection vs drawing")).toBeVisible();

  // Edit the step's wait time.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByTestId("modal")).toBeVisible();
  await page.getByTestId("field-wait_time").fill("9");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("modal")).toBeHidden();

  // Assign a persona with a RACI role.
  const raci = page.getByTestId("step-personas");
  await raci.locator("select").filter({ hasText: "Add persona…" }).selectOption({
    label: "Production Planner",
  });
  await raci.getByRole("button", { name: "Add", exact: true }).click();
  // Assert the assigned-list row (a span), not the <option> in the picker.
  await expect(raci.locator("span.font-medium", { hasText: "Production Planner" })).toBeVisible();

  // Bind a new data element to the step.
  await page.getByRole("button", { name: "Bind data" }).click();
  await expect(page.getByTestId("modal")).toBeVisible();
  await page.getByTestId("field-name").fill("E2E Bound Data");
  await page.getByTestId("field-binding_point").selectOption("exit");
  await page.getByTestId("field-presence").selectOption("missing");
  await page.getByTestId("field-is_key").check();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByTestId("modal")).toBeHidden();
  await expect(page.getByText("E2E Bound Data")).toBeVisible();

  // Create a brand-new step, including the Pain Points field.
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await page.getByTestId("field-name").fill("E2E New Step");
  await page.getByTestId("field-sequence_index").fill("9");
  await page.getByTestId("field-pain_points").fill("E2E pain text for this step");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("button", { name: /E2E New Step/ })).toBeVisible();
  // Pain points persist and render in the step detail.
  await page.getByRole("button", { name: /E2E New Step/ }).click();
  await expect(page.getByText("E2E pain text for this step")).toBeVisible();
  await page.screenshot({ path: "e2e/__screens__/02-steps.png", fullPage: true });
});

test("03 · personas: scope filter, create", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "Personas");
  await expect(page.getByText("QA Inspector")).toBeVisible();
  await expect(page.getByText("CNC Machinist")).toBeVisible();

  // Filter by scope = stream hides the local-scope machinist.
  await page.locator("select").filter({ hasText: "All scopes" }).selectOption("stream");
  await expect(page.getByText("CNC Machinist")).toBeHidden();
  await expect(page.getByText("QA Inspector")).toBeVisible();
  await page.locator("select").filter({ hasText: "All scopes" }).selectOption("");

  // Create a persona.
  await page.getByRole("button", { name: "Persona", exact: true }).click();
  await page.getByTestId("field-name").fill("E2E Persona");
  await page.getByTestId("field-scope_level").selectOption("system");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("E2E Persona")).toBeVisible();
});

test("04 · data elements: list and create with step picker", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "Data Elements");
  await expect(page.getByText("CNC program")).toBeVisible();

  await page.getByRole("button", { name: "Data element", exact: true }).click();
  // The required step picker must default to a real step (not "") even when the
  // user never touches it — otherwise the form posts an empty step and fails.
  await expect(page.getByTestId("field-step_id")).not.toHaveValue("");
  await page.getByTestId("field-step_id").selectOption({ label: "Order Intake" });
  await page.getByTestId("field-name").fill("E2E DataView Elem");
  await page.getByTestId("field-presence").selectOption("partial");
  // New granular data-point fields (table/view + field name).
  await page.getByTestId("field-table_or_view").fill("VBAP");
  await page.getByTestId("field-field_name").fill("ZZFIELD");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("E2E DataView Elem")).toBeVisible();
  await expect(page.getByText("VBAP.ZZFIELD")).toBeVisible();
});

test("05 · data gap report aggregates missing/partial/key", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "Data Gap Report");
  await expect(page.getByText("Total flagged")).toBeVisible();
  await expect(page.getByText("Inspection", { exact: true })).toBeVisible();
  // At least one missing badge from the seed.
  await expect(page.getByText("missing").first()).toBeVisible();
  await page.screenshot({ path: "e2e/__screens__/05-gaps.png", fullPage: true });
});

test("06 · constraint register: create a risk with likelihood", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "Constraint Register");
  await expect(page.getByText("Single qualified inspector")).toBeVisible();

  await page.getByRole("button", { name: "Constraint", exact: true }).click();
  await expect(page.getByTestId("modal")).toBeVisible();
  await page.getByTestId("cf-title").fill("E2E Material Risk");
  await page.getByTestId("cf-kind").selectOption("risk");
  await page.getByTestId("cf-severity").selectOption("high");
  await page.getByTestId("cf-target_type").selectOption("step");
  await page.getByTestId("cf-target_id").selectOption({ label: "CNC Machining" });
  // Likelihood field only appears for risks.
  await expect(page.getByTestId("cf-likelihood")).toBeVisible();
  await page.getByTestId("cf-likelihood").selectOption("high");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByTestId("modal")).toBeHidden();
  await expect(page.getByText("E2E Material Risk")).toBeVisible();
});

test("07 · candidate ranking is transparent and promotable", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "Constraint Candidates");
  // Inspection should be the top candidate from the seed evidence.
  await expect(page.getByText("#1")).toBeVisible();
  await expect(page.getByText("Inspection", { exact: true }).first()).toBeVisible();
  // Factors are shown transparently.
  await expect(page.getByText("Bottleneck topology").first()).toBeVisible();
  await page.screenshot({ path: "e2e/__screens__/07-candidates.png", fullPage: true });

  // Promote the top candidate -> prefilled constraint form.
  await page.getByRole("button", { name: "Set as system constraint" }).first().click();
  await expect(page.getByTestId("modal")).toBeVisible();
  await expect(page.getByTestId("cf-system")).toBeChecked();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByTestId("modal")).toBeHidden();

  // Register now shows a system constraint.
  await nav(page, "Constraint Register");
  await expect(page.getByText("system").first()).toBeVisible();
});

test("08 · metrics: baseline/current delta and create", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "Metrics");
  await expect(page.getByText("On-time delivery")).toBeVisible();

  await page.getByRole("button", { name: "Metric", exact: true }).click();
  await page.getByTestId("field-name").fill("E2E Throughput");
  await page.getByTestId("field-metric_type").selectOption("throughput");
  await page.getByTestId("field-baseline_value").fill("5");
  await page.getByTestId("field-current_value").fill("8");
  await page.getByTestId("field-target_value").fill("12");
  await page.getByTestId("field-is_leading").check();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("E2E Throughput")).toBeVisible();
  await expect(page.getByText("+3")).toBeVisible();
});

test("09 · assumptions: create", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "Assumptions");
  await expect(page.getByText(/Inspection is the bottleneck/)).toBeVisible();

  await page.getByRole("button", { name: "Assumption", exact: true }).click();
  await page.getByTestId("field-statement").fill("E2E assumption to validate");
  await page.getByTestId("field-status").selectOption("supported");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("E2E assumption to validate")).toBeVisible();
});

test("10 · VS canvas: layouts, layers, node edit, drag-to-connect", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "VS Graph");

  // Nodes render.
  await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("oilnode-step").first()).toBeVisible();
  const personaCountFull = await page.getByTestId("oilnode-persona").count();
  expect(personaCountFull).toBeGreaterThan(0);

  // Layout modes.
  await page.getByRole("button", { name: "Process spine" }).click();
  await expect(page.getByTestId("oilnode-persona")).toHaveCount(0); // spine = steps only
  await page.getByRole("button", { name: "Constraint focus" }).click();
  await page.getByRole("button", { name: "Full Model" }).click();
  await expect(page.getByTestId("oilnode-persona").first()).toBeVisible();

  // Layer toggle: turn personas off.
  await page.getByRole("button", { name: "personas", exact: true }).click();
  await expect(page.getByTestId("oilnode-persona")).toHaveCount(0);
  await page.getByRole("button", { name: "personas", exact: true }).click();

  // Click a step node -> detail drawer -> inline edit.
  await page.getByTestId("oilnode-step").filter({ hasText: "CNC Machining" }).click();
  await expect(page.getByTestId("detail-drawer")).toBeVisible();
  await page.getByTestId("field-wait_time").fill("4");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.screenshot({ path: "e2e/__screens__/10-canvas.png", fullPage: true });

  // Drag-to-connect: create a dependency edge between two step nodes. React
  // Flow v12 uses pointer events, so we drive real mouse movement via hover().
  await page.getByTestId("detail-drawer").getByRole("button").first().click(); // close drawer
  const edgesBefore = await page.locator(".react-flow__edge").count();
  const source = page
    .getByTestId("oilnode-step")
    .filter({ hasText: "Order Intake" })
    .locator(".react-flow__handle.source");
  const target = page
    .getByTestId("oilnode-step")
    .filter({ hasText: "Finishing" })
    .locator(".react-flow__handle.target");
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await source.hover();
  await page.mouse.down();
  await target.hover();
  await target.hover(); // a second move so React Flow registers the valid target
  await page.mouse.up();
  await expect
    .poll(async () => page.locator(".react-flow__edge").count(), { timeout: 8_000 })
    .toBeGreaterThan(edgesBefore);
});

test("11 · command palette jumps to an entity", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: /Jump to/ }).click();
  await expect(page.getByPlaceholder("Jump to a view or entity…")).toBeVisible();
  await page.getByPlaceholder("Jump to a view or entity…").fill("Order Intake");
  await page.getByPlaceholder("Jump to a view or entity…").press("Enter");
  // Lands on the Process Steps view.
  await expect(page.getByRole("button", { name: /Order Intake/ })).toBeVisible();
});

test("12 · trash and restore a soft-deleted persona", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "Personas");
  // Delete the persona created in test 03.
  const row = page.locator("tr").filter({ hasText: "E2E Persona" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("tr").filter({ hasText: "E2E Persona" })).toBeHidden();

  // It appears in Trash and can be restored.
  await nav(page, "Trash");
  const trashRow = page.locator("tr").filter({ hasText: "E2E Persona" });
  await expect(trashRow).toBeVisible();
  await trashRow.getByRole("button", { name: "Restore" }).click();

  await nav(page, "Personas");
  await expect(page.locator("tr").filter({ hasText: "E2E Persona" })).toBeVisible();
});

test("13 · structured import and engagement export", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "Import / Export");

  // Structured CSV import of personas (scope to the entity select).
  await page.getByRole("combobox").filter({ hasText: "Process steps" }).selectOption("personas");
  await page
    .getByPlaceholder(/Paste/)
    .fill("name,scope_level\nE2E Imported Persona,system\nE2E Imported Two,local");
  await page.getByRole("button", { name: "Import rows" }).click();
  await expect(page.getByText(/Created 2/)).toBeVisible();

  // Verify the imported personas exist.
  await nav(page, "Personas");
  await expect(page.getByText("E2E Imported Persona")).toBeVisible();
  await expect(page.getByText("E2E Imported Two")).toBeVisible();

  // Export the engagement bundle (download).
  await nav(page, "Import / Export");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export engagement" }).click(),
  ]);
  expect(download.suggestedFilename()).toContain("engagement-");
  await page.screenshot({ path: "e2e/__screens__/13-io.png", fullPage: true });
});

test("14 · steps: add a sub-step and drill into the level", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "Process Steps");

  // Select Inspection and add a sub-step under it.
  await page.getByRole("button", { name: /Inspection/ }).click();
  await page.getByRole("button", { name: "Add sub-step" }).first().click();
  await expect(page.getByTestId("modal")).toBeVisible();
  await page.getByTestId("field-name").fill("E2E Substep");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByTestId("modal")).toBeHidden();

  // Open the sub-level; the sub-step is now the level's spine.
  await page.getByRole("button", { name: "Open level" }).click();
  await expect(page.getByTestId("step-breadcrumb")).toContainText("Inspection");
  await expect(page.getByRole("button", { name: /E2E Substep/ })).toBeVisible();

  // Breadcrumb back to the top level.
  await page.getByTestId("step-breadcrumb").getByRole("button").first().click();
  await expect(page.getByRole("button", { name: /Inspection/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /E2E Substep/ })).toBeHidden();
});

test("15 · canvas: expand a step's sub-steps inline", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "VS Graph");
  await expect(page.getByTestId("oilnode-step").first()).toBeVisible({ timeout: 15_000 });

  // Inspection has the sub-step created in test 14 — expand it inline.
  await page.getByTestId("oilnode-step").filter({ hasText: "Inspection" }).first().dblclick();
  await expect(page.getByTestId("oilnode-step").filter({ hasText: "E2E Substep" })).toBeVisible();
  // The rest of the value stream stays visible (not replaced).
  await expect(page.getByTestId("oilnode-step").filter({ hasText: "Order Intake" })).toBeVisible();
  await page.screenshot({ path: "e2e/__screens__/15-expand.png", fullPage: true });

  // Collapse again.
  await page.getByTestId("oilnode-step").filter({ hasText: "Inspection" }).first().dblclick();
  await expect(page.getByTestId("oilnode-step").filter({ hasText: "E2E Substep" })).toBeHidden();
});
