import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { SubmissionStatus } from "@/generated/prisma/enums";
import { OTHER_SOURCE } from "@/lib/labels";
import {
  currentStageDays,
  STALE_STAGE_DAYS,
  STALE_SUBMISSION_STATUSES,
  STATUS_TRANSITION_ACTIONS,
} from "@/lib/analytics";
import {
  PAGE_SIZE,
  SUB_PAGE_SIZE,
  searchTerms,
  type DateRange,
  type SortDir,
  type SortState,
} from "@/lib/filters";

export type SubmissionListFilters = {
  q?: string;
  status?: SubmissionStatus;
  recruiterId?: string[];
  clientId?: string[];
  vendorId?: string[];
  sisterCompanySourceId?: string;
  submittedRange?: DateRange;
  sort?: SortState;
  page?: number;
  /** "Mine, stale >7d" quick filter — narrows to `currentUserId`'s early-
   *  pipeline submissions sitting in their current stage longer than 7 days. */
  mineStale?: boolean;
  currentUserId?: string;
};

/** Columns the Submissions list can be sorted by → their Prisma `orderBy`. */
const SUBMISSION_SORTS: Record<
  string,
  (d: SortDir) => Prisma.SubmissionOrderByWithRelationInput
> = {
  candidate: (d) => ({ candidate: { fullName: d } }),
  job: (d) => ({ job: { title: d } }),
  client: (d) => ({ job: { client: { name: d } } }),
  vendor: (d) => ({ job: { vendor: { name: d } } }),
  recruiter: (d) => ({ submittedBy: { fullName: d } }),
  status: (d) => ({ status: d }),
  rounds: (d) => ({ interviewRounds: { _count: d } }),
  submitted: (d) => ({ submittedAt: d }),
  engagement: (d) => ({ engagement: d }),
  vendorRecruiter: (d) => ({ vendorRecruiterName: d }),
  payRate: (d) => ({ payRate: d }),
  billRate: (d) => ({ billRate: d }),
  teamLead: (d) => ({ teamLead: d }),
};

// `daysInStage` is derived (not a column), so it's not in SUBMISSION_SORTS;
// it's a valid sort *key* handled by an in-memory sort below.
export const SUBMISSION_SORT_KEYS = [
  ...Object.keys(SUBMISSION_SORTS),
  "daysInStage",
];
export const SUBMISSION_DEFAULT_SORT: SortState = {
  key: "submitted",
  dir: "desc",
};

const SUBMISSION_INCLUDE = {
  candidate: { select: { id: true, fullName: true } },
  job: {
    select: {
      id: true,
      title: true,
      client: { select: { name: true } },
      vendor: { select: { name: true } },
    },
  },
  submittedBy: { select: { fullName: true } },
  candidateResume: { select: { label: true } },
  _count: { select: { interviewRounds: true } },
} satisfies Prisma.SubmissionInclude;

type RawSubmissionRow = Prisma.SubmissionGetPayload<{
  include: typeof SUBMISSION_INCLUDE;
}>;

/** Flatten the non-serialisable `Decimal` rates — the table is a Client Component. */
function flattenRow(s: RawSubmissionRow) {
  return {
    ...s,
    payRate: s.payRate == null ? null : Number(s.payRate),
    billRate: s.billRate == null ? null : Number(s.billRate),
    clientRate: s.clientRate == null ? null : Number(s.clientRate),
  };
}

/**
 * Attach `daysInStage` to each row with ONE batched audit query over the given
 * submission ids (no N+1 — mirrors the time-in-stage walk in reports.ts).
 */
async function attachDaysInStage<T extends { id: string; submittedAt: Date }>(
  rows: T[],
): Promise<(T & { daysInStage: number })[]> {
  if (rows.length === 0) return [];
  const transitions = await prisma.activity.findMany({
    where: {
      action: { in: [...STATUS_TRANSITION_ACTIONS] },
      submissionId: { in: rows.map((r) => r.id) },
    },
    select: { submissionId: true, eventAt: true, createdAt: true },
  });
  const bySub = new Map<string, { eventAt: Date | null; createdAt: Date }[]>();
  for (const t of transitions) {
    if (!t.submissionId) continue;
    const list = bySub.get(t.submissionId) ?? [];
    list.push({ eventAt: t.eventAt, createdAt: t.createdAt });
    bySub.set(t.submissionId, list);
  }
  return rows.map((r) => ({
    ...r,
    daysInStage: currentStageDays(r.submittedAt, bySub.get(r.id) ?? []),
  }));
}

export async function listSubmissions(filters: SubmissionListFilters) {
  const where: Prisma.SubmissionWhereInput = {};

  if (filters.status) where.status = filters.status;
  if (filters.recruiterId?.length)
    where.submittedById = { in: filters.recruiterId };
  if (filters.submittedRange?.gte || filters.submittedRange?.lte)
    where.submittedAt = filters.submittedRange;

  const job: Prisma.JobWhereInput = {};
  if (filters.clientId?.length) job.clientId = { in: filters.clientId };
  if (filters.vendorId?.length) job.vendorId = { in: filters.vendorId };
  if (filters.sisterCompanySourceId)
    // OTHER_SOURCE matches jobs with a free-text source (no managed-source FK).
    job.sisterCompanySourceId =
      filters.sisterCompanySourceId === OTHER_SOURCE
        ? null
        : filters.sisterCompanySourceId;
  if (Object.keys(job).length) where.job = job;

  const terms = searchTerms(filters.q);
  if (terms.length)
    where.AND = terms.map((t) => ({
      OR: [
        { candidate: { fullName: { contains: t, mode: "insensitive" } } },
        { job: { title: { contains: t, mode: "insensitive" } } },
      ],
    }));

  // "Mine, stale >7d" — narrow to the acting user's early-pipeline submissions;
  // the >7-days-in-stage cut needs daysInStage, so it's applied in memory below.
  const mineStale = Boolean(filters.mineStale && filters.currentUserId);
  if (mineStale) {
    where.submittedById = filters.currentUserId;
    where.status = { in: STALE_SUBMISSION_STATUSES };
  }

  const sort = filters.sort ?? SUBMISSION_DEFAULT_SORT;
  const sortByDays = sort.key === "daysInStage";
  const sortFn = SUBMISSION_SORTS[sort.key] ?? SUBMISSION_SORTS.submitted;
  const orderBy: Prisma.SubmissionOrderByWithRelationInput[] = [
    sortFn(sort.dir),
    { id: "asc" },
  ];

  // daysInStage is derived and the mineStale cut drops rows, so both cases need
  // the full filtered set computed before paginating (in memory, like reports.ts).
  // The common case keeps efficient DB pagination + a page-scoped audit query.
  if (sortByDays || mineStale) {
    const raw = await prisma.submission.findMany({
      where,
      orderBy,
      include: SUBMISSION_INCLUDE,
    });
    let all = await attachDaysInStage(raw.map(flattenRow));
    if (mineStale) all = all.filter((r) => r.daysInStage > STALE_STAGE_DAYS);
    if (sortByDays)
      all.sort((a, b) =>
        sort.dir === "asc"
          ? a.daysInStage - b.daysInStage
          : b.daysInStage - a.daysInStage,
      );
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);
    const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    return { rows, total, page };
  }

  const total = await prisma.submission.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);

  const raw = await prisma.submission.findMany({
    where,
    orderBy,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: SUBMISSION_INCLUDE,
  });
  const rows = await attachDaysInStage(raw.map(flattenRow));

  return { rows, total, page };
}

export type SubmissionListRow = Awaited<
  ReturnType<typeof listSubmissions>
>["rows"][number];

export function getSubmissionDetail(id: string) {
  return prisma.submission.findUnique({
    where: { id },
    include: {
      candidate: true,
      job: {
        include: {
          client: { select: { name: true } },
          vendor: { select: { name: true } },
          sisterCompanySource: { select: { name: true } },
        },
      },
      submittedBy: { select: { fullName: true } },
      candidateResume: {
        select: {
          label: true,
          blobPathname: true,
          contentType: true,
        },
      },
      interviewRounds: {
        orderBy: { roundOrder: "asc" },
        include: { updatedBy: { select: { fullName: true } } },
        // Soft cap — recruiters won't realistically run 50 rounds on one
        // submission. Avoids unbounded fetch if data ever goes sideways.
        take: 50,
      },
    },
  });
}

/** One submission for the edit form — fixed candidate/job/recruiter plus the
 *  candidate's active résumés (and the currently-used one even if archived) so
 *  the form can offer the résumé picker without dropping the saved selection. */
export async function getSubmissionForEdit(id: string) {
  const submission = await prisma.submission.findUnique({
    where: { id },
    select: {
      id: true,
      candidateId: true,
      submissionNotes: true,
      submittedAt: true,
      candidateResumeId: true,
      engagement: true,
      vendorRecruiterName: true,
      jobDuties: true,
      payRate: true,
      billRate: true,
      clientRate: true,
      teamLead: true,
      submittedById: true,
      job: { select: { title: true } },
      submittedBy: { select: { fullName: true } },
      candidate: { select: { fullName: true } },
    },
  });
  if (!submission) return null;

  // Offer active résumés in the picker, plus the one this submission currently
  // uses even if it's since been archived — otherwise the controlled <select>
  // finds no matching option and snaps to "No resume", silently dropping the
  // selection on save.
  const resumes = await prisma.candidateResume.findMany({
    where: {
      candidateId: submission.candidateId,
      OR: [
        { isActive: true },
        ...(submission.candidateResumeId
          ? [{ id: submission.candidateResumeId }]
          : []),
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, isActive: true },
  });

  return { ...submission, candidate: { ...submission.candidate, resumes } };
}

/** Submissions for one job — the submitted-candidates table on the job detail page. */
export async function getJobSubmissions(
  jobId: string,
  opts: { page?: number } = {},
) {
  const where = { jobId };
  const total = await prisma.submission.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / SUB_PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page ?? 1), totalPages);

  const rows = await prisma.submission.findMany({
    where,
    orderBy: { submittedAt: "desc" },
    skip: (page - 1) * SUB_PAGE_SIZE,
    take: SUB_PAGE_SIZE,
    include: {
      candidate: { select: { id: true, fullName: true } },
      submittedBy: { select: { fullName: true } },
      candidateResume: { select: { label: true } },
      _count: { select: { interviewRounds: true } },
    },
  });

  return { rows, total, page };
}

export type JobSubmissionRow = Awaited<
  ReturnType<typeof getJobSubmissions>
>["rows"][number];

/** Submissions for one candidate — the job-submission history on the candidate detail page. */
export async function getCandidateSubmissions(
  candidateId: string,
  opts: { page?: number } = {},
) {
  const where = { candidateId };
  const total = await prisma.submission.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / SUB_PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page ?? 1), totalPages);

  const rows = await prisma.submission.findMany({
    where,
    orderBy: { submittedAt: "desc" },
    skip: (page - 1) * SUB_PAGE_SIZE,
    take: SUB_PAGE_SIZE,
    include: {
      job: {
        select: {
          id: true,
          title: true,
          client: { select: { name: true } },
          vendor: { select: { name: true } },
          sisterCompanySource: { select: { name: true } },
          sourceOther: true,
        },
      },
      submittedBy: { select: { fullName: true } },
    },
  });

  return { rows, total, page };
}

export type CandidateSubmissionRow = Awaited<
  ReturnType<typeof getCandidateSubmissions>
>["rows"][number];

/** Candidate IDs already submitted to a job — lets the new-submission form flag duplicates. */
export async function getJobSubmittedCandidateIds(
  jobId: string,
): Promise<string[]> {
  const rows = await prisma.submission.findMany({
    where: { jobId },
    select: { candidateId: true },
  });
  return rows.map((r) => r.candidateId);
}
