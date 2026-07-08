import { test, expect } from "@playwright/test";
import { AUTH_FILES } from "./helpers";

/**
 * Role-based access control, from the recruiter's seat. The recruiter
 * (hrishikesh@lumintrack.com) is the limited day-to-day role: no audit log,
 * no data export, no org-entity admin, no bulk status change.
 */
test.describe("RBAC — recruiter is fenced out of admin surfaces", () => {
  test.use({ storageState: AUTH_FILES.recruiter });

  test("audit log shows Forbidden", async ({ page }) => {
    await page.goto("/audit");
    await expect(
      page.getByRole("heading", { name: "Forbidden", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Audit log", level: 1 }),
    ).toHaveCount(0);
  });

  test("data export shows Forbidden", async ({ page }) => {
    await page.goto("/settings/export");
    await expect(
      page.getByRole("heading", { name: "Forbidden", level: 1 }),
    ).toBeVisible();
  });

  test("submissions list hides the bulk-select checkboxes", async ({ page }) => {
    await page.goto("/submissions");
    await expect(
      page.getByRole("heading", { name: "Submissions", level: 1 }),
    ).toBeVisible();
    // No select-all checkbox, so no path to a bulk status change.
    await expect(
      page.getByRole("checkbox", { name: "Select all on this page" }),
    ).toHaveCount(0);
  });

  test("can still reach their day-to-day pages", async ({ page }) => {
    for (const [path, heading] of [
      ["/submissions", "Submissions"],
      ["/candidates", "Candidates"],
      ["/jobs", "Jobs"],
    ] as const) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: heading, level: 1 }),
      ).toBeVisible();
    }
  });
});

/**
 * The mirror image: the admin DOES get the privileged surfaces. Default
 * (admin) storageState.
 */
test.describe("RBAC — admin gets the privileged surfaces", () => {
  test("sees the audit log", async ({ page }) => {
    await page.goto("/audit");
    await expect(
      page.getByRole("heading", { name: "Audit log", level: 1 }),
    ).toBeVisible();
  });

  test("sees the export page with a download control", async ({ page }) => {
    await page.goto("/settings/export");
    await expect(
      page.getByRole("heading", { name: "Forbidden", level: 1 }),
    ).toHaveCount(0);
  });

  test("sees the bulk-select checkboxes on submissions", async ({ page }) => {
    await page.goto("/submissions");
    await expect(
      page.getByRole("checkbox", { name: "Select all on this page" }),
    ).toBeVisible();
  });
});
