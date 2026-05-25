import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { SubmissionStatus } from "@/generated/prisma/enums";
import { OTHER_SOURCE } from "@/lib/labels";
import { PAGE_SIZE, type DateRange, type SortDir, type SortState } from "@/lib/filters";

export type SubmissionListFilters = {
  q?: string;
  status?: SubmissionStatus;
  recruiterId?: string;
  clientId?: string;
  vendorId?: string;
  sisterCompanySourceId?: string;
  submittedRange?: DateRange;
  sort?: SortState;
  page?: number;
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
};

export const SUBMISSION_SORT_KEYS = Object.keys(SUBMISSION_SORTS);
export const SUBMISSION_DEFAULT_SORT: SortState = {
  key: "submitted",
  dir: "desc",
};

export async function listSubmissions(filters: SubmissionListFilters) {
  const where: Prisma.SubmissionWhereInput = {};

  if (filters.status) where.status = filters.status;
  if (filters.recruiterId) where.submittedById = filters.recruiterId;
  if (filters.submittedRange?.gte || filters.submittedRange?.lte)
    where.submittedAt = filters.submittedRange;

  const job: Prisma.JobWhereInput = {};
  if (filters.clientId) job.clientId = filters.clientId;
  if (filters.vendorId) job.vendorId = filters.vendorId;
  if (filters.sisterCompanySourceId)
    // OTHER_SOURCE matches jobs with a free-text source (no managed-source FK).
    job.sisterCompanySourceId =
      filters.sisterCompanySourceId === OTHER_SOURCE
        ? null
        : filters.sisterCompanySourceId;
  if (Object.keys(job).length) where.job = job;

  if (filters.q)
    where.OR = [
      { candidate: { fullName: { contains: filters.q, mode: "insensitive" } } },
      { job: { title: { contains: filters.q, mode: "insensitive" } } },
    ];

  const sort = filters.sort ?? SUBMISSION_DEFAULT_SORT;
  const sortFn = SUBMISSION_SORTS[sort.key] ?? SUBMISSION_SORTS.submitted;
  const orderBy: Prisma.SubmissionOrderByWithRelationInput[] = [
    sortFn(sort.dir),
    { id: "asc" },
  ];

  const total = await prisma.submission.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);

  const rows = await prisma.submission.findMany({
    where,
    orderBy,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
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
      _count: { select: { interviewRounds: true } },
    },
  });

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
      candidateResume: { select: { label: true } },
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
 *  candidate's full résumé library so the form can offer the résumé picker. */
export function getSubmissionForEdit(id: string) {
  return prisma.submission.findUnique({
    where: { id },
    select: {
      id: true,
      candidateRate: true,
      submissionNotes: true,
      submittedAt: true,
      candidateResumeId: true,
      resumeDriveLink: true,
      job: { select: { title: true } },
      submittedBy: { select: { fullName: true } },
      candidate: {
        select: {
          fullName: true,
          resumes: {
            orderBy: { createdAt: "asc" },
            select: { id: true, label: true, driveLink: true },
          },
        },
      },
    },
  });
}

/** Submissions for one job — the submitted-candidates table on the job detail page. */
export async function getJobSubmissions(
  jobId: string,
  opts: { page?: number } = {},
) {
  const where = { jobId };
  const total = await prisma.submission.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page ?? 1), totalPages);

  const rows = await prisma.submission.findMany({
    where,
    orderBy: { submittedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page ?? 1), totalPages);

  const rows = await prisma.submission.findMany({
    where,
    orderBy: { submittedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
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
