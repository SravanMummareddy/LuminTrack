import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { JobStatus } from "@/generated/prisma/enums";
import type { DateRange } from "@/lib/filters";

export type JobListFilters = {
  q?: string;
  clientId?: string;
  vendorId?: string;
  sisterCompanySourceId?: string;
  recruiterId?: string;
  status?: JobStatus;
  location?: string;
  createdRange?: DateRange;
};

export async function listJobs(filters: JobListFilters) {
  const where: Prisma.JobWhereInput = {};

  if (filters.q) where.title = { contains: filters.q, mode: "insensitive" };
  if (filters.clientId) where.clientId = filters.clientId;
  if (filters.vendorId) where.vendorId = filters.vendorId;
  if (filters.sisterCompanySourceId)
    where.sisterCompanySourceId = filters.sisterCompanySourceId;
  if (filters.status) where.status = filters.status;
  if (filters.location)
    where.location = { contains: filters.location, mode: "insensitive" };
  if (filters.recruiterId)
    where.assignments = { some: { recruiterId: filters.recruiterId } };
  if (filters.createdRange?.gte || filters.createdRange?.lte)
    where.createdAt = filters.createdRange;

  return prisma.job.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { name: true } },
      vendor: { select: { name: true } },
      sisterCompanySource: { select: { name: true } },
      assignments: {
        include: { recruiter: { select: { id: true, fullName: true } } },
      },
      _count: { select: { submissions: true } },
    },
  });
}

export type JobListRow = Awaited<ReturnType<typeof listJobs>>[number];

export function getJobDetail(id: string) {
  return prisma.job.findUnique({
    where: { id },
    include: {
      client: true,
      vendor: true,
      sisterCompanySource: true,
      createdBy: { select: { fullName: true } },
      assignments: {
        include: { recruiter: { select: { id: true, fullName: true } } },
        orderBy: { assignedAt: "asc" },
      },
    },
  });
}

/** Minimal job shape for the new-submission page header and rate default. */
export function getJobSummary(id: string) {
  return prisma.job.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, candidateRate: true },
  });
}

/** Minimal job shape for the edit form — includes assigned recruiter IDs. */
export function getJobForEdit(id: string) {
  return prisma.job.findUnique({
    where: { id },
    include: { assignments: { select: { recruiterId: true } } },
  });
}

