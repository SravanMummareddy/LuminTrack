import type { Prisma } from "@/generated/prisma/client";
import type { PlacementStatus, UserRole } from "@/generated/prisma/enums";
import { getScopedPrisma } from "@/lib/session";
import { canViewFinancials } from "@/lib/permissions";
import {
  PAGE_SIZE,
  SUB_PAGE_SIZE,
  searchTerms,
  type DateRange,
  type SortDir,
  type SortState,
} from "@/lib/filters";

export type PlacementListFilters = {
  q?: string;
  status?: PlacementStatus;
  clientId?: string[];
  recruiterId?: string[];
  /** Filters on the placement start date (when the assignment began). */
  startedRange?: DateRange;
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
  vendor: (d) => ({ job: { vendor: { name: d } } }),
  start: (d) => ({ startDate: d }),
  end: (d) => ({ endDate: d }),
  bill: (d) => ({ billRate: d }),
  pay: (d) => ({ payRate: d }),
  recruiter: (d) => ({ submission: { submittedBy: { fullName: d } } }),
  status: (d) => ({ status: d }),
  created: (d) => ({ createdAt: d }),
  updated: (d) => ({ updatedAt: d }),
};

export const PLACEMENT_SORT_KEYS = Object.keys(PLACEMENT_SORTS);
export const PLACEMENT_DEFAULT_SORT: SortState = {
  key: "start",
  dir: "desc",
};

/** Flatten a Prisma Placement row's Decimal rates for the RSC→Client boundary,
 *  and pre-compute margin so Client Components don't repeat the math. */
function flattenRates<
  T extends {
    billRate: Prisma.Decimal;
    payRate: Prisma.Decimal;
    clientRate?: Prisma.Decimal | null;
  },
>(p: T): Omit<T, "billRate" | "payRate" | "clientRate"> & {
  billRate: number;
  payRate: number;
  clientRate: number | null;
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
    clientRate: p.clientRate == null ? null : Number(p.clientRate),
    margin,
    // Margin % is undefined when bill is 0 (rates-pending placement).
    marginPct: bill > 0 ? (margin / bill) * 100 : null,
  };
}

/** Who's viewing — drives per-row rate masking. A recruiter may see rates only
 *  on their own placements; managers / team leads see all. */
export type PlacementViewer = { id: string; role: string };

/** Null out the rate fields on a flattened row the viewer isn't allowed to see.
 *  The masking MUST happen here (server-side, before the RSC→Client boundary):
 *  the "—" the table renders is only a display choice, so leaving the numbers in
 *  the client payload leaks every recruiter's Bill/Pay/Margin to any recruiter.
 *  Same rule the client `canSeeRates` uses, so the two never diverge. */
function maskRatesForViewer<
  T extends {
    billRate: number;
    payRate: number;
    clientRate: number | null;
    margin: number;
    marginPct: number | null;
    submission: { submittedBy: { id: string } };
  },
>(row: T, viewer: PlacementViewer) {
  const canSee =
    canViewFinancials({ role: viewer.role as UserRole }) ||
    row.submission.submittedBy.id === viewer.id;
  return {
    ...row,
    billRate: canSee ? row.billRate : null,
    payRate: canSee ? row.payRate : null,
    clientRate: canSee ? row.clientRate : null,
    margin: canSee ? row.margin : null,
    marginPct: canSee ? row.marginPct : null,
  };
}

export async function listPlacements(
  filters: PlacementListFilters,
  viewer: PlacementViewer,
) {
  const db = await getScopedPrisma();
  const where: Prisma.PlacementWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.clientId?.length) where.job = { clientId: { in: filters.clientId } };
  if (filters.recruiterId?.length)
    where.submission = { submittedById: { in: filters.recruiterId } };
  if (filters.startedRange?.gte || filters.startedRange?.lte)
    where.startDate = filters.startedRange;
  const terms = searchTerms(filters.q);
  if (terms.length)
    where.AND = terms.map((t) => ({
      OR: [
        { candidate: { fullName: { contains: t, mode: "insensitive" } } },
        { job: { title: { contains: t, mode: "insensitive" } } },
      ],
    }));

  const sort = filters.sort ?? PLACEMENT_DEFAULT_SORT;
  const sortFn = PLACEMENT_SORTS[sort.key] ?? PLACEMENT_SORTS.start;
  const orderBy: Prisma.PlacementOrderByWithRelationInput[] = [
    sortFn(sort.dir),
    { id: "asc" },
  ];

  const total = await db.placement.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);

  const raw = await db.placement.findMany({
    where,
    orderBy,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      candidate: {
        select: { id: true, fullName: true, deletedAt: true, erasedAt: true },
      },
      job: {
        select: {
          id: true,
          title: true,
          deletedAt: true,
          erasedAt: true,
          client: { select: { name: true } },
          vendor: { select: { name: true } },
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

  const rows = raw.map((p) => maskRatesForViewer(flattenRates(p), viewer));

  return { rows, total, page };
}

export type PlacementListRow = Awaited<
  ReturnType<typeof listPlacements>
>["rows"][number];

/** Placement detail with extensions + submission + replacement (if set). */
export async function getPlacement(id: string) {
  const db = await getScopedPrisma();
  const raw = await db.placement.findUnique({
    where: { id },
    include: {
      candidate: {
        select: { id: true, seq: true, fullName: true, status: true },
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

/** If this placement's submission was picked as the replacement on a prior
 *  placement's end-of-placement card, return that prior placement so we can
 *  surface a "Replaces PLC-007" pill. Returns null when this is not a
 *  replacement. */
export async function getPredecessorPlacement(submissionId: string) {
  const db = await getScopedPrisma();
  return db.placement.findFirst({
    where: { replacementSubmissionId: submissionId },
    select: {
      id: true,
      seq: true,
      candidate: { select: { fullName: true } },
    },
  });
}

/** Top-strip summary for /placements: active count, total weekly margin,
 *  ending-within-14-days count. Weekly margin assumes 40-hour weeks. */
export async function getPlacementsSummary() {
  const db = await getScopedPrisma();
  const today = new Date();
  const in14 = new Date(today.getTime() + 14 * 86_400_000);

  const [activeRows, endingSoon] = await Promise.all([
    db.placement.findMany({
      where: { status: { in: ["ACTIVE", "EXTENDED"] } },
      select: { billRate: true, payRate: true },
    }),
    db.placement.count({
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
  const db = await getScopedPrisma();
  const limit = opts.limit ?? 5;
  const raw = await db.placement.findMany({
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
  const db = await getScopedPrisma();
  const where = { candidateId };
  const total = await db.placement.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / SUB_PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page ?? 1), totalPages);

  const raw = await db.placement.findMany({
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
  const db = await getScopedPrisma();
  const raw = await db.placement.findFirst({
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
  const db = await getScopedPrisma();
  return db.submission.findMany({
    where: {
      jobId: opts.jobId,
      id: { not: opts.excludeSubmissionId },
      replacementFor: null,
      // A dead-end submission (rejected / backed out) or a deleted candidate
      // isn't a viable replacement.
      status: { notIn: ["REJECTED", "BACKED_OUT"] },
      candidate: { deletedAt: null },
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
