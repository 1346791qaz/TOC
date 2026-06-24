import { expect, type Page } from "@playwright/test";

export async function gotoApp(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Value Stream Model Engine")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Made-to-Order Machined Parts" }),
  ).toBeVisible({ timeout: 15_000 });
}

export const nav = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true }).click();

/** Click the Yes button inside a ConfirmDialog. */
export async function confirmDialog(page: Page) {
  await expect(page.getByTestId("modal")).toBeVisible();
  await page.getByRole("button", { name: "Yes" }).click();
  await expect(page.getByTestId("modal")).toBeHidden();
}
