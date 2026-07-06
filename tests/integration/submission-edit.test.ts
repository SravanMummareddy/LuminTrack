import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./db";
import { truncateAll, seedSubmissionEditScenario } from "./helpers";

// Real updateSubmission → test DB; stub the Next.js request couplings.
vi.mock("@/server/db", async () => {
  const real = await import("./db");
  return { prisma: real.testPrisma, isUniqueConstraintError: real.isUniqueConstraintError };
});
vi.mock("@/lib/session", () => ({ requireUser: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// updateSubmission ends in redirect() on success — no-op so it returns instead of throwing.
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import { updateSubmission } from "@/server/actions/submissions";
import { requireUser } from "@/lib/session";

let dbReachable = false;
try {
  await testPrisma.$queryRaw`SELECT 1`;
  dbReachable = true;
} catch {
  console.warn("⚠ integration DB unreachable — skipping (run `npm run test:db:up`)");
}

describe.skipIf(!dbReachable)("updateSubmission — re-attribution, résumé snapshot, bench fields", () => {
  let ctx: Awaited<ReturnType<typeof seedSubmissionEditScenario>>;

  beforeEach(async () => {
    await truncateAll(testPrisma);
    ctx = await seedSubmissionEditScenario(testPrisma);
  });

  /** The edit form always posts id + submittedAt + a résumé choice. Defaults
   *  re-post the seeded values so only the overridden field counts as a change. */
  function editForm(fields: Record<string, string> = {}): FormData {
    const fd = new FormData();
    fd.set("id", ctx.submission.id);
    fd.set("submittedAt", "2026-06-01T10:00"); // == the seeded minute
    fd.set("candidateRate", "80");
    fd.set("submissionNotes", "Original note");
    fd.set("resumeChoice", "none");
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  const lastUpdate = () =>
    testPrisma.activity.findFirst({
      where: { action: "SUBMISSION_UPDATED", submissionId: ctx.submission.id },
      orderBy: { createdAt: "desc" },
    });

  it("an admin re-attributes submittedById and the change is spelled out in the audit", async () => {
    vi.mocked(requireUser).mockResolvedValue(ctx.admin as never);
    await updateSubmission(undefined as never, editForm({ submittedById: ctx.recruiterB.id }));

    const after = await testPrisma.submission.findUnique({ where: { id: ctx.submission.id } });
    expect(after!.submittedById).toBe(ctx.recruiterB.id);

    const audit = await lastUpdate();
    expect(audit, "a SUBMISSION_UPDATED row should exist").not.toBeNull();
    expect(audit!.description).toContain("submitted-by changed from Rec A to Rec B");
  });

  it("a non-admin CANNOT re-attribute submittedById (the field is honored only for admins)", async () => {
    vi.mocked(requireUser).mockResolvedValue(ctx.recruiterA as never);
    await updateSubmission(undefined as never, editForm({ submittedById: ctx.recruiterB.id }));

    const after = await testPrisma.submission.findUnique({ where: { id: ctx.submission.id } });
    expect(after!.submittedById).toBe(ctx.recruiterA.id); // unchanged — re-attribution ignored
  });

  it("editing rate + notes updates the row and lists both fields in the audit", async () => {
    vi.mocked(requireUser).mockResolvedValue(ctx.admin as never);
    await updateSubmission(
      undefined as never,
      editForm({ candidateRate: "95", submissionNotes: "Revised note" }),
    );

    const after = await testPrisma.submission.findUnique({ where: { id: ctx.submission.id } });
    expect(Number(after!.candidateRate)).toBe(95);
    expect(after!.submissionNotes).toBe("Revised note");

    const audit = await lastUpdate();
    expect(audit!.description).toContain("candidate rate");
    expect(audit!.description).toContain("notes");
  });

  it("picking a library résumé snapshots its drive link onto the submission", async () => {
    vi.mocked(requireUser).mockResolvedValue(ctx.admin as never);
    await updateSubmission(
      undefined as never,
      editForm({ resumeChoice: "existing", candidateResumeId: ctx.resume.id }),
    );

    const after = await testPrisma.submission.findUnique({ where: { id: ctx.submission.id } });
    expect(after!.candidateResumeId).toBe(ctx.resume.id);
    expect(after!.resumeBlobUrl).toBe(ctx.resume.blobUrl); // snapshot taken
    expect((await lastUpdate())!.description).toContain("resume");
  });

  it("round-trips the Bench-Sales submission fields", async () => {
    vi.mocked(requireUser).mockResolvedValue(ctx.admin as never);
    await updateSubmission(
      undefined as never,
      editForm({
        engagement: "C2C",
        vendorRecruiterName: "Priya N.",
        jobDuties: "Build + own the billing service end to end.",
        payRate: "70",
        billRate: "110",
        teamLead: "Sriman Udugula",
      }),
    );

    const after = await testPrisma.submission.findUnique({ where: { id: ctx.submission.id } });
    expect(after!.engagement).toBe("C2C");
    expect(after!.vendorRecruiterName).toBe("Priya N.");
    expect(after!.jobDuties).toContain("billing service");
    expect(Number(after!.payRate)).toBe(70);
    expect(Number(after!.billRate)).toBe(110);
    expect(after!.teamLead).toBe("Sriman Udugula");
  });

  it("a true no-op edit writes no SUBMISSION_UPDATED audit row", async () => {
    vi.mocked(requireUser).mockResolvedValue(ctx.admin as never);
    // Re-post every seeded value verbatim — nothing changed.
    await updateSubmission(undefined as never, editForm());

    expect(await lastUpdate()).toBeNull();
  });
});
