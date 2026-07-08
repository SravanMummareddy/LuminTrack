import { test, expect } from "@playwright/test";

/**
 * Smoke-navigate every primary route as the admin and assert its page heading
 * renders. This catches server-component crashes, broken queries, and bad
 * imports on any page — the cheapest high-value coverage there is.
 *
 * Runs with the default admin storageState (see playwright.config.ts).
 */
const ROUTES: { path: string; heading: string | RegExp }[] = [
  { path: "/", heading: "Dashboard" },
  { path: "/jobs", heading: "Jobs" },
  { path: "/vendor-portal", heading: "Vendor Portal Requirements" },
  { path: "/candidates", heading: "Candidates" },
  { path: "/bench", heading: "Bench" },
  { path: "/submissions", heading: "Submissions" },
  { path: "/interviews", heading: "Interviews" },
  { path: "/placements", heading: "Placements" },
  { path: "/recruiters", heading: "Recruiters" },
  { path: "/reports", heading: "Reports & Analytics" },
  { path: "/settings", heading: "Settings" },
  { path: "/audit", heading: "Audit log" },
];

test.describe("navigation (admin)", () => {
  for (const { path, heading } of ROUTES) {
    test(`${path} renders its heading`, async ({ page }) => {
      const response = await page.goto(path);
      // No 5xx from the server component.
      expect(response?.status(), `${path} status`).toBeLessThan(400);
      await expect(
        page.getByRole("heading", { name: heading, level: 1 }),
      ).toBeVisible();
      // Never silently bounced to the login gate.
      await expect(page).not.toHaveURL(/\/login/);
    });
  }

  test("sidebar links navigate between sections", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Jobs", exact: true }).click();
    await expect(page).toHaveURL(/\/jobs/);
    await expect(
      page.getByRole("heading", { name: "Jobs", level: 1 }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Submissions", exact: true }).click();
    await expect(page).toHaveURL(/\/submissions/);
    await expect(
      page.getByRole("heading", { name: "Submissions", level: 1 }),
    ).toBeVisible();
  });
});
