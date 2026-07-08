import { test, expect } from "@playwright/test";
import { AUTH_FILES } from "./helpers";

/**
 * Server-side authorization enforcement — the important half of RBAC. The
 * rbac.spec proves the UI *hides* admin surfaces; this proves the *server*
 * rejects a privileged request even when it's made directly (i.e. hiding a
 * button isn't the only thing stopping a recruiter). Requests carry the stored
 * session cookie automatically via `page.request`.
 */
test.describe("server enforcement — recruiter", () => {
  test.use({ storageState: AUTH_FILES.recruiter });

  test("POST /api/export/full is forbidden (403)", async ({ page }) => {
    const res = await page.request.post("/api/export/full");
    expect(res.status()).toBe(403);
  });

  test("GET /api/cron/backup without the secret is unauthorized (401)", async ({
    page,
  }) => {
    // No `Authorization: Bearer $CRON_SECRET` header → the job must not run.
    const res = await page.request.get("/api/cron/backup");
    expect(res.status()).toBe(401);
  });
});

test.describe("server enforcement — admin", () => {
  test("POST /api/export/full succeeds for an admin (200)", async ({ page }) => {
    const res = await page.request.post("/api/export/full");
    expect(res.status()).toBe(200);
    // A restore-grade JSON body comes back.
    expect(res.headers()["content-type"] ?? "").toContain("application/json");
  });

  test("GET /api/cron/backup still needs the secret, even as an admin (401)", async ({
    page,
  }) => {
    // The cron is secret-gated, not role-gated — a logged-in admin without the
    // bearer token is still rejected.
    const res = await page.request.get("/api/cron/backup");
    expect(res.status()).toBe(401);
  });
});
