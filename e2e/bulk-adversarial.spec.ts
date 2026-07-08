import { test, expect } from "@playwright/test";
import {
  arrangeSubmissionMix,
  getSubmissionStatuses,
  closeDb,
} from "./db";

/**
 * ADVERSARIAL multi-select: bulk-change a selection whose rows are in DIFFERENT
 * states, and prove the server only moves the eligible ones, never touches
 * terminal rows, and reports honest counts. This is the highest-risk corner of
 * the bulk feature — a bug here could drag a JOINED submission (and its
 * placement) into a bad state.
 *
 * Ground truth is asserted against the DATABASE (the UI toast is a secondary
 * check), because the whole point is that the persisted state is correct.
 *
 * Eligibility (see src/lib/submission-flow.ts branchActions):
 *   • Hold   → only stages 0–4 and not already ON_HOLD  (so OFFER_ACCEPTED,
 *              JOINED, REJECTED are NOT holdable).
 *   • Reject → any non-terminal status (so JOINED/REJECTED are skipped).
 */
test.describe("bulk multi-select across mixed states (admin)", () => {
  test.afterAll(async () => {
    await closeDb();
  });

  test("bulk Hold then Reject only move eligible rows; terminals are untouched", async ({
    page,
  }) => {
    // Arrange a 5-row selection spanning the interesting states.
    const { token, rows } = await arrangeSubmissionMix([
      "SUBMITTED", // holdable (stage 0)
      "SELECTED", // holdable (stage 4)
      "OFFER_ACCEPTED", // NOT holdable (stage 6) — the subtle one
      "JOINED", // terminal — must never move
      "REJECTED", // terminal — must never move
    ]);
    const [submitted, selected, offer, joined, rejected] = rows;

    // Isolate exactly these five on one page via the candidate-name token.
    await page.goto(`/submissions?q=${token}`);
    await page
      .getByRole("checkbox", { name: "Select all on this page" })
      .check();
    await expect(page.getByText("5 selected")).toBeVisible();

    // ── Bulk HOLD ──────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Hold", exact: true }).click();
    // 2 moved (Submitted, Selected); 3 skipped (Offer accepted + 2 terminal).
    await expect(page.getByText(/2 submissions? → On Hold/)).toBeVisible();

    let now = await getSubmissionStatuses(rows.map((r) => r.subId));
    expect(now[submitted.subId], "Submitted → On Hold").toBe("ON_HOLD");
    expect(now[selected.subId], "Selected → On Hold").toBe("ON_HOLD");
    expect(now[offer.subId], "Offer accepted NOT holdable").toBe("OFFER_ACCEPTED");
    expect(now[joined.subId], "JOINED must be untouched").toBe("JOINED");
    expect(now[rejected.subId], "REJECTED must be untouched").toBe("REJECTED");

    // ── Bulk REJECT (now: ON_HOLD, ON_HOLD, OFFER_ACCEPTED, JOINED, REJECTED) ─
    await page
      .getByRole("checkbox", { name: "Select all on this page" })
      .check();
    await expect(page.getByText("5 selected")).toBeVisible();
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    // Reject is destructive → confirm dialog. Confirm inside the dialog.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Reject", exact: true }).click();

    // 3 moved (2 ex-hold + Offer accepted); 2 skipped (Joined + already Rejected).
    await expect(page.getByText(/3 submissions? → Rejected/)).toBeVisible();

    now = await getSubmissionStatuses(rows.map((r) => r.subId));
    expect(now[submitted.subId], "ex-hold → Rejected").toBe("REJECTED");
    expect(now[selected.subId], "ex-hold → Rejected").toBe("REJECTED");
    expect(now[offer.subId], "Offer accepted → Rejected").toBe("REJECTED");
    expect(now[joined.subId], "JOINED still untouched by Reject").toBe("JOINED");
    expect(now[rejected.subId], "already Rejected").toBe("REJECTED");
  });

  test("bulk Hold on an all-terminal selection changes nothing", async ({
    page,
  }) => {
    const { token, rows } = await arrangeSubmissionMix(["JOINED", "REJECTED"]);

    await page.goto(`/submissions?q=${token}`);
    await page
      .getByRole("checkbox", { name: "Select all on this page" })
      .check();
    await expect(page.getByText("2 selected")).toBeVisible();

    await page.getByRole("button", { name: "Hold", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Nothing changed");

    const now = await getSubmissionStatuses(rows.map((r) => r.subId));
    expect(now[rows[0].subId]).toBe("JOINED");
    expect(now[rows[1].subId]).toBe("REJECTED");
  });
});
