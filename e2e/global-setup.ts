import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { CREDENTIALS, AUTH_FILES, login } from "./helpers";

/**
 * Runs once before the whole suite. Logs in as the seeded admin and recruiter
 * through the real form and saves each session's cookies to a storageState
 * file, so the specs start already authenticated (fast, and it exercises the
 * real login path exactly once).
 *
 * If login fails, the database almost certainly isn't seeded — surface a clear,
 * actionable error instead of letting every spec fail cryptically.
 */
async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use?.baseURL ??
    process.env.E2E_BASE_URL ??
    "http://localhost:3000";

  mkdirSync("e2e/.auth", { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const [role, file] of [
      ["admin", AUTH_FILES.admin],
      ["recruiter", AUTH_FILES.recruiter],
    ] as const) {
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      try {
        await login(page, CREDENTIALS[role].email);
      } catch (err) {
        throw new Error(
          `E2E global-setup: could not log in as the seeded ${role} ` +
            `(${CREDENTIALS[role].email}). Is the app running and the DB seeded?\n` +
            `  • Start the app:  npm run dev\n` +
            `  • Seed the DB:    npx tsx prisma/seed-demo.ts\n` +
            `Original error: ${(err as Error).message}`,
        );
      }
      await context.storageState({ path: file });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

export default globalSetup;
