import { describe, it, expect, vi } from "vitest";
import { testPrisma } from "./db";
import { truncateAll, seedOrg } from "./helpers";
import { seedRbac } from "@/server/rbac-seed";

// buildBackupJson imports getScopedPrisma from @/lib/session (used only by the
// preflight, which we don't call) — mock it so the real session → @/server/db →
// Neon adapter chain never loads. restore-backup imports only types.
vi.mock("@/server/db", async () => {
  const real = await import("./db");
  return { prisma: real.testPrisma, isUniqueConstraintError: real.isUniqueConstraintError };
});
vi.mock("@/lib/session", () => ({
  getScopedPrisma: vi.fn(),
  requireUser: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import { buildBackupJson } from "@/server/exporters/build-backup-json";
import {
  restoreBackup,
  PLACEHOLDER_PASSWORD_HASH,
} from "@/server/exporters/restore-backup";

let dbReachable = false;
try {
  await testPrisma.$queryRaw`SELECT 1`;
  dbReachable = true;
} catch {
  console.warn("⚠ integration DB unreachable — skipping (run `npm run test:db:up`)");
}

describe.skipIf(!dbReachable)("backup → restore round-trip", () => {
  it("restores org, users (team/role/reportsTo), referrer, and a referrer-linked candidate", async () => {
    await truncateAll(testPrisma);
    const { org, db } = await seedOrg(testPrisma);
    // RBAC catalog + system roles for the org (the tables the flat restore omitted).
    await seedRbac(testPrisma, org.id);
    const managerRole = await testPrisma.role.findFirst({
      where: { organizationId: org.id, systemRole: "MANAGER" },
    });
    expect(managerRole, "seedRbac should create a MANAGER role").not.toBeNull();

    // Exercise BOTH circular FKs: a team led by the manager (Team.leadId → User),
    // and a recruiter who reports to the manager (User.reportsToId → User self).
    const manager = await db.user.create({
      data: {
        fullName: "Boss",
        email: "boss@t.local",
        passwordHash: "real-hash-boss",
        role: "MANAGER",
        isPlatformAdmin: true,
        roleId: managerRole!.id,
      },
    });
    const team = await db.team.create({ data: { name: "Alpha", leadId: manager.id } });
    await db.user.update({ where: { id: manager.id }, data: { teamId: team.id } });
    const rec = await db.user.create({
      data: {
        fullName: "Rec",
        email: "rec@t.local",
        passwordHash: "real-hash-rec",
        role: "RECRUITER",
        teamId: team.id,
        reportsToId: manager.id,
      },
    });

    // Referrer + a candidate linked to it — the Candidate.referrerId FK that
    // FK-violated on restore before the referrer table was included.
    const referrer = await db.referrer.create({ data: { name: "Jane Referrer" } });
    const cand = await db.candidate.create({
      data: {
        fullName: "Cand",
        status: "AVAILABLE",
        createdById: manager.id,
        referrerId: referrer.id,
      },
    });

    // Back up this org, then blow everything away and restore from the JSON.
    const backup = await buildBackupJson(db, org.id);
    expect(backup.version).toBe(3);
    await restoreBackup(testPrisma, backup);

    // Organization itself came back (nothing else can FK-resolve without it).
    expect(
      await testPrisma.organization.findUnique({ where: { id: org.id } }),
    ).not.toBeNull();

    // Users came back WITH their governance columns + the deferred self-ref FK.
    const bossAfter = await testPrisma.user.findUnique({ where: { id: manager.id } });
    expect(bossAfter?.organizationId).toBe(org.id);
    expect(bossAfter?.isPlatformAdmin).toBe(true);
    expect(bossAfter?.roleId).toBe(managerRole!.id);
    expect(bossAfter?.teamId).toBe(team.id);
    // Restored users are login-blocked (placeholder hash, inactive).
    expect(bossAfter?.passwordHash).toBe(PLACEHOLDER_PASSWORD_HASH);
    expect(bossAfter?.isActive).toBe(false);

    const recAfter = await testPrisma.user.findUnique({ where: { id: rec.id } });
    expect(recAfter?.reportsToId).toBe(manager.id); // pass-2 self-ref
    expect(recAfter?.teamId).toBe(team.id);

    // Team.leadId (the other circular FK) restored in pass 2.
    const teamAfter = await testPrisma.team.findUnique({ where: { id: team.id } });
    expect(teamAfter?.leadId).toBe(manager.id);

    // Referrer + the candidate→referrer link survive.
    expect(
      await testPrisma.referrer.findUnique({ where: { id: referrer.id } }),
    ).not.toBeNull();
    const candAfter = await testPrisma.candidate.findUnique({ where: { id: cand.id } });
    expect(candAfter?.referrerId).toBe(referrer.id);
  });

  it("refuses a pre-v3 backup (predates the tenancy tables)", async () => {
    await expect(
      restoreBackup(testPrisma, { version: 2, tables: {} }),
    ).rejects.toThrow(/v3/i);
  });
});
