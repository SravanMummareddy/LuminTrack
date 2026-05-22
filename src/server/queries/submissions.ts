import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { SubmissionStatus } from "@/generated/prisma/enums";
import type { DateRange } from "@/lib/filters";

export type SubmissionListFilters = {
  q?: string;
  status?: SubmissionStatus;
  recruiterId?: string;
  clientId?: string;
  vendorId?: string;
  sisterCompanySourceId?: string;
  submittedRange?: DateRange;
};

export function listSubmissions(filters: SubmissionListFilters) {
  const where: Prisma.SubmissionWhereInput = {};

  if (filters.status) where.status = filters.status;
  if (filters.recruiterId) where.submittedById = filters.recruiterId;
  if (filters.submittedRange?.gte || filters.submittedRange?.lte)
    where.submittedAt = filters.submittedRange;

  const job: Prisma.JobWhereInput = {};
  if (filters.clientId) job.clientId = filters.clientId;
  if (filters.vendorId) job.vendorId = filters.vendorId;
  if (filters.sisterCompanySourceId)
    job.sisterCompanySourceId = filters.sisterCompanySourceId;
  if (Object.keys(job).length) where.job = job;

  if (filters.q)
    where.OR = [
      { candidate: { fullName: { contains: filters.q, mode: "insensitive" } } },
      { job: { title: { contains: filters.q, mode: "insensitive" } } },
    ];

  return prisma.submission.findMany({
    where,
    orderBy: { submittedAt: "desc" },
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
}

export type SubmissionListRow = Awaited<ReturnType<typeof listSubmissions>>[number];

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
      interviewRounds: {
        orderBy: { roundOrder: "asc" },
        include: { updatedBy: { select: { fullName: true } } },
      },
    },
  });
}

/** Submissions for one job — the submitted-candidates table on the job detail page. */
export function getJobSubmissions(jobId: string) {
  return prisma.submission.findMany({
    where: { jobId },
    orderBy: { submittedAt: "desc" },
    include: {
      candidate: { select: { id: true, fullName: true } },
      submittedBy: { select: { fullName: true } },
      _count: { select: { interviewRounds: true } },
    },
  });
}

export type JobSubmissionRow = Awaited<ReturnType<typeof getJobSubmissions>>[number];

/** Submissions for one candidate — the job-submission history on the candidate detail page. */
export function getCandidateSubmissions(candidateId: string) {
  return prisma.submission.findMany({
    where: { candidateId },
    orderBy: { submittedAt: "desc" },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          client: { select: { name: true } },
          vendor: { select: { name: true } },
          sisterCompanySource: { select: { name: true } },
        },
      },
      submittedBy: { select: { fullName: true } },
    },
  });
}

export type CandidateSubmissionRow = Awaited<
  ReturnType<typeof getCandidateSubmissions>
>[number];

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
