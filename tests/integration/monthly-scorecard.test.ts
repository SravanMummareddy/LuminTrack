import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./db";
import { truncateAll } from "./helpers";

// getMonthlyScorecard reads the `prisma` singleton — point it at the test DB.
// It's a pure read (no auth), so no session/cache/navigation mocks are needed.
vi.mock("@/server/db", async () => {
  const real = await import("./db");
  return { prisma: real.testPrisma, isUniqueConstraintError: real.isUniqueConstraintError };
});

import { getMonthlyScorecard } from "@/server/queries/monthly-scorecard";

let dbReachable = false;
try {
  await testPrisma.$queryRaw`SELECT 1`;
  dbReachable = true;
} catch {
  console.warn("⚠ integration DB unreachable — skipping (run `npm run test:db:up`)");
}

const JUNE = { year: 2026, monthIndex: 5 }; // June 2026 — Jun 1 is a Monday → 5 Mon-start weeks

/**
 * A deterministic June-2026 fixture exercising every metric + the
 * first-use/zero-seed/team-filter rules. Local-time Date constructors keep the
 * week bucketing stable regardless of the runner's timezone.
 *
 *  recruiterA (Alpha):
 *   - May 20 sub to V1   → makes V1 a *prior* vendor (NOT a June new-vendor)
 *   - Jun 3  sub to V1 (SUBMITTED)   week0
 *   - Jun 10 sub to V1 (BACKED_OUT)  week1   → submissions AND backouts
 *   - Jun 10 sub to V2 (SELECTED)    week1   → V2 is a June new-vendor
 *   - interview round on the V2 sub, Jun 12  week1
 *   - May 30 round (ignored, out of month)
 *   - placement on the V2 sub, startDate Jun 15  week2  → closure
 *  recruiterB (Beta):
 *   - Jun 5 sub to V1 (SUBMITTED)  week0  → B's own first use of V1 → new-vendor
 *  recruiterC (Alpha, INACTIVE): one June sub — must be dropped entirely.
 *  admin: role ADMIN — never appears.
 */
async function seedScorecard() {
  const admin = await testPrisma.user.create({
    data: { fullName: "Admin", email: "admin@s.local", passwordHash: "x", role: "ADMIN" },
  });
  const recA = await testPrisma.user.create({
    data: { fullName: "Rec A", email: "a@s.local", passwordHash: "x", role: "RECRUITER", empId: "EMP-101", teamLabel: "Alpha" },
  });
  const recB = await testPrisma.user.create({
    data: { fullName: "Rec B", email: "b@s.local", passwordHash: "x", role: "RECRUITER", empId: "EMP-102", teamLabel: "Beta" },
  });
  const recC = await testPrisma.user.create({
    data: { fullName: "Rec C", email: "c@s.local", passwordHash: "x", role: "RECRUITER", empId: "EMP-103", teamLabel: "Alpha", isActive: false },
  });

  const client = await testPrisma.client.create({ data: { name: "Client" } });
  const v1 = await testPrisma.vendor.create({ data: { name: "Vendor One" } });
  const v2 = await testPrisma.vendor.create({ data: { name: "Vendor Two" } });
  const cand = await testPrisma.candidate.create({
    data: { fullName: "Cand", status: "AVAILABLE", createdBy: { connect: { id: admin.id } } },
  });

  const mkJob = (vendorId: string) =>
    testPrisma.job.create({
      data: {
        title: "Role",
        candidateRate: 80,
        client: { connect: { id: client.id } },
        vendor: { connect: { id: vendorId } },
        createdBy: { connect: { id: admin.id } },
      },
    });
  const jobV1 = await mkJob(v1.id);
  const jobV2 = await mkJob(v2.id);

  const mkSub = (jobId: string, by: string, when: Date, status: string) =>
    testPrisma.submission.create({
      data: {
        status: status as never,
        candidateRate: 80,
        submittedAt: when,
        candidate: { connect: { id: cand.id } },
        job: { connect: { id: jobId } },
        submittedBy: { connect: { id: by } },
      },
    });

  // recruiterA
  await mkSub(jobV1.id, recA.id, new Date(2026, 4, 20), "SUBMITTED"); // May — prior V1 use
  await mkSub(jobV1.id, recA.id, new Date(2026, 5, 3, 12), "SUBMITTED"); // week0
  await mkSub(jobV1.id, recA.id, new Date(2026, 5, 10, 12), "BACKED_OUT"); // week1
  const aV2 = await mkSub(jobV2.id, recA.id, new Date(2026, 5, 10, 12), "SELECTED"); // week1, new vendor
  await testPrisma.interviewRound.create({
    data: { roundOrder: 1, roundName: "Tech", interviewType: "CLIENT_INTERVIEW", scheduledAt: new Date(2026, 5, 12, 9), submissionId: aV2.id },
  });
  await testPrisma.interviewRound.create({
    data: { roundOrder: 1, roundName: "Old", interviewType: "VENDOR_SCREENING", scheduledAt: new Date(2026, 4, 30, 9), submissionId: aV2.id }, // May — ignored
  });
  await testPrisma.placement.create({
    data: { startDate: new Date(2026, 5, 15, 9), submissionId: aV2.id, candidateId: cand.id, jobId: jobV2.id },
  });

  // recruiterB
  await mkSub(jobV1.id, recB.id, new Date(2026, 5, 5, 12), "SUBMITTED"); // week0, B's first V1 use

  // recruiterC (inactive) — must be dropped
  await mkSub(jobV1.id, recC.id, new Date(2026, 5, 4, 12), "SUBMITTED");

  return { recA, recB };
}

describe.skipIf(!dbReachable)("getMonthlyScorecard — metric bucketing", () => {
  let ids: Awaited<ReturnType<typeof seedScorecard>>;

  beforeEach(async () => {
    await truncateAll(testPrisma);
    ids = await seedScorecard();
  });

  it("shapes the month: label, 5 Mon-start weeks, only active recruiters", async () => {
    const sc = await getMonthlyScorecard(JUNE);
    expect(sc.monthLabel).toBe("June 2026");
    expect(sc.weekLabels).toHaveLength(5);
    // recruiters only (admin excluded), active only (C excluded) → A + B.
    expect(sc.rows.map((r) => r.recruiterName).sort()).toEqual(["Rec A", "Rec B"]);
  });

  it("counts recruiter A's metrics in the right weeks with correct totals", async () => {
    const sc = await getMonthlyScorecard(JUNE);
    const a = sc.rows.find((r) => r.recruiterId === ids.recA.id)!;

    // Submissions: Jun 3 (w0) + Jun 10 ×2 (w1) = 3. May sub is outside the month.
    expect(a.total.submissions).toBe(3);
    expect(a.weeks[0].submissions).toBe(1);
    expect(a.weeks[1].submissions).toBe(2);

    // Backouts: the BACKED_OUT sub also counts as a submission, and once as a backout.
    expect(a.total.backouts).toBe(1);
    expect(a.weeks[1].backouts).toBe(1);

    // Interviews: only the Jun 12 round (the May 30 one is ignored).
    expect(a.total.interviews).toBe(1);
    expect(a.weeks[1].interviews).toBe(1);

    // Closures: the placement startDate Jun 15 → week2.
    expect(a.total.closures).toBe(1);
    expect(a.weeks[2].closures).toBe(1);

    // New vendors: V1 was first used in May (prior) so only V2 (Jun 10, w1) counts.
    expect(a.total.newVendors).toBe(1);
    expect(a.weeks[1].newVendors).toBe(1);
  });

  it("counts each recruiter's vendor first-use independently", async () => {
    const sc = await getMonthlyScorecard(JUNE);
    const b = sc.rows.find((r) => r.recruiterId === ids.recB.id)!;
    // B's first-ever use of V1 is Jun 5 → counts for B even though A used V1 earlier.
    expect(b.total.newVendors).toBe(1);
    expect(b.weeks[0].newVendors).toBe(1);
    expect(b.total.submissions).toBe(1);
  });

  it("filters by team label", async () => {
    const sc = await getMonthlyScorecard({ ...JUNE, teamLabel: "Alpha" });
    expect(sc.rows.map((r) => r.recruiterName)).toEqual(["Rec A"]); // B is Beta, C inactive
  });

  it("zero-seeds every active recruiter for a month with no activity", async () => {
    const sc = await getMonthlyScorecard({ year: 2026, monthIndex: 6 }); // July — empty
    expect(sc.rows).toHaveLength(2);
    for (const r of sc.rows) {
      expect(r.total).toEqual({ submissions: 0, interviews: 0, newVendors: 0, closures: 0, backouts: 0 });
    }
  });
});
