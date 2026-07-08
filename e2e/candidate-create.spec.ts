import { test, expect } from "@playwright/test";
import { uniqueSuffix } from "./helpers";

/**
 * A real browser-driven create: fill the new-candidate form, submit, and prove
 * the record persisted — it redirects to the detail page and shows up in the
 * filtered list. This exercises the full stack: form → server action → DB →
 * revalidate → redirect → re-render.
 */
test.describe("candidate create (admin)", () => {
  test("creating a candidate persists and appears in the list", async ({
    page,
  }) => {
    const name = `E2E Candidate ${uniqueSuffix()}`;

    await page.goto("/candidates/new");
    await expect(
      page.getByRole("heading", { name: "Add candidate", level: 1 }),
    ).toBeVisible();

    await page.getByLabel("Full name").fill(name);
    // The schema requires at least an email OR a phone.
    await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.com`);
    await page.getByRole("button", { name: "Create candidate" }).click();

    // Redirected to the new candidate's detail page (cuid id), which shows the name.
    await expect(page).toHaveURL(/\/candidates\/[a-z0-9]{16,}$/);
    await expect(
      page.getByRole("heading", { name, level: 1 }),
    ).toBeVisible();

    // And it's findable in the list via the server-side name filter.
    await page.goto(`/candidates?q=${encodeURIComponent(name)}`);
    await expect(page.getByRole("link", { name }).first()).toBeVisible();
  });

  test("the form validates a required name", async ({ page }) => {
    await page.goto("/candidates/new");
    // Submit empty — the native `required` on Full name blocks the post, so we
    // stay on /new (no redirect to a detail page).
    await page.getByRole("button", { name: "Create candidate" }).click();
    await expect(page).toHaveURL(/\/candidates\/new$/);
  });
});
