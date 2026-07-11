import { describe, it, expect } from "vitest";
import { scopeArgs } from "@/server/org-scope";
import { canManageOrganizations } from "@/lib/permissions";

// Pure unit test of the tenant-scope injection — no database. `scopeArgs` is the
// exact function the extension runs before each query. The real cross-tenant
// behavior against Postgres is covered by tests/integration/tenant-isolation.test.ts.

const ORG = "org-123";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (model: string, operation: string, args: unknown): any =>
  scopeArgs(ORG, model, operation, args);

describe("orgScopeExtension — where/data injection", () => {
  it("injects organizationId into findMany where", async () => {
    const out = await run("Job", "findMany", {});
    expect(out.where.organizationId).toBe(ORG);
  });

  it("injects organizationId into a findUnique where (extendedWhereUnique)", async () => {
    const out = await run("Job", "findUnique", { where: { id: "x" } });
    expect(out.where).toEqual({ id: "x", organizationId: ORG });
  });

  it("injects organizationId into update / delete / count / groupBy where", async () => {
    for (const op of ["update", "delete", "count", "groupBy", "updateMany", "deleteMany"]) {
      const out = await run("Submission", op, { where: { status: "SUBMITTED" } });
      expect(out.where.organizationId).toBe(ORG);
    }
  });

  it("stamps organizationId onto create data", async () => {
    const out = await run("Candidate", "create", { data: { fullName: "A" } });
    expect(out.data.organizationId).toBe(ORG);
  });

  it("stamps every row of a createMany array", async () => {
    const out = await run("Activity", "createMany", { data: [{ a: 1 }, { a: 2 }] });
    expect(out.data.every((d: { organizationId: string }) => d.organizationId === ORG)).toBe(true);
  });

  it("stamps upsert where AND create", async () => {
    const out = await run("LookupOption", "upsert", {
      where: { id: "x" },
      create: { value: "v" },
      update: {},
    });
    expect(out.where.organizationId).toBe(ORG);
    expect(out.create.organizationId).toBe(ORG);
  });

  it("leaves GLOBAL models (Permission, Organization) untouched", async () => {
    const perm = await run("Permission", "findMany", { where: { category: "x" } });
    expect(perm.where.organizationId).toBeUndefined();
    const org = await run("Organization", "findMany", {});
    expect(org.where).toBeUndefined();
  });
});

describe("canManageOrganizations — platform super-admin", () => {
  it("is true only for a platform admin", () => {
    expect(canManageOrganizations({ isPlatformAdmin: true })).toBe(true);
    expect(canManageOrganizations({ isPlatformAdmin: false })).toBe(false);
    expect(canManageOrganizations({})).toBe(false);
    expect(canManageOrganizations(null)).toBe(false);
    // A manager-tier role does NOT imply platform admin (orthogonal axes).
    expect(canManageOrganizations({ permissions: ["tier:manager"] })).toBe(false);
  });
});
