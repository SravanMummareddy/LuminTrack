import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./db";
import { truncateAll, seedSubmissionScenario } from "./helpers";

// Real createSubmission → test DB; stub the Next.js request couplings.
vi.mock("@/server/db", async () => {
  const real = await import("./db");
  return { prisma: real.testPrisma, isUniqueConstraintError: real.isUniqueConstraintError };
});
vi.mock("@/lib/session", () => ({ requireUser: vi.fn(), getCurrentUser: vi.fn(), getScopedPrisma: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// createSubmission ends in redirect() on success — make it a no-op so the action
// returns undefined instead of throwing NEXT_REDIRECT. Gate paths return a
// FormState *before* redirect, so they're unaffected.
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import { createSubmission } from "@/server/actions/submissions";
import { requireUser, getScopedPrisma } from "@/lib/session";

let dbReachable = false;
try {
  await testPrisma.$queryRaw`SELECT 1`;
  dbReachable = true;
} catch {
  console.warn("⚠ integration DB unreachable — skipping (run `npm run test:db:up`)");
}

describe.skipIf(!dbReachable)("createSubmission — gate flows", () => {
  let ctx: Awaited<ReturnType<typeof seedSubmissionScenario>>;

  beforeEach(async () => {
    await truncateAll(testPrisma);
    ctx = await seedSubmissionScenario(testPrisma);
    vi.mocked(getScopedPrisma).mockResolvedValue(ctx.db as never);
  });

  /** Create a job, optionally with extra fields. */
  function makeJob(extra: Record<string, unknown> = {}) {
    return ctx.db.job.create({
      data: {
        title: "Senior Engineer",
        clientId: ctx.client.id,
        vendorId: ctx.vendor.id,
        createdById: ctx.admin.id,
        ...extra,
      },
    });
  }

  /** A createSubmission FormData. Candidate + résumé-none are baked in. */
  function form(jobId: string, submittedById: string, extra: Record<string, string> = {}): FormData {
    const fd = new FormData();
    fd.set("candidateId", ctx.candidate.id);
    fd.set("jobId", jobId);
    fd.set("submittedById", submittedById);
    fd.set("resumeChoice", "none");
    // Clear the incidental soft gates (#84 added no_original_resume + not_marketing
    // as always-on) so each test isolates its target gate (assignment / duplicate).
    fd.set("originalResumeOverrideReason", "n/a for this test");
    fd.set("benchOverrideReason", "n/a for this test");
    // Forms-discipline (PR-4): the create schema now requires each commercial
    // term to carry a value or an explicit N/A flag — mark them N/A so these
    // tests isolate the gate under test, not the terms validation.
    fd.set("engagement__na", "1");
    fd.set("vendorRecruiterName__na", "1");
    fd.set("payRate__na", "1");
    fd.set("billRate__na", "1");
    fd.set("clientRate__na", "1");
    fd.set("teamLead__na", "1");
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  }

  const subCount = (jobId: string) => testPrisma.submission.count({ where: { jobId } });

  // ── Assignment gate (Round 5) ──────────────────────────────────────────────

  it("gates a recruiter who isn't assigned to the job (not_assigned), writing nothing", async () => {
    vi.mocked(requireUser).mockResolvedValue(ctx.recruiter as never);
    const job = await makeJob();

    const res = await createSubmission(undefined as never, form(job.id, ctx.recruiter.id));

    expect(res?.pendingGates?.map((g) => g.kind)).toContain("not_assigned");
    expect(await subCount(job.id)).toBe(0);
    // No phantom self-assignment when the claim flag is absent.
    expect(await testPrisma.jobAssignment.count({ where: { jobId: job.id } })).toBe(0);
  });

  it("lets a recruiter self-claim with claim=1 — submission + assignment commit together", async () => {
    vi.mocked(requireUser).mockResolvedValue(ctx.recruiter as never);
    const job = await makeJob();

    await createSubmission(undefined as never, form(job.id, ctx.recruiter.id, { claim: "1" }));

    expect(await subCount(job.id)).toBe(1);
    const assignment = await testPrisma.jobAssignment.findFirst({
      where: { jobId: job.id, recruiterId: ctx.recruiter.id },
    });
    expect(assignment, "self-claim should create the JobAssignment").not.toBeNull();

    const actions = (
      await testPrisma.activity.findMany({ select: { action: true } })
    ).map((a) => a.action);
    expect(actions).toContain("RECRUITER_ASSIGNED"); // the claim is audited
    expect(actions).toContain("CANDIDATE_SUBMITTED");
  });

  it("lets an admin submit to a job with no assignment (and doesn't self-claim them)", async () => {
    vi.mocked(requireUser).mockResolvedValue(ctx.admin as never);
    const job = await makeJob();

    await createSubmission(undefined as never, form(job.id, ctx.admin.id));

    expect(await subCount(job.id)).toBe(1);
    // Admins bypass the assignment gate; no JobAssignment is fabricated for them.
    expect(await testPrisma.jobAssignment.count({ where: { jobId: job.id } })).toBe(0);
  });

  // ── Duplicate gate (§C4) ────────────────────────────────────────────────────

  it("gates a duplicate (same candidate+job) and overrides with a reason + audit note", async () => {
    vi.mocked(requireUser).mockResolvedValue(ctx.admin as never);
    const job = await makeJob();

    // First submission goes through.
    await createSubmission(undefined as never, form(job.id, ctx.admin.id));
    const first = await testPrisma.submission.findFirst({ where: { jobId: job.id } });

    // Second, with no reason, is gated.
    const gated = await createSubmission(undefined as never, form(job.id, ctx.admin.id));
    const dup = gated?.pendingGates?.find((g) => g.kind === "duplicate");
    expect(dup).toMatchObject({ existingSubmissionId: first!.id });
    expect(await subCount(job.id)).toBe(1); // nothing written

    // Second, with a reason, overrides.
    await createSubmission(
      undefined as never,
      form(job.id, ctx.admin.id, { duplicateReason: "role was rebooted" }),
    );
    expect(await subCount(job.id)).toBe(2);
    const dupe = await testPrisma.submission.findFirst({
      where: { jobId: job.id, duplicateReason: "role was rebooted" },
    });
    expect(dupe, "the override submission carries the reason").not.toBeNull();

    const note = await testPrisma.activity.findFirst({
      where: { action: "CANDIDATE_SUBMITTED", submissionId: dupe!.id },
      select: { note: true },
    });
    expect(note!.note).toContain("duplicate:role was rebooted");
  });
});
