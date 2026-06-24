import { test, expect } from "@playwright/test";
import { gotoApp, nav } from "./helpers";

// Regression and functional tests for Data Elements view changes:
//  - Catalog section (unbound elements) visibility and editing
//  - Edit modal in define mode shows definition fields only (no binding)
//  - BindDataModal Connections/Catalog tab toggle
//
// These tests are self-contained: they create their own data and clean up via
// the serial ordering of assertions.

test.describe.configure({ mode: "serial" });

test("DE-01 · +Data element creates a catalog entry and pencil edits it", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "Data Elements");

  // Create a catalog (unbound) element.
  await page.getByRole("button", { name: "Data element", exact: true }).click();
  await expect(page.getByTestId("modal")).toBeVisible();
  await page.getByTestId("field-name").fill("DE-Test Catalog Element");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByTestId("modal")).toBeHidden();

  // Appears in the catalog section.
  await expect(page.getByText("Catalog — not yet bound to a step")).toBeVisible();
  await expect(page.getByText("DE-Test Catalog Element")).toBeVisible();

  // Pencil icon opens definition-only edit form (no binding section).
  const catalogRow = page.locator("tr").filter({ hasText: "DE-Test Catalog Element" });
  await catalogRow.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByTestId("modal")).toBeVisible();
  // Definition fields present.
  await expect(page.getByTestId("field-name")).toBeVisible();
  // Binding-only fields must NOT be present in define-mode edit.
  await expect(page.getByTestId("field-binding_point")).toBeHidden();
  await expect(page.getByTestId("field-presence")).toBeHidden();

  // Edit the name and save.
  await page.getByTestId("field-name").fill("DE-Test Catalog Element (edited)");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("modal")).toBeHidden();
  await expect(page.getByText("DE-Test Catalog Element (edited)")).toBeVisible();
});

test("DE-02 · bound element edit shows definition fields only, not binding", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "Data Elements");

  // The seeded "CNC program" element is bound to a step; its edit modal
  // should show definition fields only (no binding_point / presence).
  const row = page.locator("tr").filter({ hasText: "CNC program" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByTestId("modal")).toBeVisible();
  await expect(page.getByTestId("field-name")).toBeVisible();
  await expect(page.getByTestId("field-binding_point")).toBeHidden();
  await expect(page.getByTestId("field-presence")).toBeHidden();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("modal")).toBeHidden();
});

test("DE-03 · BindDataModal has Connections and Catalog tabs", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "Process Steps");

  await page.getByRole("button", { name: /Inspection/ }).click();
  await page.getByRole("button", { name: "Bind data" }).click();
  await expect(page.getByTestId("modal")).toBeVisible();

  // Both tabs are present in the left panel.
  await expect(page.getByRole("button", { name: "Connections" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Catalog" })).toBeVisible();

  // Switching to Catalog tab shows all-elements message.
  await page.getByRole("button", { name: "Catalog" }).click();
  await expect(page.getByText(/unbound elements shown/)).toBeVisible();

  // Switching back to Connections tab restores the nav.
  await page.getByRole("button", { name: "Connections" }).click();
  await expect(page.getByText("All elements")).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("modal")).toBeHidden();
});
