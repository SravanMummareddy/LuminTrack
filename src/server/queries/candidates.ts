import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { PAGE_SIZE, type DateRange, type SortDir, type SortState } from "@/lib/filters";

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

  if (filters.q) where.fullName = { contains: filters.q, mode: "insensitive" };
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
      c.skills.some((s) => s.toLowerCase().includes(skill)),
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

export function getCandidateForEdit(id: string) {
  return prisma.candidate.findUnique({ where: { id } });
}

/** Lightweight candidate list for select inputs (e.g. the new-submission form),
 *  each with its saved résumés so the submission form can offer a picker. */
export function listCandidateOptions() {
  return prisma.candidate.findMany({
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      resumes: {
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
