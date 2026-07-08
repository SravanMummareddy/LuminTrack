import { test, expect } from "@playwright/test";
import {
  arrangeOfferAccepted,
  getPlacementStatusForSubmission,
  getCandidateStatus,
  getSubmissionStatuses,
  closeDb,
} from "./db";

/**
 * The JOINED → placement cascade, driven through the real status control, then
 * reverted. This is the most stateful, cross-entity flow in the app:
 *   Mark joined  → submission JOINED + a Placement (ACTIVE) + candidate PLACED
 *   revert       → placement TERMINATED + candidate back to AVAILABLE
 * Ground truth is read from the DB via `expect.poll` (the cascade commits inside
 * one transaction, but polling tolerates any revalidation lag).
 */
test.describe("JOINED placement cascade (admin)", () => {
  test.afterAll(async () => {
    await closeDb();
  });

  test("Mark joined creates a placement + places the candidate; revert unwinds it", async ({
    page,
  }) => {
    const { subId, candidateId } = await arrangeOfferAccepted();

    await page.goto(`/submissions/${subId}`);

    // Primary action from Offer accepted is "Mark joined" → opens the placement
    // confirm dialog.
    await page.getByRole("button", { name: "Mark joined", exact: true }).click();
    const joinDialog = page.getByRole("dialog");
    await expect(joinDialog).toBeVisible();
    await joinDialog
      .getByRole("button", { name: "Mark joined", exact: true })
      .click();

    // Success toast confirms the server action committed.
    await expect(page.getByRole("status")).toBeVisible();

    // Cascade: submission JOINED, an ACTIVE placement exists, candidate PLACED.
    await expect
      .poll(async () => (await getSubmissionStatuses([subId]))[subId], {
        timeout: 8000,
      })
      .toBe("JOINED");
    await expect
      .poll(() => getPlacementStatusForSubmission(subId), { timeout: 8000 })
      .toBe("ACTIVE");
    await expect
      .poll(() => getCandidateStatus(candidateId), { timeout: 8000 })
      .toBe("PLACED");

    // ── Revert: JOINED is terminal → reopen via "Jump to any stage". ─────────
    await page.getByRole("button", { name: "Jump to any stage" }).click();
    await page.locator("#statusJump").selectOption("OFFER_ACCEPTED");
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(page.getByRole("status")).toBeVisible();

    // Unwound: submission back to OFFER_ACCEPTED, placement TERMINATED, candidate
    // AVAILABLE again (no other active placements).
    await expect
      .poll(async () => (await getSubmissionStatuses([subId]))[subId], {
        timeout: 8000,
      })
      .toBe("OFFER_ACCEPTED");
    await expect
      .poll(() => getPlacementStatusForSubmission(subId), { timeout: 8000 })
      .toBe("TERMINATED");
    await expect
      .poll(() => getCandidateStatus(candidateId), { timeout: 8000 })
      .toBe("AVAILABLE");
  });
});
