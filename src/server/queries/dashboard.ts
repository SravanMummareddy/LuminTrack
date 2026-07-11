import { getScopedPrisma } from "@/lib/session";
import {
  buildJobWhere,
  buildSubmissionWhere,
  daysSince,
  PERFORMANCE_ROLES,
  type AnalyticsFilters,
} from "@/lib/analytics";
import type { JobStatus, SubmissionStatus } from "@/generated/prisma/enums";

/**
 * Every metric the Dashboard (spec §9.1) renders, computed in three queries:
 * jobs, submissions, and the active-recruiter list. Aggregation runs in memory
 * — fine for a small internal team's data volume.
 */
export async function getDashboardData(filters: AnalyticsFilters) {
  const db = await getScopedPrisma();
  const [jobs, submissions, recruiters] = await Promise.all([
    db.job.findMany({
      where: buildJobWhere(filters),
      select: {
        status: true,
        _count: { select: { assignments: true } },
      },
    }),
    db.submission.findMany({
      where: buildSubmissionWhere(filters),
      select: {
        status: true,
        submittedById: true,
        _count: { select: { interviewRounds: true } },
      },
    }),
    db.user.findMany({
      // Same performer universe as the Recruiters page and Reports
      // (PERFORMANCE_ROLES) — a submitting manager/team lead is ranked too.
      where: { isActive: true, role: { in: PERFORMANCE_ROLES } },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  // ── Jobs ──
  // "Active" = OPEN/ON_HOLD jobs that have at least one recruiter assigned.
  // Excludes bulk-imported iLabor reqs no one has picked up yet.
  // `openJobs`/`onHoldJobs` mirror the same assigned-only scope so the
  // dashboard subtitle ("X open · Y on hold") sums to the headline.
  const isActive = (j: { status: JobStatus; _count: { assignments: number } }) =>
    (j.status === "OPEN" || j.status === "ON_HOLD") && j._count.assignments > 0;
  const activeJobs = jobs.filter(isActive).length;
  const openJobs = jobs.filter((j) => isActive(j) && j.status === "OPEN").length;
  const onHoldJobs = jobs.filter((j) => isActive(j) && j.status === "ON_HOLD").length;

  // ── Submissions ──
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
    activeJobs,
    openJobs,
    onHoldJobs,
    totalSubmissions: submissions.length,
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
  const db = await getScopedPrisma();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

  const [staleSubmissions, pendingRounds, pendingRequirements] = await Promise.all([
    db.submission.findMany({
      where: {
        submittedById: userId,
        // In-flight = not yet in a terminal state. Anything still moving
        // through the pipeline that's been sitting for more than a week is
        // worth a nudge.
        status: {
          notIn: ["SELECTED", "REJECTED", "ON_HOLD", "OFFER_RELEASED", "JOINED", "BACKED_OUT"],
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
    db.interviewRound.findMany({
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
    // OPEN vendor requirements assigned to this recruiter — planning records
    // waiting to be moved to a submission. Only surface ones whose job is still
    // accepting, so the card never points the recruiter at a convert dead-end.
    db.vendorRequirement.findMany({
      where: {
        recruiterId: userId,
        status: "OPEN",
        job: { status: { notIn: ["CLOSED", "FILLED", "CANCELLED"] } },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: {
        id: true,
        seq: true,
        candidate: { select: { fullName: true } },
        job: { select: { title: true } },
      },
    }),
  ]);

  return { staleSubmissions, pendingRounds, pendingRequirements };
}

/**
 * In-flight submissions made without a résumé and not waived ("not required") —
 * the "submitted without résumé" worklist. `me` scope = the acting user's;
 * `org` scope = everyone's (for admins). Terminal submissions are excluded so a
 * closed one never nags.
 */
export async function getMissingResumeSubmissions(
  opts: { scope: "me" | "org"; userId: string; limit?: number },
) {
  const db = await getScopedPrisma();
  return db.submission.findMany({
    where: {
      ...(opts.scope === "me" ? { submittedById: opts.userId } : {}),
      status: { notIn: ["REJECTED", "JOINED", "BACKED_OUT"] },
      candidateResumeId: null,
      resumeBlobUrl: null,
      resumeWaivedAt: null,
    },
    orderBy: { submittedAt: "asc" },
    take: opts.limit ?? 8,
    select: {
      id: true,
      seq: true,
      status: true,
      submittedAt: true,
      candidate: { select: { fullName: true } },
      job: { select: { title: true } },
      submittedBy: { select: { fullName: true } },
    },
  });
}

export type MissingResumeSubmissions = Awaited<
  ReturnType<typeof getMissingResumeSubmissions>
>;

export type MyWork = Awaited<ReturnType<typeof getMyWork>>;

/**
 * The acting user's most recent actions, for the Dashboard's scope=me "Recent
 * activity" card. Each row links straight to the entity it touched (the audit
 * `description` is already human-readable, e.g. `Jane submitted to "…"`).
 */
export async function getMyRecentActivity(userId: string, limit = 8) {
  const db = await getScopedPrisma();
  const rows = await db.activity.findMany({
    where: { performedById: userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      description: true,
      createdAt: true,
      submissionId: true,
      requirementId: true,
      candidateId: true,
      jobId: true,
      benchConsultantId: true,
      // The entity's name, so a terse description ("Status changed…") still says
      // which job/candidate it was about.
      submission: {
        select: {
          candidate: { select: { fullName: true } },
          job: { select: { title: true } },
        },
      },
      requirement: { select: { job: { select: { title: true } } } },
      candidate: { select: { fullName: true } },
      job: { select: { title: true } },
      benchConsultant: { select: { fullName: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    description: r.description,
    createdAt: r.createdAt,
    entity: r.submission
      ? (r.submission.candidate?.fullName ?? r.submission.job?.title ?? null)
      : r.requirement
        ? (r.requirement.job?.title ?? null)
        : r.candidate
          ? r.candidate.fullName
          : r.job
            ? r.job.title
            : r.benchConsultant
              ? r.benchConsultant.fullName
              : null,
    href: r.submissionId
      ? `/submissions/${r.submissionId}`
      : r.requirementId
        ? `/vendor-portal/${r.requirementId}`
        : r.candidateId
          ? `/candidates/${r.candidateId}`
          : r.jobId
            ? `/jobs/${r.jobId}`
            : r.benchConsultantId
              ? `/bench/${r.benchConsultantId}`
              : null,
  }));
}

export type MyRecentActivity = Awaited<ReturnType<typeof getMyRecentActivity>>;

/**
 * "My jobs" mini-list for the Dashboard's scope=me view. Returns the OPEN /
 * ON_HOLD jobs assigned to the acting recruiter, newest-assigned first, capped
 * at 5 (matches the other "Needs attention" sub-lists). Display-id sequence
 * is pulled so the row can format JOB-00123 alongside the title.
 */
export async function getMyAssignedJobs(userId: string) {
  const db = await getScopedPrisma();
  const rows = await db.jobAssignment.findMany({
    where: {
      recruiterId: userId,
      job: { status: { in: ["OPEN", "ON_HOLD"] } },
    },
    orderBy: { assignedAt: "desc" },
    take: 5,
    select: {
      assignedAt: true,
      job: {
        select: {
          id: true,
          seq: true,
          title: true,
          status: true,
          client: { select: { name: true } },
          _count: { select: { submissions: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    assignedAt: r.assignedAt,
    job: r.job,
    ageDays: Math.max(0, daysSince(r.assignedAt)),
  }));
}

export type MyAssignedJobs = Awaited<ReturnType<typeof getMyAssignedJobs>>;

/**
 * Onboarding signal for a team migrating off Excel: which of the core
 * setup steps have any data yet. Cheap existence checks (`findFirst` on the
 * id) — the Dashboard shows a getting-started checklist until the first
 * submission exists, then the card disappears.
 */
export async function getOnboardingStatus() {
  const db = await getScopedPrisma();
  const exists = async (
    p: Promise<{ id: string } | null>,
  ): Promise<boolean> => Boolean(await p);
  const [hasJobs, hasCandidates, hasAssignments, hasSubmissions] =
    await Promise.all([
      exists(db.job.findFirst({ select: { id: true } })),
      exists(db.candidate.findFirst({ select: { id: true } })),
      exists(db.jobAssignment.findFirst({ select: { id: true } })),
      exists(db.submission.findFirst({ select: { id: true } })),
    ]);
  return { hasJobs, hasCandidates, hasAssignments, hasSubmissions };
}

export type OnboardingStatus = Awaited<ReturnType<typeof getOnboardingStatus>>;
