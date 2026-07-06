import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { JobStatus } from "@/generated/prisma/enums";
import { OTHER_SOURCE } from "@/lib/labels";
import { PAGE_SIZE, searchTerms, type DateRange, type SortDir, type SortState } from "@/lib/filters";

/**
 * Source sub-tabs on /jobs:
 *   "manual"   — Job.portalId is null (recruiter-entered)
 *   "randstad" — linked to the Randstad iLabor JobPortal
 *   undefined  — all jobs (default)
 */
export type JobSource = "manual" | "randstad";

export type JobListFilters = {
  q?: string;
  clientId?: string[];
  vendorId?: string[];
  sisterCompanySourceId?: string;
  recruiterId?: string[];
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

  const terms = searchTerms(filters.q);
  if (terms.length)
    where.AND = terms.map((t) => ({
      title: { contains: t, mode: "insensitive" },
    }));
  if (filters.clientId?.length) where.clientId = { in: filters.clientId };
  if (filters.vendorId?.length) where.vendorId = { in: filters.vendorId };
  if (filters.sisterCompanySourceId)
    // OTHER_SOURCE matches jobs with a free-text source (no managed-source FK).
    where.sisterCompanySourceId =
      filters.sisterCompanySourceId === OTHER_SOURCE
        ? null
        : filters.sisterCompanySourceId;
  if (filters.status) where.status = filters.status;
  if (filters.location)
    where.location = { contains: filters.location, mode: "insensitive" };
  if (filters.recruiterId?.length)
    where.assignments = { some: { recruiterId: { in: filters.recruiterId } } };
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

  const raw = await prisma.job.findMany({
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

  // Per-job outcome tallies for the (hidden-by-default) Interviews / Selected /
  // Joined columns — spec §9.2. One extra query over just this page's jobs,
  // aggregated in memory. Interviews = interview rounds across the job's
  // submissions; Selected / Joined = submissions currently in that status (same
  // definition as the dashboard KPIs, so the numbers reconcile).
  const jobIds = raw.map((j) => j.id);
  const subStats = jobIds.length
    ? await prisma.submission.findMany({
        where: { jobId: { in: jobIds } },
        select: {
          jobId: true,
          status: true,
          _count: { select: { interviewRounds: true } },
        },
      })
    : [];
  const tally = new Map<
    string,
    { interviews: number; selected: number; joined: number }
  >();
  for (const id of jobIds) tally.set(id, { interviews: 0, selected: 0, joined: 0 });
  for (const s of subStats) {
    const t = tally.get(s.jobId);
    if (!t) continue;
    t.interviews += s._count.interviewRounds;
    if (s.status === "SELECTED") t.selected += 1;
    else if (s.status === "JOINED") t.joined += 1;
  }

  // Prisma Decimal is not serializable across the Server → Client Component
  // boundary (RSC requires plain JSON values). Coerce rate fields to plain
  // numbers here, once, so downstream consumers — including <JobsTable> —
  // can treat them as primitives.
  const rows = raw.map(({ clientRate, vendorRate, ...rest }) => {
    const t = tally.get(rest.id) ?? { interviews: 0, selected: 0, joined: 0 };
    return {
      ...rest,
      clientRate: clientRate != null ? Number(clientRate) : null,
      vendorRate: vendorRate != null ? Number(vendorRate) : null,
      interviewCount: t.interviews,
      selectedCount: t.selected,
      joinedCount: t.joined,
    };
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

/**
 * Jobs that were imported from iLabor at some point but did NOT appear in
 * the most recent import — surfaces silent "disappeared from iLabor"
 * cases. Only includes jobs that are still OPEN or ON_HOLD in LuminTrack
 * (closed/filled/cancelled jobs aren't worth flagging — they're already
 * terminal). Limit to portal-linked jobs (i.e. ones that came from iLabor
 * in the first place).
 */
export async function listStaleIlaborJobs(opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 50;
  const lastRun = await prisma.activity.findFirst({
    where: { action: "REQUISITIONS_IMPORTED" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!lastRun) return { rows: [], lastImportAt: null as Date | null };

  // A job is "stale" when its last import touched it BEFORE the most recent
  // bulk-import run. Small clock-skew buffer (60s) avoids false positives
  // for the run that's actively in flight.
  const cutoff = new Date(lastRun.createdAt.getTime() - 60_000);
  const rows = await prisma.job.findMany({
    where: {
      portalId: { not: null },
      status: { in: ["OPEN", "ON_HOLD"] },
      lastImportedAt: { lt: cutoff },
    },
    orderBy: { lastImportedAt: "asc" },
    take: limit,
    select: {
      id: true,
      seq: true,
      title: true,
      portalRefId: true,
      lastImportedAt: true,
      externalStatusRaw: true,
      client: { select: { name: true } },
    },
  });
  return { rows, lastImportAt: lastRun.createdAt };
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

/** Minimal job shape for the new-submission page header. */
export function getJobSummary(id: string) {
  return prisma.job.findUnique({
    where: { id },
    select: { id: true, title: true, status: true },
  });
}

/**
 * Lightweight job list for the submission form's job picker (candidate-locked
 * and open entry points). Mirrors `listCandidateOptions`. Scoped to jobs that
 * still accept submissions (OPEN / ON_HOLD) so the dropdown isn't cluttered
 * with filled/closed/cancelled reqs. `seq`/`portalRefId` build the display id
 * label.
 */
export async function listJobOptions() {
  const rows = await prisma.job.findMany({
    where: { status: { in: ["OPEN", "ON_HOLD"] } },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      seq: true,
      portalRefId: true,
      client: { select: { name: true } },
    },
  });
  return rows.map(({ client, ...rest }) => ({
    ...rest,
    clientName: client?.name ?? null,
  }));
}

export type JobOption = Awaited<ReturnType<typeof listJobOptions>>[number];

/** Minimal job shape for the edit form — includes assigned recruiter IDs. */
export function getJobForEdit(id: string) {
  return prisma.job.findUnique({
    where: { id },
    include: { assignments: { select: { recruiterId: true } } },
  });
}

