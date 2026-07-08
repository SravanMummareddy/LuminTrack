import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end suite — drives a real Chromium browser against the running
 * Next.js app + the seeded database. This is the top of the test pyramid,
 * above the no-DB unit suite (`npm test`) and the Dockerized-Postgres
 * integration suite (`npm run test:integration`).
 *
 * Contract: the app must be seeded with the demo dataset
 * (`npx tsx prisma/seed-demo.ts`) — the specs log in as the seeded admin
 * (sriman@lumintrack.com) and recruiter (hrishikesh@lumintrack.com), both
 * password `LuminTrack2026!`. global-setup verifies this and fails loudly
 * with instructions if the seed is missing.
 *
 * Runs SERIALLY (workers: 1) because every spec shares one database — the
 * same single-threaded posture as the integration suite. Creation specs mint
 * uniquely-named records so they never collide with seed data or each other.
 */

const PORT = process.env.E2E_PORT ?? "3000";
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: [["list"], ["html", { outputFolder: "e2e/.report", open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    // Default identity for every spec: the seeded admin. Specs that need the
    // recruiter or an anonymous visitor override storageState per describe.
    storageState: "e2e/.auth/admin.json",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
