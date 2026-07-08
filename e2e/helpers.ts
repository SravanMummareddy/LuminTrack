import { expect, type Page } from "@playwright/test";

/** Seeded logins (from `prisma/seed-demo.ts`). All users share one password. */
export const CREDENTIALS = {
  admin: { email: "sriman@lumintrack.com", name: "Sriman Udugula" },
  recruiter: { email: "hrishikesh@lumintrack.com", name: "Hrishikesh Batta" },
  password: "LuminTrack2026!",
} as const;

/** Storage-state files written by global-setup and reused by the specs. */
export const AUTH_FILES = {
  admin: "e2e/.auth/admin.json",
  recruiter: "e2e/.auth/recruiter.json",
} as const;

/** An explicitly anonymous storage state for tests of the auth gate. */
export const ANON_STATE = { cookies: [], origins: [] };

/**
 * Log in through the real form and land on the dashboard. Used by global-setup
 * to mint the reusable sessions, and available to any spec that wants a fresh
 * login (e.g. the login/logout flow tests).
 */
export async function login(
  page: Page,
  email: string,
  password: string = CREDENTIALS.password,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // loginAction redirects to "/" on success; wait for the dashboard heading.
  await page.waitForURL("**/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

/** Unique suffix for records a spec creates, so reruns never collide. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}
