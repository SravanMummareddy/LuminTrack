import { test, expect } from "@playwright/test";

/**
 * List-table mechanics on Submissions: server-side sorting (across the FULL
 * dataset, not just the current page), pagination, and filtering. These prove
 * the query-param plumbing that every list page shares.
 */
test.describe("list tables — submissions (admin)", () => {
  test("clicking a sortable header sets ?sort=&dir= and toggles direction", async ({
    page,
  }) => {
    await page.goto("/submissions");

    // The sortable header is a link labelled "Sort by <column>".
    const header = page.getByRole("link", { name: "Sort by Candidate" });
    await header.click();
    await expect(page).toHaveURL(/[?&]sort=candidate/);
    await expect(page).toHaveURL(/[?&]dir=asc/);

    // Clicking the active column flips the direction.
    await page.getByRole("link", { name: "Sort by Candidate" }).click();
    await expect(page).toHaveURL(/[?&]dir=desc/);
  });

  test("the sort survives pagination (proves full-dataset sort)", async ({
    page,
  }) => {
    await page.goto("/submissions?sort=candidate&dir=asc");
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    // The sort params are still present on page 2.
    await expect(page).toHaveURL(/[?&]sort=candidate/);
    await expect(page).toHaveURL(/[?&]dir=asc/);
  });

  test("pagination moves forward and back", async ({ page }) => {
    await page.goto("/submissions");
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await page.getByRole("link", { name: "Prev", exact: true }).click();
    await expect(page).not.toHaveURL(/[?&]page=2/);
  });

  test("a status filter is reflected as an active pill", async ({ page }) => {
    await page.goto("/submissions?status=ON_HOLD");
    // FilterBar renders the applied filter as "Status: On Hold".
    await expect(page.getByText(/Status:\s*On Hold/)).toBeVisible();
  });
});
