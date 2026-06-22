import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { UserRole } from "@/generated/prisma/enums";
import { PAGE_SIZE, searchTerms, type DateRange, type SortDir, type SortState } from "@/lib/filters";
import { canViewSensitiveDocs } from "@/lib/permissions";

export type CandidateListFilters = {
  q?: string;
  skill?: string;
  location?: string;
  workAuthorization?: string;
  currentCompany?: string;
  minExperience?: number;
  isActive?: boolean;
  createdRange?: DateRange;
  sort?: SortState;
  page?: number;
};

/** Columns the Candidates list can be sorted by → their Prisma `orderBy`. */
const CANDIDATE_SORTS: Record<
  string,
  (d: SortDir) => Prisma.CandidateOrderByWithRelationInput
> = {
  name: (d) => ({ fullName: d }),
  email: (d) => ({ email: d }),
  phone: (d) => ({ phone: d }),
  location: (d) => ({ currentLocation: d }),
  experience: (d) => ({ totalExperienceYears: d }),
  subs: (d) => ({ submissions: { _count: d } }),
  updated: (d) => ({ updatedAt: d }),
};

export const CANDIDATE_SORT_KEYS = Object.keys(CANDIDATE_SORTS);
export const CANDIDATE_DEFAULT_SORT: SortState = { key: "updated", dir: "desc" };

const candidateListInclude = {
  _count: { select: { submissions: true } },
} satisfies Prisma.CandidateInclude;

export async function listCandidates(filters: CandidateListFilters) {
  const where: Prisma.CandidateWhereInput = {};

  const terms = searchTerms(filters.q);
  if (terms.length)
    where.AND = terms.map((t) => ({
      fullName: { contains: t, mode: "insensitive" },
    }));
  if (filters.location)
    where.currentLocation = { contains: filters.location, mode: "insensitive" };
  if (filters.workAuthorization)
    where.workAuthorization = {
      contains: filters.workAuthorization,
      mode: "insensitive",
    };
  if (filters.currentCompany)
    where.currentCompany = {
      contains: filters.currentCompany,
      mode: "insensitive",
    };
  if (filters.minExperience != null)
    where.totalExperienceYears = { gte: filters.minExperience };
  if (filters.isActive != null) where.isActive = filters.isActive;
  if (filters.createdRange?.gte || filters.createdRange?.lte)
    where.createdAt = filters.createdRange;

  const sort = filters.sort ?? CANDIDATE_DEFAULT_SORT;
  const sortFn = CANDIDATE_SORTS[sort.key] ?? CANDIDATE_SORTS.updated;
  const orderBy: Prisma.CandidateOrderByWithRelationInput[] = [
    sortFn(sort.dir),
    { id: "asc" },
  ];

  const skill = filters.skill?.toLowerCase();

  // `skills` is a Postgres text array — Prisma can't do a case-insensitive
  // partial match on array elements, so the skill filter (and therefore
  // pagination) runs in memory when a skill is supplied.
  if (skill) {
    const all = await prisma.candidate.findMany({
      where,
      orderBy,
      include: candidateListInclude,
    });
    const filtered = all.filter((c) =>
      (c.skills ?? []).some((s) => s.toLowerCase().includes(skill)),
    );
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);
    const rows = filtered
      .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      .map(serializeCandidateRow);
    return { rows, total, page };
  }

  const total = await prisma.candidate.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);

  const raw = await prisma.candidate.findMany({
    where,
    orderBy,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: candidateListInclude,
  });
  const rows = raw.map(serializeCandidateRow);

  return { rows, total, page };
}

// Prisma `Decimal` isn't serializable across the RSC → Client boundary.
// The list tables are Client Components, so flatten to plain numbers here.
function serializeCandidateRow<
  T extends { totalExperienceYears: { toString(): string } | null },
>(c: T): Omit<T, "totalExperienceYears"> & { totalExperienceYears: number | null } {
  return {
    ...c,
    totalExperienceYears:
      c.totalExperienceYears == null ? null : Number(c.totalExperienceYears),
  };
}

export type CandidateListRow = Awaited<
  ReturnType<typeof listCandidates>
>["rows"][number];

export function getCandidateDetail(id: string) {
  return prisma.candidate.findUnique({
    where: { id },
    include: {
      createdBy: { select: { fullName: true } },
      resumes: {
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { submissions: true } } },
      },
    },
  });
}

/**
 * Documents for the candidate detail page. Sensitive categories
 * (Identity, Work Auth) are filtered server-side based on viewer role.
 * Sorted by expiry asc (expiring-first), nulls last; then by createdAt.
 */
export async function getCandidateDocuments(
  candidateId: string,
  viewer: { role: UserRole },
) {
  const where: Prisma.CandidateDocumentWhereInput = { candidateId };
  if (!canViewSensitiveDocs(viewer)) {
    where.category = { in: ["EDUCATION", "EMPLOYMENT"] };
  }
  const rows = await prisma.candidateDocument.findMany({
    where,
    orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    include: { uploadedBy: { select: { fullName: true } } },
  });
  return rows;
}

export type CandidateDocumentRow = Awaited<
  ReturnType<typeof getCandidateDocuments>
>[number];

/**
 * Documents expiring within `withinDays` days (or already expired). Scoped
 * by viewer role: non-admins can only see EDUCATION + EMPLOYMENT docs (the
 * sensitive ones never surface here for them).
 *
 * Used by the Dashboard "Documents expiring" widget.
 */
export async function getExpiringDocuments(
  viewer: { role: UserRole; id: string },
  opts: { scope: "me" | "org"; withinDays?: number } = { scope: "org" },
) {
  const withinDays = opts.withinDays ?? 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);

  const where: Prisma.CandidateDocumentWhereInput = {
    expiresAt: { not: null, lte: cutoff },
  };
  if (!canViewSensitiveDocs(viewer)) {
    where.category = { in: ["EDUCATION", "EMPLOYMENT"] };
  }
  if (opts.scope === "me") {
    where.candidate = { createdById: viewer.id };
  }

  const rows = await prisma.candidateDocument.findMany({
    where,
    orderBy: { expiresAt: "asc" },
    take: 50,
    include: {
      candidate: { select: { id: true, fullName: true } },
    },
  });
  const now = Date.now();
  return rows.map((d) => ({
    ...d,
    daysUntilExpiry: d.expiresAt
      ? Math.ceil((d.expiresAt.getTime() - now) / 86_400_000)
      : null,
  }));
}

/**
 * Compliance-signal query for the Placement detail page: documents for one
 * candidate that expire within `withinDays` days (or are already expired).
 * Sensitive categories are filtered out for non-admins, matching
 * `getExpiringDocuments`.
 */
export async function getExpiringDocumentsForCandidate(
  candidateId: string,
  viewer: { role: UserRole },
  opts: { withinDays?: number } = {},
) {
  const withinDays = opts.withinDays ?? 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);

  const where: Prisma.CandidateDocumentWhereInput = {
    candidateId,
    expiresAt: { not: null, lte: cutoff },
  };
  if (!canViewSensitiveDocs(viewer)) {
    where.category = { in: ["EDUCATION", "EMPLOYMENT"] };
  }

  const rows = await prisma.candidateDocument.findMany({
    where,
    orderBy: { expiresAt: "asc" },
  });
  const now = Date.now();
  return rows.map((d) => ({
    ...d,
    daysUntilExpiry: d.expiresAt
      ? Math.ceil((d.expiresAt.getTime() - now) / 86_400_000)
      : null,
  }));
}

export function getCandidateForEdit(id: string) {
  return prisma.candidate.findUnique({ where: { id } });
}

/** Lightweight candidate list for select inputs (e.g. the new-submission form),
 *  each with its saved résumés so the submission form can offer a picker.
 *  Only **active** résumés are offered — archived ones can't be picked for a
 *  new submission (existing submissions keep their link via the edit form). */
export function listCandidateOptions() {
  return prisma.candidate.findMany({
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      resumes: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, label: true, driveLink: true },
      },
    },
  });
}


export type CandidateDuplicate = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
};

/** Finds existing candidates that share the given email or phone (spec §12 duplicate rule). */
export async function findCandidateDuplicates(opts: {
  email?: string;
  phone?: string;
  excludeId?: string;
}): Promise<CandidateDuplicate[]> {
  const or: Prisma.CandidateWhereInput[] = [];
  if (opts.email) or.push({ email: { equals: opts.email, mode: "insensitive" } });
  if (opts.phone) or.push({ phone: opts.phone });
  if (or.length === 0) return [];

  return prisma.candidate.findMany({
    where: {
      OR: or,
      ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}),
    },
    select: { id: true, fullName: true, email: true, phone: true },
  });
}
