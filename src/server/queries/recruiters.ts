import { startOfMonth, subMonths, format } from "date-fns";
import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { SubmissionStatus, UserRole } from "@/generated/prisma/enums";
import { buildSubmissionWhere, type AnalyticsFilters } from "@/lib/analytics";
import { OTHER_SOURCE } from "@/lib/labels";
import { PAGE_SIZE, type SortState } from "@/lib/filters";

/** Client/vendor/source filter for a job — used for assignment counts. */
function jobOrgWhere(f: AnalyticsFilters): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = {};
  if (f.clientId) where.clientId = f.clientId;
  if (f.vendorId) where.vendorId = f.vendorId;
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
  opts: { sort?: SortState; page?: number } = {},
) {
  const orgWhere = jobOrgWhere(filters);

  const assignmentWhere: Prisma.JobAssignmentWhereInput = {};
  if (Object.keys(orgWhere).length) assignmentWhere.job = orgWhere;
  if (filters.dateRange?.gte || filters.dateRange?.lte)
    assignmentWhere.assignedAt = filters.dateRange;

  const [users, submissions, assignments] = await Promise.all([
    prisma.user.findMany({
      // Recruiters only — admins aren't part of the performance list.
      where: { isActive: true, role: "RECRUITER" },
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

  const [assignments, submissions, activity] = await Promise.all([
    prisma.jobAssignment.findMany({
      where: assignmentWhere,
      orderBy: { assignedAt: "desc" },
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
      where: submissionWhere,
      orderBy: { submittedAt: "desc" },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        candidate: { select: { fullName: true } },
        job: { select: { title: true } },
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

  const stats = tally(
    submissions.map((s) => ({
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
      count: submissions.filter(
        (s) => s.submittedAt >= start && s.submittedAt < end,
      ).length,
    };
  });

  return {
    user,
    stats,
    jobsAssigned: assignments.length,
    assignments,
    submissions,
    monthly,
    activity,
  };
}

export type RecruiterDetail = NonNullable<
  Awaited<ReturnType<typeof getRecruiterDetail>>
>;
