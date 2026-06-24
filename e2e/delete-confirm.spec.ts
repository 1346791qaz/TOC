import { test, expect } from "@playwright/test";
import { gotoApp, nav } from "./helpers";

// Regression tests for the ConfirmDialog delete pattern.
// Every entity's delete action now shows a styled modal instead of a
// native browser confirm(). These tests verify:
//   - Clicking Delete shows the dialog
//   - Clicking No cancels without deleting
//   - Clicking Yes proceeds with the soft-delete

test.describe.configure({ mode: "serial" });

test("DC-01 · delete persona: No cancels, Yes soft-deletes", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "Personas");

  // Create a throwaway persona for this test.
  await page.getByRole("button", { name: "Persona", exact: true }).click();
  await page.getByTestId("field-name").fill("DC-Test Persona");
  await page.getByTestId("field-scope_level").selectOption("local");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("DC-Test Persona")).toBeVisible();

  const row = page.locator("tr").filter({ hasText: "DC-Test Persona" });

  // --- No cancels ---
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("modal")).toBeVisible();
  // Dialog message contains the entity name.
  await expect(page.getByText(/DC-Test Persona/)).toBeVisible();
  await page.getByRole("button", { name: "No" }).click();
  await expect(page.getByTestId("modal")).toBeHidden();
  // Row is still present.
  await expect(page.locator("tr").filter({ hasText: "DC-Test Persona" })).toBeVisible();

  // --- Yes soft-deletes ---
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("modal")).toBeVisible();
  await page.getByRole("button", { name: "Yes" }).click();
  await expect(page.getByTestId("modal")).toBeHidden();
  await expect(page.locator("tr").filter({ hasText: "DC-Test Persona" })).toBeHidden();
});

test("DC-02 · delete assumption: confirm dialog appears and deletes", async ({ page }) => {
  await gotoApp(page);
  await nav(page, "Assumptions");

  await page.getByRole("button", { name: "Assumption", exact: true }).click();
  await page.getByTestId("field-statement").fill("DC-Test Assumption");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("DC-Test Assumption")).toBeVisible();

  const row = page.locator("tr").filter({ hasText: "DC-Test Assumption" });
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("modal")).toBeVisible();
  await page.getByRole("button", { name: "Yes" }).click();
  await expect(page.locator("tr").filter({ hasText: "DC-Test Assumption" })).toBeHidden();
});
