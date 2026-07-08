import { test, expect } from "@playwright/test";

/**
 * The admin bulk-status feature on the submissions list. Runs as admin
 * (default storageState). This is a real end-to-end write: select rows →
 * click Hold → the server action runs → a toast reports the outcome.
 */
test.describe("submissions bulk status (admin)", () => {
  test("selecting rows reveals the bulk action bar", async ({ page }) => {
    await page.goto("/submissions");
    const selectAll = page.getByRole("checkbox", {
      name: "Select all on this page",
    });
    await expect(selectAll).toBeVisible();

    await selectAll.check();
    const bar = page.getByText(/\d+ selected/);
    await expect(bar).toBeVisible();
    // All three safe branch actions are offered. `exact` so "Hold" doesn't
    // also match the "On Hold" status-cell buttons in the rows.
    await expect(
      page.getByRole("button", { name: "Hold", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reject", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Backed out", exact: true }),
    ).toBeVisible();

    // Unchecking clears the selection and hides the bar.
    await selectAll.uncheck();
    await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
  });

  test("bulk Hold posts and reports the result in a toast", async ({ page }) => {
    await page.goto("/submissions");
    // Select a single row (checkbox 0 is the header select-all).
    const firstRow = page.getByRole("checkbox").nth(1);
    await firstRow.check();
    await expect(page.getByText("1 selected")).toBeVisible();

    await page.getByRole("button", { name: "Hold", exact: true }).click();

    // The action round-trips and surfaces a toast — either a success move to
    // On Hold, or "Nothing changed" if the row was already closed/joined.
    const toast = page.getByRole("status");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/On Hold|Nothing changed/);

    // Selection is cleared afterward (bulk bar gone).
    await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
  });

  test("Reject is gated behind a confirmation dialog", async ({ page }) => {
    await page.goto("/submissions");
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: "Reject", exact: true }).click();

    // A confirm dialog appears — nothing is committed until confirmed.
    await expect(page.getByText(/Reject \d+ submission/)).toBeVisible();
    // Cancel it (close without confirming) — the row is untouched.
    await page.keyboard.press("Escape");
    await expect(page.getByText(/Reject \d+ submission/)).toHaveCount(0);
  });
});
