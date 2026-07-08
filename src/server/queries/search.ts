import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { SearchResult } from "@/lib/search-types";

/**
 * Global typeahead search across candidates, jobs, clients, vendors, sister
 * company sources, and recruiters (spec §10). Org entities have no detail page,
 * so they link to the jobs list pre-filtered by that entity.
 */
export async function globalSearch(q: string): Promise<SearchResult[]> {
  const like = { contains: q, mode: "insensitive" as const };

  // Pull a seq number out of "CAND-001", "JOB-00123", or a bare number so
  // typing a display ID finds its row.
  const trimmed = q.trim();
  const numericPart = trimmed.replace(/^[A-Za-z]+-?/, "");
  const parsedSeq = /^\d+$/.test(numericPart) ? Number(numericPart) : null;
  const upper = trimmed.toUpperCase();
  const candSeq = upper.startsWith("CAND") || /^\d+$/.test(trimmed) ? parsedSeq : null;
  const jobSeq = upper.startsWith("JOB") || /^\d+$/.test(trimmed) ? parsedSeq : null;

  const candidateOR: Prisma.CandidateWhereInput["OR"] = [
    { fullName: like },
    { email: like },
    { currentCompany: like },
    { currentLocation: like },
    { skills: { has: q } },
  ];
  if (candSeq != null) candidateOR.push({ seq: candSeq });

  const jobOR: Prisma.JobWhereInput["OR"] = [
    { title: like },
    { location: like },
    { portalRefId: like },
  ];
  if (jobSeq != null) jobOR.push({ seq: jobSeq });

  const [candidates, jobs, clients, vendors, sources, users] =
    await Promise.all([
      prisma.candidate.findMany({
        where: { deletedAt: null, OR: candidateOR },
        take: 6,
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true, currentCompany: true },
      }),
      prisma.job.findMany({
        where: { deletedAt: null, OR: jobOR },
        take: 6,
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, client: { select: { name: true } } },
      }),
      prisma.client.findMany({
        where: { OR: [{ name: like }, { location: like }] },
        take: 4,
        orderBy: { name: "asc" },
        select: { id: true, name: true, location: true },
      }),
      prisma.vendor.findMany({
        where: { name: like },
        take: 4,
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.sisterCompanySource.findMany({
        where: { name: like },
        take: 4,
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.user.findMany({
        where: { isActive: true, OR: [{ fullName: like }, { email: like }] },
        take: 4,
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true, email: true },
      }),
    ]);

  return [
    ...candidates.map((c): SearchResult => ({
      type: "candidate",
      label: c.fullName,
      sublabel: c.currentCompany ?? undefined,
      href: `/candidates/${c.id}`,
    })),
    ...jobs.map((j): SearchResult => ({
      type: "job",
      label: j.title,
      sublabel: j.client.name,
      href: `/jobs/${j.id}`,
    })),
    ...clients.map((c): SearchResult => ({
      type: "client",
      label: c.name,
      sublabel: c.location ?? undefined,
      href: `/jobs?clientId=${c.id}`,
    })),
    ...vendors.map((v): SearchResult => ({
      type: "vendor",
      label: v.name,
      href: `/jobs?vendorId=${v.id}`,
    })),
    ...sources.map((s): SearchResult => ({
      type: "source",
      label: s.name,
      href: `/jobs?sisterCompanySourceId=${s.id}`,
    })),
    ...users.map((u): SearchResult => ({
      type: "recruiter",
      label: u.fullName,
      sublabel: u.email,
      href: `/recruiters/${u.id}`,
    })),
  ];
}
