import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./db";
import { truncateAll } from "./helpers";

// Real requirement actions → test DB; stub the Next.js request couplings.
vi.mock("@/server/db", async () => {
  const real = await import("./db");
  return {
    prisma: real.testPrisma,
    isUniqueConstraintError: real.isUniqueConstraintError,
  };
});
vi.mock("@/lib/session", () => ({ requireUser: vi.fn(), getCurrentUser: vi.fn() }));
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
import { requireUser } from "@/lib/session";

let dbReachable = false;
try {
  await testPrisma.$queryRaw`SELECT 1`;
  dbReachable = true;
} catch {
  console.warn("⚠ integration DB unreachable — skipping (run `npm run test:db:up`)");
}

async function seed() {
  const [admin, lead, recruiter] = await Promise.all([
    testPrisma.user.create({
      data: { fullName: "Admin", email: "admin@test.local", passwordHash: "x", role: "ADMIN" },
    }),
    testPrisma.user.create({
      data: {
        fullName: "Team Lead",
        email: "lead@test.local",
        passwordHash: "x",
        role: "RECRUITER",
        isTeamLead: true,
        teamLabel: "Alpha",
      },
    }),
    testPrisma.user.create({
      data: {
        fullName: "Rec One",
        email: "rec1@test.local",
        passwordHash: "x",
        role: "RECRUITER",
        teamLabel: "Alpha",
      },
    }),
  ]);
  const [client, vendor] = await Promise.all([
    testPrisma.client.create({ data: { name: "Client" } }),
    testPrisma.vendor.create({ data: { name: "Vendor" } }),
  ]);
  const candidate = await testPrisma.candidate.create({
    data: { fullName: "Cand", status: "AVAILABLE", createdBy: { connect: { id: admin.id } } },
  });
  const job = await testPrisma.job.create({
    data: {
      title: "Senior Engineer",
      candidateRate: 80,
      client: { connect: { id: client.id } },
      vendor: { connect: { id: vendor.id } },
      createdBy: { connect: { id: admin.id } },
    },
  });
  return { admin, lead, recruiter, client, vendor, candidate, job };
}

type Ctx = Awaited<ReturnType<typeof seed>>;

/** A requirement directly in the DB (bypasses the create action). */
function makeRequirement(ctx: Ctx, extra: Record<string, unknown> = {}) {
  return testPrisma.vendorRequirement.create({
    data: {
      job: { connect: { id: ctx.job.id } },
      candidate: { connect: { id: ctx.candidate.id } },
      recruiter: { connect: { id: ctx.recruiter.id } },
      createdBy: { connect: { id: ctx.lead.id } },
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
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

const mockedRequireUser = vi.mocked(requireUser);

describe.skipIf(!dbReachable)("vendor requirement actions", () => {
  let ctx: Ctx;

  beforeEach(async () => {
    await truncateAll(testPrisma);
    ctx = await seed();
  });

  it("gates create behind canManageRequirements", async () => {
    const fd = new FormData();
    fd.set("jobId", ctx.job.id);

    mockedRequireUser.mockResolvedValue(ctx.recruiter as never);
    const denied = await createVendorRequirement({}, fd);
    expect(denied.error).toMatch(/admins and team leads/i);
    expect(await testPrisma.vendorRequirement.count()).toBe(0);

    mockedRequireUser.mockResolvedValue(ctx.lead as never);
    await createVendorRequirement({}, fd);
    expect(await testPrisma.vendorRequirement.count()).toBe(1);
  });

  it("converts an OPEN requirement into a submission (with auto-claim)", async () => {
    const req = await makeRequirement(ctx);
    mockedRequireUser.mockResolvedValue(ctx.recruiter as never);

    await convertRequirementToSubmission({}, convertForm(req.id, ctx));

    const submissions = await testPrisma.submission.findMany();
    expect(submissions).toHaveLength(1);
    const reloaded = await testPrisma.vendorRequirement.findUnique({ where: { id: req.id } });
    expect(reloaded?.status).toBe("CONVERTED");
    expect(reloaded?.convertedSubmissionId).toBe(submissions[0].id);
    expect(reloaded?.convertedById).toBe(ctx.recruiter.id);

    // Auto-claim: the converting recruiter is now assigned to the job.
    const assignment = await testPrisma.jobAssignment.findFirst({
      where: { jobId: ctx.job.id, recruiterId: ctx.recruiter.id },
    });
    expect(assignment).not.toBeNull();

    const converted = await testPrisma.activity.findFirst({
      where: { action: "REQUIREMENT_CONVERTED", requirementId: req.id },
    });
    expect(converted).not.toBeNull();
  });

  it("is idempotent on double-convert (no second submission)", async () => {
    const req = await makeRequirement(ctx);
    mockedRequireUser.mockResolvedValue(ctx.recruiter as never);

    await convertRequirementToSubmission({}, convertForm(req.id, ctx));
    const second = await convertRequirementToSubmission({}, convertForm(req.id, ctx));

    expect(second.error).toMatch(/already (been )?converted/i);
    expect(await testPrisma.submission.count()).toBe(1);
  });

  it("blocks convert when the job is closed (requirement stays OPEN)", async () => {
    await testPrisma.job.update({ where: { id: ctx.job.id }, data: { status: "CLOSED" } });
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
