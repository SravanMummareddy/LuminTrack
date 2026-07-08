import { test, expect } from "@playwright/test";

/**
 * Password strength policy ("Balanced": ≥10 chars + ≥3 of 4 character classes).
 * Covers the live client checklist AND the server-side rejection.
 *
 * SAFETY: the rejection test submits a *weak* new password, which the Zod
 * schema rejects before any DB write — so the admin password is never changed
 * and the reused session stays valid.
 */
test.describe("password policy (admin, settings → account)", () => {
  test("the live checklist reflects the character-class count as you type", async ({
    page,
  }) => {
    await page.goto("/settings?tab=account");
    const list = page.getByRole("list", { name: "Password requirements" });
    const newPassword = page.locator("#newPassword");

    // Weak: 3 lowercase chars → 1 class, under length.
    await newPassword.fill("abc");
    await expect(list).toBeVisible();
    await expect(list).toContainText("At least 10 characters");
    await expect(list).toContainText("(1/4)");

    // Strong: 10+ chars, all 4 classes.
    await newPassword.fill("Abcdef123!x");
    await expect(list).toContainText("(4/4)");
  });

  test("the server rejects a weak new password", async ({ page }) => {
    await page.goto("/settings?tab=account");

    // Wrong current password on purpose — belt-and-suspenders so nothing can
    // change even hypothetically; the weak newPassword is what's under test.
    await page.locator("#currentPassword").fill("whatever-is-wrong");
    await page.locator("#newPassword").fill("weak");
    await page.locator("#confirmPassword").fill("weak");
    await page.getByRole("button", { name: /update password/i }).click();

    // The Zod policy issue surfaces as a field error ("Password needs: …").
    await expect(page.getByText(/Password needs:/i).first()).toBeVisible();
  });
});
