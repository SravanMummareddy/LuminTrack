import { test, expect } from "@playwright/test";
import { createBareJob, getJobRow, closeDb } from "./db";

/**
 * The job lifecycle LADDER (admin): a retired (Closed) job → Move to trash →
 * Erase permanently. An EMPTY job (no submissions/placements) is hard-removed;
 * a backup zip lands in Settings → Recycle bin. Uses a throwaway job.
 */
test.describe("job lifecycle ladder (admin)", () => {
  test.afterAll(async () => {
    await closeDb();
  });

  test("closed job → trash → erase (empty = removed); backup in recycle bin", async ({
    page,
  }) => {
    const { id, displayId, title } = await createBareJob();

    await page.goto(`/jobs/${id}`);

    // A retired (Closed) job can go straight to trash from the danger zone.
    await page
      .getByRole("button", { name: "Move to trash", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Move to trash", exact: true })
      .click();

    // Trashed → the banner exposes Erase permanently. Reload to confirm the
    // persisted state (spaced retries — the same-page redirect + Neon serverless
    // connection can lag right after the write).
    await expect
      .poll(
        async () => {
          await page.goto(`/jobs/${id}`);
          return page.getByText("In trash").first().isVisible();
        },
        { timeout: 45_000, intervals: [2000, 3000, 5000, 5000, 5000] },
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Erase permanently", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#confirmTitle").fill(title);
    await dialog
      .getByRole("button", { name: "Erase permanently", exact: true })
      .click();

    // Empty job → the row is hard-removed entirely.
    await expect.poll(() => getJobRow(id), { timeout: 10_000 }).toBeNull();

    // The backup shows in the recycle bin (Erased jobs section).
    await page.goto("/settings?tab=deleted");
    await expect(
      page.getByRole("row", { name: new RegExp(displayId) }),
    ).toBeVisible();
  });
});
