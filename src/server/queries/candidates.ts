import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { DateRange } from "@/lib/filters";

export type CandidateListFilters = {
  q?: string;
  skill?: string;
  location?: string;
  workAuthorization?: string;
  currentCompany?: string;
  minExperience?: number;
  createdRange?: DateRange;
};

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
  if (filters.createdRange?.gte || filters.createdRange?.lte)
    where.createdAt = filters.createdRange;

  const candidates = await prisma.candidate.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { submissions: true } } },
  });

  // `skills` is a Postgres text array — Prisma can't do a case-insensitive
  // partial match on array elements, so that filter runs in memory.
  if (filters.skill) {
    const needle = filters.skill.toLowerCase();
    return candidates.filter((c) =>
      c.skills.some((s) => s.toLowerCase().includes(needle)),
    );
  }
  return candidates;
}

export type CandidateListRow = Awaited<ReturnType<typeof listCandidates>>[number];

export function getCandidateDetail(id: string) {
  return prisma.candidate.findUnique({
    where: { id },
    include: {
      createdBy: { select: { fullName: true } },
    },
  });
}

export function getCandidateForEdit(id: string) {
  return prisma.candidate.findUnique({ where: { id } });
}

/** Lightweight candidate list for select inputs (e.g. the new-submission form). */
export function listCandidateOptions() {
  return prisma.candidate.findMany({
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
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
