import { getScopedPrisma } from "@/lib/session";
import type { Prisma } from "@/generated/prisma/client";
import type {
  BenchPriority,
  BenchMarketingStatus,
  Discipline,
} from "@/generated/prisma/enums";
import { PAGE_SIZE, searchTerms, type SortDir, type SortState } from "@/lib/filters";

export type BenchListFilters = {
  q?: string;
  priority?: BenchPriority;
  /** Marketing statuses to include (multi-select). Undefined = all statuses.
   *  The page defaults an absent filter to ["ACTIVE","PAUSED"] (being marketed). */
  marketingStatuses?: BenchMarketingStatus[];
  recruiterId?: string[];
  discipline?: Discipline[];
  sort?: SortState;
  page?: number;
};

/** Total bench consultants across every status/filter — used to show how many
 *  rows the active filters are hiding ("N hidden by filters"). */
export async function countAllBenchConsultants() {
  const db = await getScopedPrisma();
  return db.benchConsultant.count();
}

const BENCH_SORTS: Record<
  string,
  (d: SortDir) => Prisma.BenchConsultantOrderByWithRelationInput
> = {
  name: (d) => ({ fullName: d }),
  // Technology lives on the linked candidate (source of truth) now.
  technology: (d) => ({ candidate: { technology: d } }),
  location: (d) => ({ currentLocation: d }),
  priority: (d) => ({ priority: d }),
  status: (d) => ({ marketingStatus: d }),
  recruiter: (d) => ({ recruiter: { fullName: d } }),
  created: (d) => ({ createdAt: d }),
  updated: (d) => ({ updatedAt: d }),
  experience: (d) => ({ marketingExpYears: d }),
  leastRate: (d) => ({ leastRateC2C: d }),
};

export const BENCH_SORT_KEYS = Object.keys(BENCH_SORTS);
// Default: High priority first (enum order HIGH→SECOND), then by name. This
// gives the sheet's "High / Second Priority" grouping for free on each page.
export const BENCH_DEFAULT_SORT: SortState = { key: "priority", dir: "asc" };

/** Flatten Decimal columns for the RSC→Client boundary. Marketing credentials
 *  are deliberately NOT projected here — they're detail-only + gated. */
function flattenBench<
  T extends {
    marketingExpYears: Prisma.Decimal | null;
    realTimeExpYears: Prisma.Decimal | null;
    leastRateC2C: Prisma.Decimal | null;
  },
>(c: T) {
  return {
    ...c,
    marketingExpYears: c.marketingExpYears === null ? null : Number(c.marketingExpYears),
    realTimeExpYears: c.realTimeExpYears === null ? null : Number(c.realTimeExpYears),
    leastRateC2C: c.leastRateC2C === null ? null : Number(c.leastRateC2C),
  };
}

export async function listBenchConsultants(filters: BenchListFilters) {
  const db = await getScopedPrisma();
  const where: Prisma.BenchConsultantWhereInput = {};
  if (filters.priority) where.priority = filters.priority;
  if (filters.marketingStatuses?.length)
    where.marketingStatus = { in: filters.marketingStatuses };
  if (filters.recruiterId?.length) where.recruiterId = { in: filters.recruiterId };
  // Discipline now lives on the linked candidate (source of truth), so filter
  // through the relation.
  if (filters.discipline?.length)
    where.candidate = { discipline: { in: filters.discipline } };
  const terms = searchTerms(filters.q);
  if (terms.length)
    where.AND = terms.map((t) => ({
      OR: [
        { fullName: { contains: t, mode: "insensitive" } },
        { candidate: { technology: { contains: t, mode: "insensitive" } } },
        { currentLocation: { contains: t, mode: "insensitive" } },
      ],
    }));

  const sort = filters.sort ?? BENCH_DEFAULT_SORT;
  const sortFn = BENCH_SORTS[sort.key] ?? BENCH_SORTS.priority;
  // Always tiebreak by name so groups read cleanly, then id for stability.
  const orderBy: Prisma.BenchConsultantOrderByWithRelationInput[] =
    sort.key === "name"
      ? [sortFn(sort.dir), { id: "asc" }]
      : [sortFn(sort.dir), { fullName: "asc" }, { id: "asc" }];

  const total = await db.benchConsultant.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);

  const raw = await db.benchConsultant.findMany({
    where,
    orderBy,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      seq: true,
      fullName: true,
      mVisa: true,
      aVisa: true,
      workAuthorization: true,
      marketingExpYears: true,
      realTimeExpYears: true,
      currentLocation: true,
      relocation: true,
      priority: true,
      marketingStatus: true,
      leastRateC2C: true,
      company: true,
      candidateId: true,
      createdAt: true,
      updatedAt: true,
      // The linked candidate is the source of truth for company + discipline +
      // technology; the bench's own `company` is only a fallback for unlinked
      // identities.
      candidate: {
        select: { currentCompany: true, discipline: true, technology: true },
      },
      recruiter: { select: { id: true, fullName: true } },
    },
  });

  return { rows: raw.map(flattenBench), total, page };
}

export type BenchListRow = Awaited<
  ReturnType<typeof listBenchConsultants>
>["rows"][number];

/**
 * Full detail. The marketing password is a gated credential — the caller passes
 * `includeCredentials` (from `canViewBenchCredentials`) and the field is dropped
 * from the query entirely for everyone else, so it never leaves the database for
 * an unauthorized viewer (defense-in-depth, not just hidden at render time).
 */
export async function getBenchConsultant(
  id: string,
  opts: { includeCredentials?: boolean } = {},
) {
  const db = await getScopedPrisma();
  return db.benchConsultant.findUnique({
    where: { id },
    omit: opts.includeCredentials ? {} : { marketingPassword: true },
    include: {
      recruiter: { select: { id: true, fullName: true } },
      // Technology + real-time experience are candidate-owned (source of truth).
      candidate: {
        select: {
          id: true,
          seq: true,
          fullName: true,
          technology: true,
          realTimeExperienceYears: true,
        },
      },
      createdBy: { select: { id: true, fullName: true } },
    },
  });
}

/** The linked bench row for a candidate (id + status), or null if not on the
 *  bench. Powers the "Marketing" line on the candidate detail page. */
export async function getBenchLinkForCandidate(candidateId: string) {
  const db = await getScopedPrisma();
  return db.benchConsultant.findUnique({
    where: { candidateId },
    select: { id: true, marketingStatus: true },
  });
}

/** Raw row for the edit form (Decimals stringified for input defaults). The
 *  linked candidate carries technology (source of truth), so include it. */
export async function getBenchConsultantForEdit(id: string) {
  const db = await getScopedPrisma();
  return db.benchConsultant.findUnique({
    where: { id },
    include: { candidate: { select: { technology: true } } },
  });
}
