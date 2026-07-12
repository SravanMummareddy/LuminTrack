import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma } from "./db";
import { truncateAll } from "./helpers";
import { orgScopeExtension } from "@/server/db";

// The load-bearing multi-tenancy proof: two organizations with overlapping data,
// asserting that a `scopedPrisma(orgId)` client can NEVER read, mutate, or delete
// another tenant's rows — across finds, counts, aggregates, and writes. Runs the
// real scope extension against a real Postgres (Docker), so it exercises the same
// enforcement the app relies on.

let dbReachable = false;
try {
  await testPrisma.$queryRaw`SELECT 1`;
  dbReachable = true;
} catch {
  console.warn("⚠ integration DB unreachable — skipping (run `npm run test:db:up`)");
}

const scoped = (orgId: string) => testPrisma.$extends(orgScopeExtension(orgId));

async function seedOrgWithData(slug: string, emailPrefix: string) {
  const org = await testPrisma.organization.create({ data: { name: slug, slug } });
  const db = scoped(org.id);
  const user = await db.user.create({
    data: {
      fullName: "Owner",
      email: `${emailPrefix}@tenant.local`,
      passwordHash: "x",
      role: "MANAGER",
    },
  });
  // Deliberately the SAME client name in both orgs — proves the name unique is
  // per-org (composite), not global.
  const client = await db.client.create({ data: { name: "Shared Client Name" } });
  const candidate = await db.candidate.create({
    data: { fullName: "Cand", createdById: user.id },
  });
  return { org, db, user, client, candidate };
}

describe.skipIf(!dbReachable)("tenant isolation — scopedPrisma", () => {
  let A: Awaited<ReturnType<typeof seedOrgWithData>>;
  let B: Awaited<ReturnType<typeof seedOrgWithData>>;

  beforeEach(async () => {
    await truncateAll(testPrisma);
    A = await seedOrgWithData("org-a", "a");
    B = await seedOrgWithData("org-b", "b");
  });

  it("create auto-stamps the caller's org", () => {
    expect(A.client.organizationId).toBe(A.org.id);
    expect(B.client.organizationId).toBe(B.org.id);
    expect(A.org.id).not.toBe(B.org.id);
  });

  it("the same client name coexists in both orgs (per-org unique)", async () => {
    const both = await testPrisma.client.findMany({
      where: { name: "Shared Client Name" },
    });
    expect(both).toHaveLength(2);
  });

  it("findMany returns only the caller's org", async () => {
    const aClients = await A.db.client.findMany();
    expect(aClients).toHaveLength(1);
    expect(aClients[0]!.id).toBe(A.client.id);
  });

  it("count is org-scoped (unscoped base sees both)", async () => {
    expect(await A.db.client.count()).toBe(1);
    expect(await B.db.client.count()).toBe(1);
    expect(await testPrisma.client.count()).toBe(2);
  });

  it("findUnique by another org's id returns null", async () => {
    expect(await A.db.client.findUnique({ where: { id: B.client.id } })).toBeNull();
    expect(
      await A.db.client.findUnique({ where: { id: A.client.id } }),
    ).not.toBeNull();
  });

  it("updateMany never touches another org's rows", async () => {
    const res = await A.db.client.updateMany({
      where: {},
      data: { location: "changed" },
    });
    expect(res.count).toBe(1);
    const bClient = await testPrisma.client.findUnique({
      where: { id: B.client.id },
    });
    expect(bClient?.location).toBeNull();
  });

  it("update by another org's id affects nothing", async () => {
    await expect(
      A.db.client.update({
        where: { id: B.client.id },
        data: { location: "hacked" },
      }),
    ).rejects.toThrow();
    const bClient = await testPrisma.client.findUnique({
      where: { id: B.client.id },
    });
    expect(bClient?.location).toBeNull();
  });

  it("delete by another org's id affects nothing", async () => {
    await expect(
      A.db.candidate.delete({ where: { id: B.candidate.id } }),
    ).rejects.toThrow();
    expect(
      await testPrisma.candidate.findUnique({ where: { id: B.candidate.id } }),
    ).not.toBeNull();
  });

  it("groupBy is org-scoped", async () => {
    const grouped = await A.db.candidate.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const total = grouped.reduce((n, g) => n + g._count._all, 0);
    expect(total).toBe(1);
  });

  it("global tables (Permission) are shared, not org-filtered", async () => {
    await testPrisma.permission.create({
      data: { key: "test:iso", label: "L", category: "c" },
    });
    expect(await A.db.permission.count()).toBe(1);
    expect(await B.db.permission.count()).toBe(1);
  });
});
