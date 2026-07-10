import { startOfMonth, subMonths, format } from "date-fns";
import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { SubmissionStatus, UserRole } from "@/generated/prisma/enums";
import {
  buildSubmissionWhere,
  PERFORMANCE_ROLES,
  type AnalyticsFilters,
} from "@/lib/analytics";
import { OTHER_SOURCE } from "@/lib/labels";
import { PAGE_SIZE, SUB_PAGE_SIZE, type SortState } from "@/lib/filters";

/** Client/vendor/source filter for a job — used for assignment counts. */
function jobOrgWhere(f: AnalyticsFilters): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = {};
  if (f.clientId?.length) where.clientId = { in: f.clientId };
  if (f.vendorId?.length) where.vendorId = { in: f.vendorId };
  if (f.sisterCompanySourceId)
    where.sisterCompanySourceId =
      f.sisterCompanySourceId === OTHER_SOURCE ? null : f.sisterCompanySourceId;
  return where;
}

function tally(
  rows: { status: SubmissionStatus; interviewRounds: number }[],
) {
  const count = (s: SubmissionStatus) =>
    rows.filter((r) => r.status === s).length;
  return {
    submissions: rows.length,
    interviews: rows.reduce((sum, r) => sum + r.interviewRounds, 0),
    selected: count("SELECTED"),
    offerReleased: count("OFFER_RELEASED"),
    joined: count("JOINED"),
    rejected: count("REJECTED"),
    onHold: count("ON_HOLD"),
  };
}

/** A single recruiter's row in the performance table. */
export type RecruiterPerfRow = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  jobsAssigned: number;
  submissions: number;
  interviews: number;
  selected: number;
  offerReleased: number;
  joined: number;
  rejected: number;
  onHold: number;
};

/** Columns the Recruiters list can be sorted by → a comparable value. */
const RECRUITER_SORTS: Record<
  string,
  (r: RecruiterPerfRow) => string | number
> = {
  name: (r) => r.fullName.toLowerCase(),
  jobs: (r) => r.jobsAssigned,
  submissions: (r) => r.submissions,
  interviews: (r) => r.interviews,
  selected: (r) => r.selected,
  offers: (r) => r.offerReleased,
  joined: (r) => r.joined,
  rejected: (r) => r.rejected,
  onhold: (r) => r.onHold,
};

export const RECRUITER_SORT_KEYS = Object.keys(RECRUITER_SORTS);
export const RECRUITER_DEFAULT_SORT: SortState = { key: "name", dir: "asc" };

/**
 * Performance counts for every active recruiter (spec §9.9). The date range
 * filters submissions by `submittedAt` and assignments by `assignedAt`.
 * Rows are aggregated, then sorted and paginated in memory.
 */
export async function listRecruiterPerformance(
  filters: AnalyticsFilters,
  opts: { sort?: SortState; page?: number; roles?: UserRole[] } = {},
) {
  const orgWhere = jobOrgWhere(filters);
  // Default to all three roles; the roster filter chip can narrow to a subset.
  const roles =
    opts.roles && opts.roles.length ? opts.roles : PERFORMANCE_ROLES;

  // The "User" chip (filters.recruiterId) must narrow which people are LISTED,
  // not just whose submissions are counted — otherwise picking 4 users still
  // shows everyone with the others zeroed out.
  const userWhere: Prisma.UserWhereInput = {
    isActive: true,
    role: { in: roles },
  };
  if (filters.recruiterId?.length)
    userWhere.id = { in: filters.recruiterId };

  // Only count assignments to jobs that are still being worked. Bulk-closing
  // iLabor reqs would otherwise inflate every recruiter's "Jobs assigned".
  const activeJobWhere: Prisma.JobWhereInput = {
    ...orgWhere,
    status: { in: ["OPEN", "ON_HOLD"] },
  };
  const assignmentWhere: Prisma.JobAssignmentWhereInput = { job: activeJobWhere };
  if (filters.dateRange?.gte || filters.dateRange?.lte)
    assignmentWhere.assignedAt = filters.dateRange;

  const [users, submissions, assignments] = await Promise.all([
    prisma.user.findMany({
      // Recruiters + team leads + managers — anyone who submits shows here,
      // narrowed by the user-type and the specific-user filters.
      where: userWhere,
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.submission.findMany({
      where: buildSubmissionWhere(filters),
      select: {
        status: true,
        submittedById: true,
        _count: { select: { interviewRounds: true } },
      },
    }),
    prisma.jobAssignment.groupBy({
      by: ["recruiterId"],
      where: assignmentWhere,
      _count: true,
    }),
  ]);

  const assignedMap = new Map(
    assignments.map((a) => [a.recruiterId, a._count]),
  );

  const all: RecruiterPerfRow[] = users.map((u) => {
    const own = submissions
      .filter((s) => s.submittedById === u.id)
      .map((s) => ({
        status: s.status,
        interviewRounds: s._count.interviewRounds,
      }));
    return {
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      jobsAssigned: assignedMap.get(u.id) ?? 0,
      ...tally(own),
    };
  });

  const sort = opts.sort ?? RECRUITER_DEFAULT_SORT;
  const accessor = RECRUITER_SORTS[sort.key] ?? RECRUITER_SORTS.name;
  const sorted = [...all].sort((a, b) => {
    const av = accessor(a);
    const bv = accessor(b);
    let cmp: number;
    if (typeof av === "number" && typeof bv === "number") {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv));
    }
    // `id` tiebreaker keeps pagination stable when the metric has ties.
    if (cmp === 0) cmp = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return sort.dir === "asc" ? cmp : -cmp;
  });

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page ?? 1), totalPages);
  const rows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return { rows, total, page };
}

/**
 * One recruiter's full performance picture (spec §9.10): profile, headline
 * counts, assigned jobs, submissions, a six-month submission trend, and the
 * recruiter's recent audit activity.
 */
export async function getRecruiterDetail(
  id: string,
  filters: AnalyticsFilters,
  opts: {
    jobsPage?: number;
    subsPage?: number;
    /** Optional status filter applied to the displayed submissions table only —
     *  stats + monthly chart still use ALL submissions in the filter window. */
    subStatus?: SubmissionStatus;
  } = {},
) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
  if (!user) return null;

  const orgWhere = jobOrgWhere(filters);
  const submissionWhere: Prisma.SubmissionWhereInput = {
    ...buildSubmissionWhere(filters),
    submittedById: id,
  };

  const assignmentWhere: Prisma.JobAssignmentWhereInput = { recruiterId: id };
  if (Object.keys(orgWhere).length) assignmentWhere.job = orgWhere;
  if (filters.dateRange?.gte || filters.dateRange?.lte)
    assignmentWhere.assignedAt = filters.dateRange;

  // For stats + the monthly chart we want ALL submissions in the filter
  // window (not just the page slice), but we only need a tiny projection.
  // `allSubs` is the bounded full set used for aggregation; `subRows` is the
  // paginated slice rendered in the table.
  // The status filter only narrows the displayed submissions table, not the
  // stats/chart computed off `allSubs`.
  const displaySubmissionWhere: Prisma.SubmissionWhereInput = opts.subStatus
    ? { ...submissionWhere, status: opts.subStatus }
    : submissionWhere;

  const jobsTotalP = prisma.jobAssignment.count({ where: assignmentWhere });
  const subsTotalP = prisma.submission.count({ where: displaySubmissionWhere });

  const [jobsTotal, subsTotal, allSubs, activity] = await Promise.all([
    jobsTotalP,
    subsTotalP,
    prisma.submission.findMany({
      where: submissionWhere,
      select: {
        status: true,
        submittedAt: true,
        _count: { select: { interviewRounds: true } },
      },
    }),
    prisma.activity.findMany({
      where: { performedById: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { performedBy: { select: { fullName: true } } },
    }),
  ]);

  const jobsTotalPages = Math.max(1, Math.ceil(jobsTotal / SUB_PAGE_SIZE));
  const jobsPage = Math.min(
    Math.max(1, opts.jobsPage ?? 1),
    jobsTotalPages,
  );
  const subsTotalPages = Math.max(1, Math.ceil(subsTotal / SUB_PAGE_SIZE));
  const subsPage = Math.min(
    Math.max(1, opts.subsPage ?? 1),
    subsTotalPages,
  );

  const [assignments, submissions] = await Promise.all([
    prisma.jobAssignment.findMany({
      where: assignmentWhere,
      orderBy: { assignedAt: "desc" },
      skip: (jobsPage - 1) * SUB_PAGE_SIZE,
      take: SUB_PAGE_SIZE,
      include: {
        job: {
          select: {
            id: true,
            title: true,
            status: true,
            client: { select: { name: true } },
            vendor: { select: { name: true } },
            _count: { select: { submissions: true } },
          },
        },
      },
    }),
    prisma.submission.findMany({
      where: displaySubmissionWhere,
      orderBy: { submittedAt: "desc" },
      skip: (subsPage - 1) * SUB_PAGE_SIZE,
      take: SUB_PAGE_SIZE,
      select: {
        id: true,
        status: true,
        submittedAt: true,
        candidate: { select: { fullName: true } },
        job: { select: { title: true } },
        _count: { select: { interviewRounds: true } },
      },
    }),
  ]);

  const stats = tally(
    allSubs.map((s) => ({
      status: s.status,
      interviewRounds: s._count.interviewRounds,
    })),
  );

  // Six-month submission trend, oldest month first.
  const now = new Date();
  const monthly = Array.from({ length: 6 }, (_, i) => {
    const start = startOfMonth(subMonths(now, 5 - i));
    const end = startOfMonth(subMonths(now, 4 - i));
    return {
      label: format(start, "MMM"),
      count: allSubs.filter(
        (s) => s.submittedAt >= start && s.submittedAt < end,
      ).length,
    };
  });

  return {
    user,
    stats,
    jobsAssigned: jobsTotal,
    assignments,
    assignmentsTotal: jobsTotal,
    assignmentsPage: jobsPage,
    submissions,
    submissionsTotal: subsTotal,
    submissionsPage: subsPage,
    monthly,
    activity,
  };
}

export type RecruiterDetail = NonNullable<
  Awaited<ReturnType<typeof getRecruiterDetail>>
>;
