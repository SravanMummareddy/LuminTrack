import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./db";
import { truncateAll, seedOrg } from "./helpers";

// Real requirement actions → test DB; stub the Next.js request couplings.
vi.mock("@/server/db", async () => {
  const real = await import("./db");
  return {
    prisma: real.testPrisma,
    isUniqueConstraintError: real.isUniqueConstraintError,
  };
});
vi.mock("@/lib/session", () => ({ requireUser: vi.fn(), getCurrentUser: vi.fn(), getScopedPrisma: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// Success paths end in redirect() — make it a no-op so the action returns
// instead of throwing NEXT_REDIRECT. Gate/error paths return before redirect.
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import {
  createVendorRequirement,
  updateVendorRequirement,
  cancelVendorRequirement,
  convertRequirementToSubmission,
} from "@/server/actions/requirements";
import { requireUser, getScopedPrisma } from "@/lib/session";

let dbReachable = false;
try {
  await testPrisma.$queryRaw`SELECT 1`;
  dbReachable = true;
} catch {
  console.warn("⚠ integration DB unreachable — skipping (run `npm run test:db:up`)");
}

async function seed() {
  const { org, db } = await seedOrg(testPrisma);
  const [admin, lead] = await Promise.all([
    db.user.create({
      data: { fullName: "Admin", email: "admin@test.local", passwordHash: "x", role: "MANAGER" },
    }),
    db.user.create({
      data: { fullName: "Team Lead", email: "lead@test.local", passwordHash: "x", role: "TEAM_LEAD" },
    }),
  ]);
  // Real team + membership so deriveTeamLead resolves the recruiter → its lead.
  const team = await db.team.create({
    data: { name: "Alpha", leadId: lead.id },
  });
  await db.user.update({ where: { id: lead.id }, data: { teamId: team.id } });
  const recruiter = await db.user.create({
    data: {
      fullName: "Rec One",
      email: "rec1@test.local",
      passwordHash: "x",
      role: "RECRUITER",
      teamId: team.id,
    },
  });
  const [client, vendor] = await Promise.all([
    db.client.create({ data: { name: "Client" } }),
    db.vendor.create({ data: { name: "Vendor" } }),
  ]);
  const candidate = await db.candidate.create({
    data: { fullName: "Cand", status: "AVAILABLE", createdById: admin.id },
  });
  const job = await db.job.create({
    data: {
      title: "Senior Engineer",
      clientId: client.id,
      vendorId: vendor.id,
      createdById: admin.id,
    },
  });
  return { org, db, admin, lead, recruiter, client, vendor, candidate, job };
}

type Ctx = Awaited<ReturnType<typeof seed>>;

/** A requirement directly in the DB (bypasses the create action). */
function makeRequirement(ctx: Ctx, extra: Record<string, unknown> = {}) {
  return ctx.db.vendorRequirement.create({
    data: {
      jobId: ctx.job.id,
      candidateId: ctx.candidate.id,
      recruiterId: ctx.recruiter.id,
      createdById: ctx.lead.id,
      payRate: 70,
      billRate: 100,
      ...extra,
    },
  });
}

/** FormData for the convert action. */
function convertForm(
  requirementId: string,
  ctx: Ctx,
  extra: Record<string, string> = {},
): FormData {
  const fd = new FormData();
  fd.set("requirementId", requirementId);
  fd.set("candidateId", ctx.candidate.id);
  fd.set("jobId", ctx.job.id);
  fd.set("submittedById", ctx.recruiter.id);
  fd.set("resumeChoice", "none");
  fd.set("payRate", "70");
  fd.set("billRate", "100");
  // Clear the incidental soft gates (#84) so these tests isolate the convert /
  // duplicate behaviour, not the résumé/bench gates.
  fd.set("originalResumeOverrideReason", "n/a for this test");
  fd.set("benchOverrideReason", "n/a for this test");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

const mockedRequireUser = vi.mocked(requireUser);

describe.skipIf(!dbReachable)("vendor requirement actions", () => {
  let ctx: Ctx;

  beforeEach(async () => {
    await truncateAll(testPrisma);
    ctx = await seed();
    vi.mocked(getScopedPrisma).mockResolvedValue(ctx.db as never);
  });

  it("gates create behind canManageRequirements", async () => {
    const fd = new FormData();
    fd.set("jobId", ctx.job.id);
    // Forms-discipline (PR-1): these are now required to create a requirement.
    // The recruiter is still denied up front on permission, before validation.
    fd.set("location", "Remote");
    fd.set("engagement", "C2C");
    fd.set("vendorRecruiterName", "Vendor Rec");
    fd.set("teamLead", "Lead Person");
    fd.set("recruiterId__na", "1");
    fd.set("payRate__na", "1");
    fd.set("billRate__na", "1");
    fd.set("clientRate__na", "1");

    mockedRequireUser.mockResolvedValue(ctx.recruiter as never);
    const denied = await createVendorRequirement({}, fd);
    expect(denied.error).toMatch(/admins and team leads/i);
    expect(await testPrisma.vendorRequirement.count()).toBe(0);

    mockedRequireUser.mockResolvedValue(ctx.lead as never);
    await createVendorRequirement({}, fd);
    expect(await testPrisma.vendorRequirement.count()).toBe(1);
  });

  it("submits a candidate against an OPEN requirement (VPR stays open, submission links back)", async () => {
    const req = await makeRequirement(ctx);
    mockedRequireUser.mockResolvedValue(ctx.recruiter as never);

    await convertRequirementToSubmission({}, convertForm(req.id, ctx));

    const submissions = await testPrisma.submission.findMany();
    expect(submissions).toHaveLength(1);
    // 1:many — the submission points at the VPR, and the VPR stays OPEN.
    expect(submissions[0].vendorRequirementId).toBe(req.id);
    const reloaded = await testPrisma.vendorRequirement.findUnique({ where: { id: req.id } });
    expect(reloaded?.status).toBe("OPEN");

    // Auto-claim: the submitting recruiter is now assigned to the job.
    const assignment = await testPrisma.jobAssignment.findFirst({
      where: { jobId: ctx.job.id, recruiterId: ctx.recruiter.id },
    });
    expect(assignment).not.toBeNull();

    const logged = await testPrisma.activity.findFirst({
      where: { action: "REQUIREMENT_CONVERTED", requirementId: req.id },
    });
    expect(logged).not.toBeNull();
  });

  it("accepts multiple candidates against the same OPEN requirement", async () => {
    const req = await makeRequirement(ctx);
    mockedRequireUser.mockResolvedValue(ctx.recruiter as never);

    // A second candidate to submit against the same requirement.
    const cand2 = await ctx.db.candidate.create({
      data: {
        fullName: "Cand Two",
        status: "AVAILABLE",
        createdById: ctx.admin.id,
      },
    });

    await convertRequirementToSubmission({}, convertForm(req.id, ctx));
    await convertRequirementToSubmission(
      {},
      convertForm(req.id, ctx, { candidateId: cand2.id }),
    );

    const linked = await testPrisma.submission.findMany({
      where: { vendorRequirementId: req.id },
    });
    expect(linked).toHaveLength(2);
    const reloaded = await testPrisma.vendorRequirement.findUnique({ where: { id: req.id } });
    expect(reloaded?.status).toBe("OPEN");
  });

  it("flags a duplicate when the same candidate is submitted twice", async () => {
    const req = await makeRequirement(ctx);
    mockedRequireUser.mockResolvedValue(ctx.recruiter as never);

    await convertRequirementToSubmission({}, convertForm(req.id, ctx));
    const second = await convertRequirementToSubmission({}, convertForm(req.id, ctx));

    // The per-(candidate, job) duplicate gate fires instead of silently
    // creating a second identical submission.
    expect(second.pendingGates?.map((g) => g.kind)).toContain("duplicate");
    expect(await testPrisma.submission.count()).toBe(1);
  });

  it("blocks convert when the job is closed (requirement stays OPEN)", async () => {
    await ctx.db.job.update({ where: { id: ctx.job.id }, data: { status: "CLOSED" } });
    const req = await makeRequirement(ctx);
    mockedRequireUser.mockResolvedValue(ctx.recruiter as never);

    const res = await convertRequirementToSubmission({}, convertForm(req.id, ctx));
    expect(res.error).toMatch(/no longer accepting/i);
    expect(await testPrisma.submission.count()).toBe(0);
    const reloaded = await testPrisma.vendorRequirement.findUnique({ where: { id: req.id } });
    expect(reloaded?.status).toBe("OPEN");
  });

  it("blocks edit once the requirement is no longer OPEN", async () => {
    const req = await makeRequirement(ctx, { status: "CONVERTED" });
    mockedRequireUser.mockResolvedValue(ctx.lead as never);

    const fd = new FormData();
    fd.set("id", req.id);
    fd.set("location", "Austin, TX");
    const res = await updateVendorRequirement({}, fd);
    expect(res.error).toMatch(/converted or cancelled/i);
  });

  it("cancels an OPEN requirement", async () => {
    const req = await makeRequirement(ctx);
    mockedRequireUser.mockResolvedValue(ctx.lead as never);

    const fd = new FormData();
    fd.set("id", req.id);
    await cancelVendorRequirement(fd);

    const reloaded = await testPrisma.vendorRequirement.findUnique({ where: { id: req.id } });
    expect(reloaded?.status).toBe("CANCELLED");
    const cancelled = await testPrisma.activity.findFirst({
      where: { action: "REQUIREMENT_CANCELLED", requirementId: req.id },
    });
    expect(cancelled).not.toBeNull();
  });
});
