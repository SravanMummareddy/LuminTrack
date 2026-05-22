import { prisma } from "@/server/db";
import {
  AGING_BUCKETS,
  agingBucket,
  buildJobWhere,
  buildSubmissionWhere,
  daysSince,
  type AnalyticsFilters,
} from "@/lib/analytics";
import { JOB_STATUSES, SUBMISSION_STATUSES } from "@/lib/labels";
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
        sisterCompanySourceId: true,
        sisterCompanySource: { select: { name: true } },
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
    const entry = sourceMap.get(job.sisterCompanySourceId) ?? {
      name: job.sisterCompanySource.name,
      count: 0,
    };
    entry.count += 1;
    sourceMap.set(job.sisterCompanySourceId, entry);
  }
  const jobsBySource = [...sourceMap.values()].sort(
    (a, b) => b.count - a.count,
  );

  const jobStatusCount = (s: JobStatus) =>
    jobs.filter((j) => j.status === s).length;
  const openJobs = jobStatusCount("OPEN");
  const activeJobs = openJobs + jobStatusCount("ON_HOLD");
  const closedJobs =
    jobStatusCount("CLOSED") +
    jobStatusCount("FILLED") +
    jobStatusCount("CANCELLED");

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
    .filter((r) => r.submissions > 0)
    .sort((a, b) => b.submissions - a.submissions);

  return {
    totalJobs: jobs.length,
    activeJobs,
    openJobs,
    closedJobs,
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
