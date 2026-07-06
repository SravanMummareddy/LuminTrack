import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./db";
import { truncateAll } from "./helpers";
import { NEW_ORG_ENTITY, OTHER_SOURCE } from "@/lib/labels";

vi.mock("@/server/db", async () => {
  const real = await import("./db");
  return { prisma: real.testPrisma, isUniqueConstraintError: real.isUniqueConstraintError };
});
vi.mock("@/lib/session", () => ({ requireUser: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import { createJob } from "@/server/actions/jobs";
import { requireUser } from "@/lib/session";

let dbReachable = false;
try {
  await testPrisma.$queryRaw`SELECT 1`;
  dbReachable = true;
} catch {
  console.warn("⚠ integration DB unreachable — skipping (run `npm run test:db:up`)");
}

async function seed() {
  const [admin, recruiter] = await Promise.all([
    testPrisma.user.create({
      data: { fullName: "Admin", email: "admin@test.local", passwordHash: "x", role: "MANAGER" },
    }),
    testPrisma.user.create({
      data: { fullName: "Rec", email: "rec@test.local", passwordHash: "x", role: "RECRUITER" },
    }),
  ]);
  const vendor = await testPrisma.vendor.create({ data: { name: "Existing Vendor" } });
  return { admin, recruiter, vendor };
}
type Ctx = Awaited<ReturnType<typeof seed>>;

/** A jobSchema-valid FormData using a free-text source so no source row is needed. */
function jobForm(ctx: Ctx, extra: Record<string, string>): FormData {
  const fd = new FormData();
  fd.set("title", "Senior Engineer");
  fd.set("vendorId", ctx.vendor.id);
  fd.set("sisterCompanySourceId", OTHER_SOURCE);
  fd.set("sourceOther", "Referral");
  fd.set("status", "OPEN");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

const mockedRequireUser = vi.mocked(requireUser);

describe.skipIf(!dbReachable)("createJob — inline add client/vendor", () => {
  let ctx: Ctx;
  beforeEach(async () => {
    await truncateAll(testPrisma);
    ctx = await seed();
  });

  it("creates a new client inline and links the job to it (admin)", async () => {
    mockedRequireUser.mockResolvedValue(ctx.admin as never);
    await createJob({}, jobForm(ctx, { clientId: NEW_ORG_ENTITY, newClientName: "Acme Corp" }));

    const client = await testPrisma.client.findFirst({ where: { name: "Acme Corp" } });
    expect(client).not.toBeNull();
    const job = await testPrisma.job.findFirst({ where: { title: "Senior Engineer" } });
    expect(job?.clientId).toBe(client!.id);
  });

  it("reuses an existing client by case-insensitive name (no duplicate)", async () => {
    await testPrisma.client.create({ data: { name: "Acme Corp" } });
    mockedRequireUser.mockResolvedValue(ctx.admin as never);
    await createJob({}, jobForm(ctx, { clientId: NEW_ORG_ENTITY, newClientName: "acme corp" }));

    expect(await testPrisma.client.count()).toBe(1);
    const job = await testPrisma.job.findFirst({ where: { title: "Senior Engineer" } });
    const client = await testPrisma.client.findFirst();
    expect(job?.clientId).toBe(client!.id);
  });

  it("rejects inline add from a non-admin and creates no job", async () => {
    mockedRequireUser.mockResolvedValue(ctx.recruiter as never);
    const res = await createJob({}, jobForm(ctx, { clientId: NEW_ORG_ENTITY, newClientName: "Acme Corp" }));

    expect(res.error).toMatch(/only admins/i);
    expect(await testPrisma.job.count()).toBe(0);
    expect(await testPrisma.client.count()).toBe(0);
  });

  it("flags a missing new-client name", async () => {
    mockedRequireUser.mockResolvedValue(ctx.admin as never);
    const res = await createJob({}, jobForm(ctx, { clientId: NEW_ORG_ENTITY, newClientName: "" }));

    expect(res.fieldErrors?.clientId).toBeTruthy();
    expect(await testPrisma.job.count()).toBe(0);
  });
});
