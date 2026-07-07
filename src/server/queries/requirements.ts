import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import type { RequirementStatus } from "@/generated/prisma/enums";
import { PAGE_SIZE, searchTerms, type SortDir, type SortState } from "@/lib/filters";

export type VendorRequirementFilters = {
  q?: string;
  status?: RequirementStatus;
  clientId?: string[];
  vendorId?: string[];
  recruiterId?: string[];
  jobId?: string;
  sort?: SortState;
  page?: number;
};

const REQUIREMENT_SORTS: Record<
  string,
  (d: SortDir) => Prisma.VendorRequirementOrderByWithRelationInput
> = {
  created: (d) => ({ createdAt: d }),
  candidate: (d) => ({ candidate: { fullName: d } }),
  job: (d) => ({ job: { title: d } }),
  status: (d) => ({ status: d }),
};

export const REQUIREMENT_SORT_KEYS = Object.keys(REQUIREMENT_SORTS);
export const REQUIREMENT_DEFAULT_SORT: SortState = { key: "created", dir: "desc" };

const REQUIREMENT_INCLUDE = {
  job: {
    select: {
      id: true,
      seq: true,
      portalRefId: true,
      title: true,
      status: true,
      location: true,
      client: { select: { name: true } },
      vendor: { select: { name: true } },
    },
  },
  // Company is derived from the candidate's current employer (owner's model).
  candidate: {
    select: {
      id: true,
      seq: true,
      fullName: true,
      currentCompany: true,
      email: true,
      phone: true,
      status: true,
    },
  },
  recruiter: { select: { id: true, fullName: true } },
} satisfies Prisma.VendorRequirementInclude;

// Decimal → number across the RSC→Client boundary.
function flatten<
  T extends {
    payRate: Prisma.Decimal | null;
    billRate: Prisma.Decimal | null;
    clientRate?: Prisma.Decimal | null;
  },
>(r: T) {
  return {
    ...r,
    payRate: r.payRate === null ? null : Number(r.payRate),
    billRate: r.billRate === null ? null : Number(r.billRate),
    clientRate: r.clientRate == null ? null : Number(r.clientRate),
  };
}

export async function listVendorRequirements(filters: VendorRequirementFilters) {
  const where: Prisma.VendorRequirementWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.recruiterId?.length)
    where.recruiterId = { in: filters.recruiterId };
  if (filters.jobId) where.jobId = filters.jobId;

  const jobWhere: Prisma.JobWhereInput = {};
  if (filters.clientId?.length) jobWhere.clientId = { in: filters.clientId };
  if (filters.vendorId?.length) jobWhere.vendorId = { in: filters.vendorId };
  if (Object.keys(jobWhere).length) where.job = jobWhere;

  const terms = searchTerms(filters.q);
  if (terms.length)
    where.AND = terms.map((t) => ({
      OR: [
        { job: { title: { contains: t, mode: "insensitive" } } },
        { candidate: { fullName: { contains: t, mode: "insensitive" } } },
        { vendorRecruiterName: { contains: t, mode: "insensitive" } },
      ],
    }));

  const sort = filters.sort ?? REQUIREMENT_DEFAULT_SORT;
  const sortFn = REQUIREMENT_SORTS[sort.key] ?? REQUIREMENT_SORTS.created;
  const orderBy: Prisma.VendorRequirementOrderByWithRelationInput[] = [
    sortFn(sort.dir),
    { id: "asc" },
  ];

  const total = await prisma.vendorRequirement.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);

  const rows = await prisma.vendorRequirement.findMany({
    where,
    orderBy,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: REQUIREMENT_INCLUDE,
  });

  return { rows: rows.map(flatten), total, page };
}

export type VendorRequirementRow = Awaited<
  ReturnType<typeof listVendorRequirements>
>["rows"][number];

/** All requirements for one job — compact rows for the job-detail sub-section.
 *  No pagination (a job rarely has more than a handful). OPEN first. */
export async function getRequirementsForJob(jobId: string) {
  const rows = await prisma.vendorRequirement.findMany({
    where: { jobId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      seq: true,
      status: true,
      payRate: true,
      billRate: true,
      engagement: true,
      candidate: { select: { fullName: true } },
      recruiter: { select: { fullName: true } },
    },
  });
  return rows.map((r) => ({
    ...r,
    payRate: r.payRate === null ? null : Number(r.payRate),
    billRate: r.billRate === null ? null : Number(r.billRate),
  }));
}

export type JobRequirementRow = Awaited<
  ReturnType<typeof getRequirementsForJob>
>[number];

/**
 * The job's most-recent OPEN requirement, shaped as editable prefill for a
 * direct "submit a candidate against this job" (so that path carries the same
 * commercial terms as the convert-from-requirement path instead of starting
 * blank). Returns null when the job has no OPEN requirement.
 */
export async function getOpenRequirementPrefill(jobId: string) {
  const r = await prisma.vendorRequirement.findFirst({
    where: { jobId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
    select: {
      seq: true,
      payRate: true,
      billRate: true,
      clientRate: true,
      engagement: true,
      vendorRecruiterName: true,
      teamLead: true,
      jobDuties: true,
      submissionNotes: true,
    },
  });
  if (!r) return null;
  return {
    seq: r.seq,
    payRate: r.payRate == null ? "" : String(r.payRate),
    billRate: r.billRate == null ? "" : String(r.billRate),
    clientRate: r.clientRate == null ? "" : String(r.clientRate),
    engagement: r.engagement ?? "",
    vendorRecruiterName: r.vendorRecruiterName ?? "",
    teamLead: r.teamLead ?? "",
    jobDuties: r.jobDuties ?? "",
    submissionNotes: r.submissionNotes ?? "",
  };
}

export async function getVendorRequirement(id: string) {
  const row = await prisma.vendorRequirement.findUnique({
    where: { id },
    include: {
      ...REQUIREMENT_INCLUDE,
      createdBy: { select: { fullName: true } },
      convertedBy: { select: { fullName: true } },
      // Every submission made against this requirement (newest first) — a VPR
      // is 1:many now, so the detail page lists them all.
      submissions: {
        orderBy: { submittedAt: "desc" },
        select: {
          id: true,
          seq: true,
          status: true,
          submittedAt: true,
          candidate: { select: { id: true, fullName: true } },
          submittedBy: { select: { fullName: true } },
        },
      },
    },
  });
  return row ? flatten(row) : null;
}
