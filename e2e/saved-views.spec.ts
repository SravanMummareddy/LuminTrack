import { test, expect } from "@playwright/test";
import { uniqueSuffix } from "./helpers";

/**
 * Saved filter views (per-browser, localStorage). A view captures the current
 * URL query and re-applies it in one click. Browser-only behavior.
 */
test.describe("saved views (admin)", () => {
  test("save a filtered view, persist it, and re-apply it", async ({ page }) => {
    const viewName = `E2E on-hold ${uniqueSuffix()}`;
    // After saving, the name appears twice (the active pill + the dropdown
    // entry), so scope with exact + first / distinct labels.
    const pill = page.getByRole("button", { name: viewName, exact: true }).first();

    // Land on a filtered submissions list so there's something to save.
    await page.goto("/submissions?status=ON_HOLD");

    // Open the Views control and save the current filter under a name.
    await page.getByRole("button", { name: "Views" }).click();
    await page.getByRole("button", { name: "Save current view" }).click();
    await page.getByPlaceholder("View name…").fill(viewName);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // The current filter now matches a saved view, so the pill shows its name.
    await expect(pill).toBeVisible();

    // Persisted: reloading the same filtered URL still shows it as active.
    await page.reload();
    await expect(pill).toBeVisible();

    // Re-apply from a clean list: go unfiltered, then pick the view.
    await page.goto("/submissions");
    await page.getByRole("button", { name: "Views" }).click();
    await page.getByRole("button", { name: viewName, exact: true }).click();
    await expect(page).toHaveURL(/status=ON_HOLD/);

    // Clean up so we don't leave test views in localStorage.
    await page.getByRole("button", { name: viewName, exact: true }).first().click();
    await page.getByRole("button", { name: `Delete view ${viewName}` }).click();
  });
});
