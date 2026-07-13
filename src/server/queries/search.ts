import { getScopedPrisma } from "@/lib/session";
import type { Prisma } from "@/generated/prisma/client";
import type { SearchResult } from "@/lib/search-types";
import {
  formatSubmissionDisplayId,
  formatPlacementDisplayId,
  formatVendorRequirementDisplayId,
} from "@/lib/format";

/**
 * Global typeahead search across candidates, jobs, clients, vendors, sister
 * company sources, and recruiters (spec §10). Org entities have no detail page,
 * so they link to the jobs list pre-filtered by that entity.
 */
export async function globalSearch(q: string): Promise<SearchResult[]> {
  const db = await getScopedPrisma();
  const like = { contains: q, mode: "insensitive" as const };

  // Pull a seq number out of a display ID ("CAND-001", "JOB-00123", "VPR-007",
  // "SUB-042", "PLC-003") or a bare number so typing a display ID finds its row.
  // A bare number matches every entity type's seq; a prefixed one only its own.
  const trimmed = q.trim();
  const numericPart = trimmed.replace(/^[A-Za-z]+-?/, "");
  // `seq` is a Postgres Int (32-bit) — a value past its max makes Prisma throw,
  // 500-ing the typeahead on a long number. Bound it so anything too big just
  // matches no row (which it would anyway).
  const rawSeq = /^\d+$/.test(numericPart) ? Number(numericPart) : null;
  const parsedSeq = rawSeq != null && rawSeq <= 2_147_483_647 ? rawSeq : null;
  const upper = trimmed.toUpperCase();
  const bare = /^\d+$/.test(trimmed);
  const seqFor = (prefix: string) =>
    upper.startsWith(prefix) || bare ? parsedSeq : null;
  const candSeq = seqFor("CAND");
  const jobSeq = seqFor("JOB");
  const vprSeq = seqFor("VPR");
  const subSeq = seqFor("SUB");
  const plcSeq = seqFor("PLC");

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
  ];
  if (jobSeq != null) jobOR.push({ seq: jobSeq });

  // VPR/SUB/PLC have no free-text fields worth searching — they're only ever
  // found by their display ID, so query them solely when a seq was parsed.
  const [
    candidates,
    jobs,
    requirements,
    submissions,
    placements,
    clients,
    vendors,
    sources,
    users,
  ] = await Promise.all([
      db.candidate.findMany({
        where: { deletedAt: null, OR: candidateOR },
        take: 6,
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true, currentCompany: true },
      }),
      db.job.findMany({
        where: { deletedAt: null, OR: jobOR },
        take: 6,
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, client: { select: { name: true } } },
      }),
      vprSeq == null
        ? []
        : db.vendorRequirement.findMany({
            where: { seq: vprSeq },
            take: 4,
            select: { id: true, seq: true, job: { select: { title: true } } },
          }),
      subSeq == null
        ? []
        : db.submission.findMany({
            where: { seq: subSeq },
            take: 4,
            select: {
              id: true,
              seq: true,
              candidate: { select: { fullName: true } },
              job: { select: { title: true } },
            },
          }),
      plcSeq == null
        ? []
        : db.placement.findMany({
            where: { seq: plcSeq },
            take: 4,
            select: {
              id: true,
              seq: true,
              candidate: { select: { fullName: true } },
              job: { select: { title: true } },
            },
          }),
      db.client.findMany({
        // isActive: true — don't surface retired entities in typeahead (matches
        // the users query below).
        where: { isActive: true, OR: [{ name: like }, { location: like }] },
        take: 4,
        orderBy: { name: "asc" },
        select: { id: true, name: true, location: true },
      }),
      db.vendor.findMany({
        where: { isActive: true, name: like },
        take: 4,
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      db.sisterCompanySource.findMany({
        where: { isActive: true, name: like },
        take: 4,
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      db.user.findMany({
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
    ...requirements.map((r): SearchResult => ({
      type: "requirement",
      label: formatVendorRequirementDisplayId(r),
      sublabel: r.job.title,
      href: `/vendor-portal/${r.id}`,
    })),
    ...submissions.map((s): SearchResult => ({
      type: "submission",
      label: formatSubmissionDisplayId(s),
      sublabel: `${s.candidate.fullName} → ${s.job.title}`,
      href: `/submissions/${s.id}`,
    })),
    ...placements.map((p): SearchResult => ({
      type: "placement",
      label: formatPlacementDisplayId(p),
      sublabel: `${p.candidate.fullName} → ${p.job.title}`,
      href: `/placements/${p.id}`,
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
