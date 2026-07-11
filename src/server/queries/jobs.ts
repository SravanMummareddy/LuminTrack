import { getScopedPrisma } from "@/lib/session";
import type { Prisma } from "@/generated/prisma/client";
import type { JobStatus, Discipline } from "@/generated/prisma/enums";
import { OTHER_SOURCE } from "@/lib/labels";
import { PAGE_SIZE, searchTerms, type DateRange, type SortDir, type SortState } from "@/lib/filters";

export type JobListFilters = {
  q?: string;
  clientId?: string[];
  vendorId?: string[];
  sisterCompanySourceId?: string[];
  recruiterId?: string[];
  status?: JobStatus[];
  discipline?: Discipline[];
  location?: string;
  createdRange?: DateRange;
  sort?: SortState;
  page?: number;
  /** Trash view: show only trashed-not-yet-erased jobs (admin). Default false =
   *  live jobs only (trashed + erased tombstones hidden). */
  trash?: boolean;
};

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
  discipline: (d) => ({ discipline: d }),
  subs: (d) => ({ submissions: { _count: d } }),
  created: (d) => ({ createdAt: d }),
  updated: (d) => ({ updatedAt: d }),
  startDate: (d) => ({ startDate: d }),
  positions: (d) => ({ positions: d }),
};

export const JOB_SORT_KEYS = Object.keys(JOB_SORTS);
export const JOB_DEFAULT_SORT: SortState = { key: "created", dir: "desc" };

/** Count of jobs in trash (trashed, not yet erased) — drives the Trash badge. */
export async function countTrashedJobs(): Promise<number> {
  const db = await getScopedPrisma();
  return db.job.count({
    where: { deletedAt: { not: null }, erasedAt: null },
  });
}

export async function listJobs(filters: JobListFilters) {
  const db = await getScopedPrisma();
  // Trash view shows trashed-not-erased jobs; the normal list hides anything
  // with a deletedAt (trashed jobs AND erased tombstones keep it set).
  const where: Prisma.JobWhereInput = filters.trash
    ? { deletedAt: { not: null }, erasedAt: null }
    : { deletedAt: null };

  const terms = searchTerms(filters.q);
  if (terms.length)
    where.AND = terms.map((t) => ({
      title: { contains: t, mode: "insensitive" },
    }));
  if (filters.clientId?.length) where.clientId = { in: filters.clientId };
  if (filters.vendorId?.length) where.vendorId = { in: filters.vendorId };
  if (filters.sisterCompanySourceId?.length) {
    // OTHER_SOURCE matches jobs with a free-text source (no managed-source FK);
    // real source ids match by FK. A mix ORs the two.
    const ids = filters.sisterCompanySourceId.filter((s) => s !== OTHER_SOURCE);
    const includeOther = filters.sisterCompanySourceId.includes(OTHER_SOURCE);
    const or: Prisma.JobWhereInput[] = [];
    if (ids.length) or.push({ sisterCompanySourceId: { in: ids } });
    if (includeOther) or.push({ sisterCompanySourceId: null });
    where.OR = or;
  }
  if (filters.status?.length) where.status = { in: filters.status };
  if (filters.discipline?.length) where.discipline = { in: filters.discipline };
  if (filters.location)
    where.location = { contains: filters.location, mode: "insensitive" };
  if (filters.recruiterId?.length)
    where.assignments = { some: { recruiterId: { in: filters.recruiterId } } };
  if (filters.createdRange?.gte || filters.createdRange?.lte)
    where.createdAt = filters.createdRange;

  const sort = filters.sort ?? JOB_DEFAULT_SORT;
  const sortFn = JOB_SORTS[sort.key] ?? JOB_SORTS.created;
  // `id` tiebreaker keeps pagination stable when the sort column has ties.
  const orderBy: Prisma.JobOrderByWithRelationInput[] = [
    sortFn(sort.dir),
    { id: "asc" },
  ];

  const total = await db.job.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);

  const raw = await db.job.findMany({
    where,
    orderBy,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
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

  // Per-job outcome tallies for the (hidden-by-default) Interviews / Selected /
  // Joined columns — spec §9.2. One extra query over just this page's jobs,
  // aggregated in memory. Interviews = interview rounds across the job's
  // submissions; Selected / Joined = submissions currently in that status (same
  // definition as the dashboard KPIs, so the numbers reconcile).
  const jobIds = raw.map((j) => j.id);
  const subStats = jobIds.length
    ? await db.submission.findMany({
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

export async function getJobDetail(id: string) {
  const db = await getScopedPrisma();
  return db.job.findUnique({
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

/**
 * Lightweight job list for the submission form's job picker (candidate-locked
 * and open entry points). Mirrors `listCandidateOptions`. Scoped to jobs that
 * still accept submissions (OPEN / ON_HOLD) so the dropdown isn't cluttered
 * with filled/closed/cancelled reqs. `seq` builds the display id label.
 */
export async function listJobOptions() {
  const db = await getScopedPrisma();
  const rows = await db.job.findMany({
    where: { status: { in: ["OPEN", "ON_HOLD"] }, deletedAt: null },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      seq: true,
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
export async function getJobForEdit(id: string) {
  const db = await getScopedPrisma();
  return db.job.findUnique({
    where: { id },
    include: { assignments: { select: { recruiterId: true } } },
  });
}

