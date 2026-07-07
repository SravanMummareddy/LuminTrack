import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type {
  BenchPriority,
  BenchMarketingStatus,
} from "@/generated/prisma/enums";
import { PAGE_SIZE, searchTerms, type SortDir, type SortState } from "@/lib/filters";

export type BenchListFilters = {
  q?: string;
  priority?: BenchPriority;
  marketingStatus?: BenchMarketingStatus;
  /** On-bench = actively being marketed (ACTIVE/PAUSED). The roster's default
   *  view; placed/inactive consultants are hidden unless explicitly requested.
   *  Ignored when an explicit `marketingStatus` is set. */
  onBench?: boolean;
  recruiterId?: string[];
  sort?: SortState;
  page?: number;
};

const BENCH_SORTS: Record<
  string,
  (d: SortDir) => Prisma.BenchConsultantOrderByWithRelationInput
> = {
  name: (d) => ({ fullName: d }),
  technology: (d) => ({ technology: d }),
  location: (d) => ({ currentLocation: d }),
  priority: (d) => ({ priority: d }),
  status: (d) => ({ marketingStatus: d }),
  recruiter: (d) => ({ recruiter: { fullName: d } }),
  created: (d) => ({ createdAt: d }),
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
  const where: Prisma.BenchConsultantWhereInput = {};
  if (filters.priority) where.priority = filters.priority;
  if (filters.marketingStatus) where.marketingStatus = filters.marketingStatus;
  else if (filters.onBench) where.marketingStatus = { in: ["ACTIVE", "PAUSED"] };
  if (filters.recruiterId?.length) where.recruiterId = { in: filters.recruiterId };
  const terms = searchTerms(filters.q);
  if (terms.length)
    where.AND = terms.map((t) => ({
      OR: [
        { fullName: { contains: t, mode: "insensitive" } },
        { technology: { contains: t, mode: "insensitive" } },
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

  const total = await prisma.benchConsultant.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);

  const raw = await prisma.benchConsultant.findMany({
    where,
    orderBy,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      seq: true,
      fullName: true,
      technology: true,
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
      isActive: true,
      candidateId: true,
      // Company is the linked candidate's current employer (owner's model); the
      // bench's own `company` is only a fallback for unlinked marketed identities.
      candidate: { select: { currentCompany: true } },
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
  return prisma.benchConsultant.findUnique({
    where: { id },
    omit: opts.includeCredentials ? {} : { marketingPassword: true },
    include: {
      recruiter: { select: { id: true, fullName: true } },
      candidate: { select: { id: true, seq: true, fullName: true } },
      createdBy: { select: { id: true, fullName: true } },
    },
  });
}

/** Raw row for the edit form (Decimals stringified for input defaults). */
export async function getBenchConsultantForEdit(id: string) {
  return prisma.benchConsultant.findUnique({ where: { id } });
}
