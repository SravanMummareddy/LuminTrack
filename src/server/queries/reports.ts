import { getScopedPrisma } from "@/lib/session";
import type { Prisma } from "@/generated/prisma/client";
import { avgDaysToFirstSubmission } from "@/lib/format";
import {
  buildJobWhere,
  buildSubmissionWhere,
  daysSince,
  PERFORMANCE_ROLES,
  sourceBreakdown,
  STALE_SUBMISSION_STATUSES,
  type AnalyticsFilters,
} from "@/lib/analytics";

const REPORTS_PAGE_SIZE = 10;

/** Slice a sorted in-memory list into a `{ rows, total, page, totalPages }`
 *  shape that matches the rest of the list-query conventions. */
function paginate<T>(all: T[], page: number) {
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / REPORTS_PAGE_SIZE));
  const p = Math.min(Math.max(1, page), totalPages);
  const start = (p - 1) * REPORTS_PAGE_SIZE;
  return {
    rows: all.slice(start, start + REPORTS_PAGE_SIZE),
    total,
    page: p,
    totalPages,
  };
}

/**
 * Everything the Reports / Analytics tab renders — trimmed (2026-07) to the
 * recruiter-focused metrics the owner asked for: the pipeline snapshot,
 * conversion rates, the per-recruiter table, and stale-submission aging —
 * plus the active-placement margin projection (kept for the admin financial
 * view). The old per-client / per-vendor / per-source tables, open-job aging,
 * client-revenue projection, time-to-fill and time-in-stage were removed as
 * clutter.
 */
export async function getReportsData(
  filters: AnalyticsFilters,
  pages: { recruiterAging?: number } = {},
) {
  const db = await getScopedPrisma();
  const [submissions, recruiters, sourceJobs] = await Promise.all([
    db.submission.findMany({
      where: buildSubmissionWhere(filters),
      select: {
        status: true,
        submittedById: true,
        // V-5: jobId + submittedAt + the job's received date drive avg
        // time-to-submit (grouped to the earliest submission per job).
        jobId: true,
        submittedAt: true,
        job: { select: { receivedAt: true } },
        _count: { select: { interviewRounds: true } },
      },
    }),
    db.user.findMany({
      where: { isActive: true, role: { in: PERFORMANCE_ROLES } },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    // SRC-2: jobs in the window with their source + submission statuses, to roll
    // up by channel (jobs → submissions → placements → fill rate).
    db.job.findMany({
      where: buildJobWhere(filters),
      select: {
        sourceType: true,
        jobBoard: true,
        submissions: { select: { status: true } },
      },
    }),
  ]);

  const { bySource, byJobBoard } = sourceBreakdown(sourceJobs);

  // V-5: flatten each submission to the shape avgDaysToFirstSubmission wants.
  const ttsRows = submissions.map((s) => ({
    jobId: s.jobId,
    receivedAt: s.job.receivedAt,
    submittedAt: s.submittedAt,
  }));

  // Recruiter breakdown.
  const byRecruiter = recruiters
    .map((r) => {
      const own = submissions.filter((s) => s.submittedById === r.id);
      return {
        name: r.fullName,
        submissions: own.length,
        interviews: own.reduce((sum, s) => sum + s._count.interviewRounds, 0),
        selected: own.filter((s) => s.status === "SELECTED").length,
        joined: own.filter((s) => s.status === "JOINED").length,
        // Their avg = each job they touched, credited with their earliest
        // submission on it (every-submitter attribution).
        avgTimeToSubmit: avgDaysToFirstSubmission(
          own.map((s) => ({
            jobId: s.jobId,
            receivedAt: s.job.receivedAt,
            submittedAt: s.submittedAt,
          })),
        ),
      };
    })
    .filter((r) => r.submissions > 0)
    .sort((a, b) => b.submissions - a.submissions);

  // Conversion rates.
  const interviewed = submissions.filter(
    (s) => s._count.interviewRounds > 0,
  ).length;
  const selectedAfterInterview = submissions.filter(
    (s) =>
      s._count.interviewRounds > 0 &&
      // Every stage at or past SELECTED counts as "selected after interview".
      // OFFER_ACCEPTED (rank 6) sits between OFFER_RELEASED and JOINED — omitting
      // it while counting both neighbours deflated the interview→selection rate.
      (s.status === "SELECTED" ||
        s.status === "OFFER_RELEASED" ||
        s.status === "OFFER_ACCEPTED" ||
        s.status === "JOINED"),
  ).length;
  // V-5: overall avg time-to-submit + how many jobs it spans (for the caption).
  const jobsWithSubmission = new Set(submissions.map((s) => s.jobId)).size;
  const conversions = {
    totalSubmissions: submissions.length,
    interviewed,
    selectedAfterInterview,
    submissionToInterview: submissions.length
      ? interviewed / submissions.length
      : 0,
    interviewToSelection: interviewed
      ? selectedAfterInterview / interviewed
      : 0,
    avgTimeToSubmit: avgDaysToFirstSubmission(ttsRows),
    jobsWithSubmission,
  };

  // §F3 — recruiter aging: submissions older than 14 days that haven't moved
  // past the early-pipeline stages. Surfaces neglected work the recruiter
  // owns. "Stale" = submittedAt > 14d and status still SUBMITTED /
  // RESUME_PICKED / VENDOR_SCREENING_CALL / CLIENT_INTERVIEW.
  const STALE_DAYS = 14;
  const staleSubs = await db.submission.findMany({
    // AND the filter-bar scoping with the stale conditions so this table
    // responds to the page filters (it previously queried org-wide). AND (not a
    // spread) because both sides constrain `status`/`submittedAt`.
    where: {
      AND: [
        buildSubmissionWhere(filters),
        {
          status: { in: STALE_SUBMISSION_STATUSES },
          submittedAt: { lt: new Date(Date.now() - STALE_DAYS * 86400_000) },
        },
      ],
    },
    select: {
      id: true,
      seq: true,
      status: true,
      submittedAt: true,
      submittedBy: { select: { id: true, fullName: true } },
      candidate: { select: { fullName: true } },
      job: { select: { title: true, client: { select: { name: true } } } },
    },
    orderBy: { submittedAt: "asc" },
    take: 200,
  });
  const recruiterAging = staleSubs.map((s) => ({
    submissionId: s.id,
    seq: s.seq,
    status: s.status,
    submittedAt: s.submittedAt,
    days: daysSince(s.submittedAt),
    recruiter: s.submittedBy.fullName,
    candidate: s.candidate.fullName,
    job: s.job.title,
    client: s.job.client.name,
  }));

  // R4.2 — Active placements + projected margin. For each ACTIVE/EXTENDED
  // placement, margin = (bill − pay) × HOURS_PER_DAY × remaining-days. Open-
  // ended placements (no endDate) use a 90-day fallback window. Negative
  // margins are flagged but counted.
  const DEFAULT_DURATION_DAYS = 90;
  const HOURS_PER_DAY = 8;
  // Scope by the filter bar's client / vendor / recruiter so this table responds
  // to the page filters (it previously queried org-wide). Date range is
  // intentionally not applied — this is a live "currently active" snapshot, not
  // a period metric.
  const placementWhere: Prisma.PlacementWhereInput = {
    status: { in: ["ACTIVE", "EXTENDED"] },
  };
  const placementJob: Prisma.JobWhereInput = {};
  if (filters.clientId?.length)
    placementJob.clientId = { in: filters.clientId };
  if (filters.vendorId?.length)
    placementJob.vendorId = { in: filters.vendorId };
  if (Object.keys(placementJob).length) placementWhere.job = placementJob;
  if (filters.recruiterId?.length)
    placementWhere.submission = {
      submittedById: { in: filters.recruiterId },
    };
  const placementsForMargin = await db.placement.findMany({
    where: placementWhere,
    select: {
      billRate: true,
      payRate: true,
      startDate: true,
      endDate: true,
      job: { select: { client: { select: { name: true } } } },
    },
  });
  const placementNow = new Date();
  type MarginRow = {
    client: string;
    active: number;
    margin: number;
    negative: number;
  };
  const marginMap = new Map<string, MarginRow>();
  let placementMarginTotal = 0;
  let placementMarginNegative = 0;
  for (const p of placementsForMargin) {
    const bill = Number(p.billRate);
    const pay = Number(p.payRate);
    const per = bill - pay;
    const endRef =
      p.endDate ??
      new Date(placementNow.getTime() + DEFAULT_DURATION_DAYS * 86_400_000);
    const remainingDays = Math.max(
      0,
      Math.round((endRef.getTime() - placementNow.getTime()) / 86_400_000),
    );
    const projected = per * HOURS_PER_DAY * remainingDays;
    placementMarginTotal += projected;
    if (per < 0) placementMarginNegative += 1;
    const key = p.job.client.name;
    const entry =
      marginMap.get(key) ?? { client: key, active: 0, margin: 0, negative: 0 };
    entry.active += 1;
    entry.margin += projected;
    if (per < 0) entry.negative += 1;
    marginMap.set(key, entry);
  }
  const placementMargin = {
    totalActive: placementsForMargin.length,
    totalMargin: placementMarginTotal,
    negativeCount: placementMarginNegative,
    byClient: [...marginMap.values()].sort((a, b) => b.margin - a.margin),
  };

  return {
    byRecruiter,
    conversions,
    recruiterAging: paginate(recruiterAging, pages.recruiterAging ?? 1),
    placementMargin,
    // SRC-2: channel scoreboard.
    bySource,
    byJobBoard,
  };
}

export type ReportsData = Awaited<ReturnType<typeof getReportsData>>;
