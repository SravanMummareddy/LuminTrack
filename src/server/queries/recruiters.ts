import { startOfMonth, subMonths, format } from "date-fns";
import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { SubmissionStatus } from "@/generated/prisma/enums";
import { buildSubmissionWhere, type AnalyticsFilters } from "@/lib/analytics";

/** Client/vendor/source filter for a job — used for assignment counts. */
function jobOrgWhere(f: AnalyticsFilters): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = {};
  if (f.clientId) where.clientId = f.clientId;
  if (f.vendorId) where.vendorId = f.vendorId;
  if (f.sisterCompanySourceId)
    where.sisterCompanySourceId = f.sisterCompanySourceId;
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

/**
 * Performance counts for every active recruiter (spec §9.9). The date range
 * filters submissions by `submittedAt` and assignments by `assignedAt`.
 */
export async function listRecruiterPerformance(filters: AnalyticsFilters) {
  const orgWhere = jobOrgWhere(filters);

  const assignmentWhere: Prisma.JobAssignmentWhereInput = {};
  if (Object.keys(orgWhere).length) assignmentWhere.job = orgWhere;
  if (filters.dateRange?.gte || filters.dateRange?.lte)
    assignmentWhere.assignedAt = filters.dateRange;

  const [users, submissions, assignments] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
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

  return users.map((u) => {
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
}

export type RecruiterPerfRow = Awaited<
  ReturnType<typeof listRecruiterPerformance>
>[number];

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
