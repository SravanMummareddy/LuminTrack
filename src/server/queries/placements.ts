import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { PlacementStatus } from "@/generated/prisma/enums";
import {
  PAGE_SIZE,
  SUB_PAGE_SIZE,
  type SortDir,
  type SortState,
} from "@/lib/filters";

export type PlacementListFilters = {
  q?: string;
  status?: PlacementStatus;
  clientId?: string;
  recruiterId?: string;
  sort?: SortState;
  page?: number;
};

const PLACEMENT_SORTS: Record<
  string,
  (d: SortDir) => Prisma.PlacementOrderByWithRelationInput
> = {
  candidate: (d) => ({ candidate: { fullName: d } }),
  job: (d) => ({ job: { title: d } }),
  client: (d) => ({ job: { client: { name: d } } }),
  start: (d) => ({ startDate: d }),
  end: (d) => ({ endDate: d }),
  status: (d) => ({ status: d }),
};

export const PLACEMENT_SORT_KEYS = Object.keys(PLACEMENT_SORTS);
export const PLACEMENT_DEFAULT_SORT: SortState = {
  key: "start",
  dir: "desc",
};

/** Flatten a Prisma Placement row's Decimal rates for the RSC→Client boundary,
 *  and pre-compute margin so Client Components don't repeat the math. */
function flattenRates<
  T extends { billRate: Prisma.Decimal; payRate: Prisma.Decimal },
>(p: T): Omit<T, "billRate" | "payRate"> & {
  billRate: number;
  payRate: number;
  margin: number;
  marginPct: number | null;
} {
  const bill = Number(p.billRate);
  const pay = Number(p.payRate);
  const margin = bill - pay;
  return {
    ...p,
    billRate: bill,
    payRate: pay,
    margin,
    // Margin % is undefined when bill is 0 (rates-pending placement).
    marginPct: bill > 0 ? (margin / bill) * 100 : null,
  };
}

export async function listPlacements(filters: PlacementListFilters) {
  const where: Prisma.PlacementWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.clientId) where.job = { clientId: filters.clientId };
  if (filters.recruiterId)
    where.submission = { submittedById: filters.recruiterId };
  if (filters.q)
    where.OR = [
      { candidate: { fullName: { contains: filters.q, mode: "insensitive" } } },
      { job: { title: { contains: filters.q, mode: "insensitive" } } },
    ];

  const sort = filters.sort ?? PLACEMENT_DEFAULT_SORT;
  const sortFn = PLACEMENT_SORTS[sort.key] ?? PLACEMENT_SORTS.start;
  const orderBy: Prisma.PlacementOrderByWithRelationInput[] = [
    sortFn(sort.dir),
    { id: "asc" },
  ];

  const total = await prisma.placement.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);

  const raw = await prisma.placement.findMany({
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
        },
      },
      submission: {
        select: {
          id: true,
          submittedBy: { select: { id: true, fullName: true } },
        },
      },
    },
  });

  const rows = raw.map(flattenRates);

  return { rows, total, page };
}

export type PlacementListRow = Awaited<
  ReturnType<typeof listPlacements>
>["rows"][number];

/** Placement detail with extensions + submission + replacement (if set). */
export async function getPlacement(id: string) {
  const raw = await prisma.placement.findUnique({
    where: { id },
    include: {
      candidate: {
        select: { id: true, fullName: true, status: true },
      },
      job: {
        select: {
          id: true,
          seq: true,
          title: true,
          client: { select: { name: true } },
        },
      },
      submission: {
        select: {
          id: true,
          seq: true,
          submittedById: true,
          submittedBy: { select: { id: true, fullName: true } },
        },
      },
      replacementSubmission: {
        select: {
          id: true,
          seq: true,
          candidate: { select: { fullName: true } },
        },
      },
      extensions: {
        orderBy: { startDate: "asc" },
      },
    },
  });
  if (!raw) return null;
  return flattenRates(raw);
}

/** Top-strip summary for /placements: active count, total weekly margin,
 *  ending-within-14-days count. Weekly margin assumes 40-hour weeks. */
export async function getPlacementsSummary() {
  const today = new Date();
  const in14 = new Date(today.getTime() + 14 * 86_400_000);

  const [activeRows, endingSoon] = await Promise.all([
    prisma.placement.findMany({
      where: { status: { in: ["ACTIVE", "EXTENDED"] } },
      select: { billRate: true, payRate: true },
    }),
    prisma.placement.count({
      where: {
        status: { in: ["ACTIVE", "EXTENDED"] },
        endDate: { gte: today, lte: in14 },
      },
    }),
  ]);

  const weeklyMargin = activeRows.reduce(
    (sum, p) => sum + (Number(p.billRate) - Number(p.payRate)) * 40,
    0,
  );

  return {
    activeCount: activeRows.length,
    weeklyMargin,
    endingSoonCount: endingSoon,
  };
}

/** Placements with both rates still at 0 — surfaces on the Dashboard
 *  "Needs attention" card so admins close the loop on JOINED transitions. */
export async function getRatesPendingPlacements(opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 5;
  const raw = await prisma.placement.findMany({
    where: {
      status: { in: ["ACTIVE", "EXTENDED"] },
      billRate: 0,
      payRate: 0,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      candidate: { select: { id: true, fullName: true } },
      job: { select: { id: true, title: true } },
    },
  });
  return raw.map((r) => ({
    id: r.id,
    seq: r.seq,
    candidate: r.candidate,
    job: r.job,
    startDate: r.startDate,
  }));
}

/** Placements for one candidate — detail-page sub-table. */
export async function getCandidatePlacements(
  candidateId: string,
  opts: { page?: number } = {},
) {
  const where = { candidateId };
  const total = await prisma.placement.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / SUB_PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page ?? 1), totalPages);

  const raw = await prisma.placement.findMany({
    where,
    orderBy: { startDate: "desc" },
    skip: (page - 1) * SUB_PAGE_SIZE,
    take: SUB_PAGE_SIZE,
    include: {
      job: {
        select: {
          id: true,
          title: true,
          client: { select: { name: true } },
        },
      },
    },
  });
  return { rows: raw.map(flattenRates), total, page };
}

export type CandidatePlacementRow = Awaited<
  ReturnType<typeof getCandidatePlacements>
>["rows"][number];

/** The one currently-active placement for a candidate, if any. Used by the
 *  candidate detail page to render the "Currently placed" pinned card. */
export async function getActivePlacementForCandidate(candidateId: string) {
  const raw = await prisma.placement.findFirst({
    where: {
      candidateId,
      status: { in: ["ACTIVE", "EXTENDED"] },
    },
    orderBy: { startDate: "desc" },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          client: { select: { name: true } },
        },
      },
    },
  });
  if (!raw) return null;
  return flattenRates(raw);
}

/** Candidates already submitted to a given job — used by the End-placement
 *  form's replacement picker. Excludes the original placement's own
 *  submission and any submission already used as a replacement elsewhere. */
export async function getReplacementCandidates(opts: {
  jobId: string;
  excludeSubmissionId: string;
}) {
  return prisma.submission.findMany({
    where: {
      jobId: opts.jobId,
      id: { not: opts.excludeSubmissionId },
      replacementFor: null,
    },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      seq: true,
      candidate: { select: { fullName: true } },
      status: true,
    },
  });
}
