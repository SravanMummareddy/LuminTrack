import { test, expect } from "@playwright/test";
import { createBareCandidate, getCandidateErasedAt, closeDb } from "./db";

/**
 * The candidate lifecycle LADDER (admin): Active → Deactivate → Move to trash →
 * Erase permanently (only from trash). Erase writes a Blob backup that shows up
 * in Settings → Recycle bin. Uses a throwaway candidate so it never touches seed
 * data.
 */
test.describe("candidate lifecycle ladder (admin)", () => {
  test.afterAll(async () => {
    await closeDb();
  });

  test("active candidate trashes via a deactivate prompt; erase only from trash; backup in recycle bin", async ({
    page,
  }) => {
    const { id, displayId, name } = await createBareCandidate();

    await page.goto(`/candidates/${id}`);

    // "Move to trash" is clickable even while Active; the dialog explains the
    // candidate is Active and offers to deactivate + trash in one step.
    await page
      .getByRole("button", { name: "Move to trash", exact: true })
      .click();
    const trashDialog = page.getByRole("dialog");
    await expect(trashDialog.getByText(/still Active/)).toBeVisible();
    await trashDialog
      .getByRole("button", { name: "Deactivate & move to trash", exact: true })
      .click();

    // Trashed → the banner exposes Erase permanently (the ONLY erase entry point).
    // Reload to confirm the persisted state (spaced retries — the same-page
    // redirect + Neon serverless connection can lag right after the write).
    await expect
      .poll(
        async () => {
          await page.goto(`/candidates/${id}`);
          return page.getByText("In trash").first().isVisible();
        },
        { timeout: 45_000, intervals: [2000, 3000, 5000, 5000, 5000] },
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Erase permanently", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#confirmName").fill(name);
    await dialog
      .getByRole("button", { name: "Erase permanently", exact: true })
      .click();

    await expect
      .poll(() => getCandidateErasedAt(id), { timeout: 10_000 })
      .not.toBeNull();

    // Backup landed in the recycle bin.
    await page.goto("/settings?tab=deleted");
    await expect(
      page.getByRole("row", { name: new RegExp(displayId) }),
    ).toBeVisible();
  });
});
