import { test, expect } from "@playwright/test";
import { pickOpenRequirement, closeDb } from "./db";

/**
 * The three-tier pipeline surfaced in the UI: Job → Vendor Portal Requirement
 * → Submission. This walks the navigation an admin/team-lead takes to submit a
 * candidate against a requirement, proving the wiring end to end. (The actual
 * submission-create mutation + its gates are covered precisely by the
 * integration suite; here we verify the browser path reaches the form.)
 */
test.describe("vendor portal (three-tier navigation)", () => {
  let open: { id: string; jobTitle: string };

  test.beforeAll(async () => {
    open = await pickOpenRequirement();
  });
  test.afterAll(async () => {
    await closeDb();
  });

  test("the requirements list renders with rows linking to detail", async ({
    page,
  }) => {
    await page.goto("/vendor-portal");
    await expect(
      page.getByRole("heading", {
        name: "Vendor Portal Requirements",
        level: 1,
      }),
    ).toBeVisible();
    // At least one row links to a requirement detail page.
    await expect(
      page.locator('a[href^="/vendor-portal/"]').first(),
    ).toBeVisible();
  });

  test("an open requirement detail offers 'Submit a candidate'", async ({
    page,
  }) => {
    await page.goto(`/vendor-portal/${open.id}`);
    const submit = page.getByRole("link", { name: "Submit a candidate" });
    await expect(submit).toBeVisible();
    // The Submissions roll-up card is present.
    await expect(page.getByText(/Submissions \(\d+\)/)).toBeVisible();
  });

  test("'Submit a candidate' opens the job-locked submission form", async ({
    page,
  }) => {
    await page.goto(`/vendor-portal/${open.id}`);
    await page.getByRole("link", { name: "Submit a candidate" }).click();

    await expect(page).toHaveURL(new RegExp(`/vendor-portal/${open.id}/convert`));
    await expect(
      page.getByRole("heading", { name: "Submit a candidate", level: 1 }),
    ).toBeVisible();
    // The job is fixed (locked) at the requirement's job — its title shows.
    await expect(page.getByText(open.jobTitle).first()).toBeVisible();
  });
});
