import { test, expect } from "@playwright/test";
import { CREDENTIALS, ANON_STATE, login } from "./helpers";

/**
 * The authentication gate — the security boundary every other spec assumes.
 * These run as an anonymous visitor (no stored session).
 */
test.describe("authentication", () => {
  test.use({ storageState: ANON_STATE });

  test("redirects an unauthenticated visitor to /login", async ({ page }) => {
    await page.goto("/submissions");
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "LuminTrack" }),
    ).toBeVisible();
  });

  test("redirects the dashboard root too", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("rejects invalid credentials with a generic error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(CREDENTIALS.admin.email);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    // Still on the login page — no session was created.
    await expect(page).toHaveURL(/\/login$/);
  });

  test("logs in with valid credentials and lands on the dashboard", async ({
    page,
  }) => {
    await login(page, CREDENTIALS.admin.email);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("signs out back to the login page", async ({ page }) => {
    await login(page, CREDENTIALS.admin.email);

    await page
      .getByRole("button", { name: /account menu for/i })
      .click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();

    await expect(page).toHaveURL(/\/login$/);
    // The session is gone — a protected route bounces back to login.
    await page.goto("/submissions");
    await expect(page).toHaveURL(/\/login$/);
  });
});
