import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { JobStatus } from "@/generated/prisma/enums";
import { OTHER_SOURCE } from "@/lib/labels";
import { PAGE_SIZE, type DateRange, type SortDir, type SortState } from "@/lib/filters";

/**
 * Source sub-tabs on /jobs:
 *   "manual"   — Job.portalId is null (recruiter-entered)
 *   "randstad" — linked to the Randstad iLabor JobPortal
 *   undefined  — all jobs (default)
 */
export type JobSource = "manual" | "randstad";

export type JobListFilters = {
  q?: string;
  clientId?: string;
  vendorId?: string;
  sisterCompanySourceId?: string;
  recruiterId?: string;
  status?: JobStatus;
  location?: string;
  source?: JobSource;
  createdRange?: DateRange;
  sort?: SortState;
  page?: number;
};

export const RANDSTAD_PORTAL_NAME = "Randstad iLabor";

/** Columns the Jobs list can be sorted by → their Prisma `orderBy`. */
const JOB_SORTS: Record<
  string,
  (d: SortDir) => Prisma.JobOrderByWithRelationInput
> = {
  title: (d) => ({ title: d }),
  client: (d) => ({ client: { name: d } }),
  vendor: (d) => ({ vendor: { name: d } }),
  source: (d) => ({ sisterCompanySource: { name: d } }),
  location: (d) => ({ location: d }),
  status: (d) => ({ status: d }),
  subs: (d) => ({ submissions: { _count: d } }),
  created: (d) => ({ createdAt: d }),
};

export const JOB_SORT_KEYS = Object.keys(JOB_SORTS);
export const JOB_DEFAULT_SORT: SortState = { key: "created", dir: "desc" };

export async function listJobs(filters: JobListFilters) {
  const where: Prisma.JobWhereInput = {};

  if (filters.q) where.title = { contains: filters.q, mode: "insensitive" };
  if (filters.clientId) where.clientId = filters.clientId;
  if (filters.vendorId) where.vendorId = filters.vendorId;
  if (filters.sisterCompanySourceId)
    // OTHER_SOURCE matches jobs with a free-text source (no managed-source FK).
    where.sisterCompanySourceId =
      filters.sisterCompanySourceId === OTHER_SOURCE
        ? null
        : filters.sisterCompanySourceId;
  if (filters.status) where.status = filters.status;
  if (filters.location)
    where.location = { contains: filters.location, mode: "insensitive" };
  if (filters.recruiterId)
    where.assignments = { some: { recruiterId: filters.recruiterId } };
  if (filters.source === "manual") where.portalId = null;
  if (filters.source === "randstad")
    where.portal = { is: { name: RANDSTAD_PORTAL_NAME } };
  if (filters.createdRange?.gte || filters.createdRange?.lte)
    where.createdAt = filters.createdRange;

  const sort = filters.sort ?? JOB_DEFAULT_SORT;
  const sortFn = JOB_SORTS[sort.key] ?? JOB_SORTS.created;
  // `id` tiebreaker keeps pagination stable when the sort column has ties.
  const orderBy: Prisma.JobOrderByWithRelationInput[] = [
    sortFn(sort.dir),
    { id: "asc" },
  ];

  const total = await prisma.job.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);

  const rows = await prisma.job.findMany({
    where,
    orderBy,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      client: { select: { name: true } },
      vendor: { select: { name: true } },
      sisterCompanySource: { select: { name: true } },
      portal: { select: { name: true } },
      assignments: {
        include: { recruiter: { select: { id: true, fullName: true } } },
      },
      _count: { select: { submissions: true } },
    },
  });

  return { rows, total, page };
}

export type JobListRow = Awaited<ReturnType<typeof listJobs>>["rows"][number];

/**
 * Most recent bulk-import audit row, for the "Last imported …" banner on the
 * Randstad tab. Returns null on a fresh DB.
 *
 * Reads the existing JSON summary on Activity.newValue (set by importRequisitions)
 * so the banner can show the counts without re-aggregating jobs.
 */
export async function getLastIlaborImport() {
  return prisma.activity.findFirst({
    where: { action: "REQUISITIONS_IMPORTED" },
    orderBy: { createdAt: "desc" },
    include: { performedBy: { select: { fullName: true } } },
  });
}

/**
 * Full history of bulk iLabor imports — one row per import run.
 * Powers the admin-only `/jobs/imports` page. Paginated client-side for now;
 * if this ever grows past ~hundreds of runs we'd add offset paging.
 */
export async function listIlaborImports() {
  return prisma.activity.findMany({
    where: { action: "REQUISITIONS_IMPORTED" },
    orderBy: { createdAt: "desc" },
    include: { performedBy: { select: { fullName: true } } },
    take: 200,
  });
}

export function getJobDetail(id: string) {
  return prisma.job.findUnique({
    where: { id },
    include: {
      client: true,
      vendor: true,
      sisterCompanySource: true,
      portal: true,
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

