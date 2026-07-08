import { test, expect } from "@playwright/test";

/**
 * Global keyboard shortcuts (mounted in the dashboard layout). These are
 * browser-only behaviors that no unit/integration test can cover.
 *
 * The shortcut listener is attached in a client `useEffect`, so each test waits
 * a beat after navigation for hydration before pressing keys — otherwise the
 * keypress can land before the handler exists (a real hydration race, not an
 * app bug).
 */
const HYDRATE_MS = 800;

test.describe("keyboard shortcuts (admin)", () => {
  test("'/' focuses the global search", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(HYDRATE_MS);
    await page.keyboard.press("Slash");
    await expect(page.locator("#global-search")).toBeFocused();
  });

  test("'?' toggles the help overlay", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(HYDRATE_MS);
    await page.keyboard.press("Shift+Slash"); // "?"
    await expect(
      page.getByRole("heading", { name: "Keyboard shortcuts" }),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "Keyboard shortcuts" }),
    ).toBeHidden();
  });

  test("'g' then 'j' navigates to Jobs", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(HYDRATE_MS);
    await page.keyboard.press("g");
    await page.keyboard.press("j");
    await expect(page).toHaveURL(/\/jobs/);
    await expect(
      page.getByRole("heading", { name: "Jobs", level: 1 }),
    ).toBeVisible();
  });

  test("shortcuts are suppressed while typing in a field", async ({ page }) => {
    await page.goto("/");
    const search = page.locator("#global-search");
    await search.focus();
    // Typing 'g' then 'j' into the search box must NOT navigate away.
    await search.type("gj");
    await expect(page).toHaveURL(/\/$/);
    await expect(search).toHaveValue("gj");
  });
});
