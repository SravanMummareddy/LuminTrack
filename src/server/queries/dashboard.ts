import { prisma } from "@/server/db";
import {
  AGING_BUCKETS,
  agingBucket,
  buildJobWhere,
  buildSubmissionWhere,
  daysSince,
  type AnalyticsFilters,
} from "@/lib/analytics";
import { JOB_STATUSES, SUBMISSION_STATUSES, jobSourceLabel } from "@/lib/labels";
import type { JobStatus, SubmissionStatus } from "@/generated/prisma/enums";

/**
 * Every metric the Dashboard (spec §9.1) renders, computed in three queries:
 * jobs, submissions, and the active-recruiter list. Aggregation runs in memory
 * — fine for a small internal team's data volume.
 */
export async function getDashboardData(filters: AnalyticsFilters) {
  const [jobs, submissions, recruiters] = await Promise.all([
    prisma.job.findMany({
      where: buildJobWhere(filters),
      select: {
        status: true,
        createdAt: true,
        sisterCompanySource: { select: { name: true } },
        sourceOther: true,
        _count: { select: { assignments: true } },
      },
    }),
    prisma.submission.findMany({
      where: buildSubmissionWhere(filters),
      select: {
        status: true,
        submittedById: true,
        _count: { select: { interviewRounds: true } },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  // ── Jobs ──
  const jobsByStatus = JOB_STATUSES.map((status) => ({
    status,
    count: jobs.filter((j) => j.status === status).length,
  }));

  const sourceMap = new Map<string, { name: string; count: number }>();
  for (const job of jobs) {
    const name = jobSourceLabel(job);
    const entry = sourceMap.get(name) ?? { name, count: 0 };
    entry.count += 1;
    sourceMap.set(name, entry);
  }
  const jobsBySource = [...sourceMap.values()].sort(
    (a, b) => b.count - a.count,
  );

  const jobStatusCount = (s: JobStatus) =>
    jobs.filter((j) => j.status === s).length;
  const openJobs = jobStatusCount("OPEN");
  const onHoldJobs = jobStatusCount("ON_HOLD");
  // "Active" = OPEN/ON_HOLD jobs that have at least one recruiter assigned.
  // Excludes bulk-imported iLabor reqs no one has picked up yet.
  const activeJobs = jobs.filter(
    (j) =>
      (j.status === "OPEN" || j.status === "ON_HOLD") &&
      j._count.assignments > 0,
  ).length;

  // Open-job aging — OPEN and ON_HOLD jobs only.
  const agingCounts: Record<string, number> = {};
  for (const bucket of AGING_BUCKETS) agingCounts[bucket] = 0;
  for (const job of jobs) {
    if (job.status === "OPEN" || job.status === "ON_HOLD") {
      agingCounts[agingBucket(daysSince(job.createdAt))] += 1;
    }
  }
  const aging = AGING_BUCKETS.map((bucket) => ({
    bucket,
    count: agingCounts[bucket],
  }));

  // ── Submissions ──
  const submissionsByStatus = SUBMISSION_STATUSES.map((status) => ({
    status,
    count: submissions.filter((s) => s.status === status).length,
  }));
  const subStatusCount = (s: SubmissionStatus) =>
    submissions.filter((x) => x.status === s).length;

  const interviewCount = submissions.reduce(
    (sum, s) => sum + s._count.interviewRounds,
    0,
  );

  // ── Recruiter-wise performance ──
  const recruiterPerf = recruiters
    .map((r) => {
      const own = submissions.filter((s) => s.submittedById === r.id);
      return {
        id: r.id,
        fullName: r.fullName,
        submissions: own.length,
        interviews: own.reduce((sum, s) => sum + s._count.interviewRounds, 0),
        selected: own.filter((s) => s.status === "SELECTED").length,
        joined: own.filter((s) => s.status === "JOINED").length,
      };
    })
    // Sort by submissions desc, but keep zero-submission recruiters in the
    // list (alphabetised under the active ones) so new hires don't vanish.
    .sort((a, b) => {
      if (b.submissions !== a.submissions) return b.submissions - a.submissions;
      return a.fullName.localeCompare(b.fullName);
    });

  return {
    totalJobs: jobs.length,
    activeJobs,
    openJobs,
    onHoldJobs,
    jobsByStatus,
    jobsBySource,
    aging,
    totalSubmissions: submissions.length,
    submissionsByStatus,
    interviewCount,
    selected: subStatusCount("SELECTED"),
    offerReleased: subStatusCount("OFFER_RELEASED"),
    joined: subStatusCount("JOINED"),
    rejected: subStatusCount("REJECTED"),
    onHold: subStatusCount("ON_HOLD"),
    recruiterPerf,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

/**
 * The "My work" panel — two small action lists for the acting recruiter:
 * stale in-flight submissions and interview rounds that still need a result.
 * Capped tight (10 each) since the panel is a glanceable to-do, not a
 * full table. Older items first so the most-stuck rows surface.
 */
export async function getMyWork(userId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

  const [staleSubmissions, pendingRounds] = await Promise.all([
    prisma.submission.findMany({
      where: {
        submittedById: userId,
        // In-flight = not yet in a terminal state. Anything still moving
        // through the pipeline that's been sitting for more than a week is
        // worth a nudge.
        status: {
          notIn: ["SELECTED", "REJECTED", "ON_HOLD", "OFFER_RELEASED", "JOINED"],
        },
        submittedAt: { lte: sevenDaysAgo },
      },
      orderBy: { submittedAt: "asc" },
      take: 10,
      select: {
        id: true,
        seq: true,
        status: true,
        submittedAt: true,
        candidate: { select: { fullName: true } },
        job: { select: { title: true } },
      },
    }),
    prisma.interviewRound.findMany({
      where: {
        updatedById: userId,
        result: { in: ["WAITING", "NEED_ANOTHER_ROUND"] },
      },
      orderBy: { scheduledAt: "asc" },
      take: 10,
      select: {
        id: true,
        roundOrder: true,
        scheduledAt: true,
        result: true,
        submission: {
          select: {
            id: true,
            seq: true,
            candidate: { select: { fullName: true } },
            job: { select: { title: true } },
          },
        },
      },
    }),
  ]);

  return { staleSubmissions, pendingRounds };
}

export type MyWork = Awaited<ReturnType<typeof getMyWork>>;
