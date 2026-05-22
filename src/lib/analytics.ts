import type { Prisma } from "@/generated/prisma/client";
import type { JobStatus, SubmissionStatus } from "@/generated/prisma/enums";
import type { BadgeTone } from "@/lib/labels";
import { JOB_STATUSES, SUBMISSION_STATUSES, OTHER_SOURCE } from "@/lib/labels";
import { parseDateRange, type DateRange } from "@/lib/filters";

/** Hex equivalents of the badge tones, for Recharts (which needs real colours). */
export const TONE_HEX: Record<BadgeTone, string> = {
  slate: "#94a3b8",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  blue: "#3b82f6",
  indigo: "#6366f1",
};

// ─── Open-job aging ──────────────────────────────────────────────────────────

export type AgingBucket = "0-15" | "16-30" | "31-60" | "60+";

export const AGING_BUCKETS: AgingBucket[] = ["0-15", "16-30", "31-60", "60+"];

export const AGING_BUCKET_LABEL: Record<AgingBucket, string> = {
  "0-15": "0–15 days",
  "16-30": "16–30 days",
  "31-60": "31–60 days",
  "60+": "Over 60 days",
};

export const AGING_BUCKET_TONE: Record<AgingBucket, BadgeTone> = {
  "0-15": "green",
  "16-30": "blue",
  "31-60": "amber",
  "60+": "red",
};

/** Whole days between `date` and now (never negative). */
export function daysSince(date: Date | string): number {
  const diff = Date.now() - new Date(date).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function agingBucket(days: number): AgingBucket {
  if (days <= 15) return "0-15";
  if (days <= 30) return "16-30";
  if (days <= 60) return "31-60";
  return "60+";
}

// ─── Shared analytics filters ────────────────────────────────────────────────

/**
 * The filter set shared by the Dashboard, Reports, and Recruiters pages.
 * The date range applies to a job's `createdAt` and a submission's `submittedAt`.
 */
export type AnalyticsFilters = {
  dateRange?: DateRange;
  recruiterId?: string;
  sisterCompanySourceId?: string;
  clientId?: string;
  vendorId?: string;
  jobStatus?: JobStatus;
  submissionStatus?: SubmissionStatus;
};

function hasRange(range?: DateRange): boolean {
  return Boolean(range && (range.gte || range.lte));
}

/** Builds a Prisma `where` for jobs from the shared analytics filters. */
export function buildJobWhere(f: AnalyticsFilters): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = {};
  if (hasRange(f.dateRange)) where.createdAt = f.dateRange;
  if (f.jobStatus) where.status = f.jobStatus;
  if (f.clientId) where.clientId = f.clientId;
  if (f.vendorId) where.vendorId = f.vendorId;
  if (f.sisterCompanySourceId)
    where.sisterCompanySourceId =
      f.sisterCompanySourceId === OTHER_SOURCE ? null : f.sisterCompanySourceId;
  if (f.recruiterId)
    where.assignments = { some: { recruiterId: f.recruiterId } };
  return where;
}

/** Builds a Prisma `where` for submissions from the shared analytics filters. */
export function buildSubmissionWhere(
  f: AnalyticsFilters,
): Prisma.SubmissionWhereInput {
  const where: Prisma.SubmissionWhereInput = {};
  if (hasRange(f.dateRange)) where.submittedAt = f.dateRange;
  if (f.submissionStatus) where.status = f.submissionStatus;
  if (f.recruiterId) where.submittedById = f.recruiterId;

  const job: Prisma.JobWhereInput = {};
  if (f.clientId) job.clientId = f.clientId;
  if (f.vendorId) job.vendorId = f.vendorId;
  if (f.sisterCompanySourceId)
    job.sisterCompanySourceId =
      f.sisterCompanySourceId === OTHER_SOURCE ? null : f.sisterCompanySourceId;
  if (f.jobStatus) job.status = f.jobStatus;
  if (Object.keys(job).length) where.job = job;

  return where;
}

// ─── Search-param parsing ────────────────────────────────────────────────────

export type RawSearchParams = { [key: string]: string | string[] | undefined };

/** The first non-empty value for a param (search params can repeat). */
export function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : undefined;
}

/** The raw filter values, kept as strings to re-populate the filter form. */
export type AnalyticsParamState = {
  preset?: string;
  from?: string;
  to?: string;
  recruiterId?: string;
  clientId?: string;
  vendorId?: string;
  sisterCompanySourceId?: string;
  jobStatus?: string;
  submissionStatus?: string;
};

/**
 * Turns a page's raw search params into both the form state (for re-rendering
 * the filter bar) and the typed `AnalyticsFilters` (for the queries).
 */
export function parseAnalyticsParams(sp: RawSearchParams): {
  current: AnalyticsParamState;
  filters: AnalyticsFilters;
  hasFilters: boolean;
} {
  const current: AnalyticsParamState = {
    preset: firstParam(sp.preset),
    from: firstParam(sp.from),
    to: firstParam(sp.to),
    recruiterId: firstParam(sp.recruiterId),
    clientId: firstParam(sp.clientId),
    vendorId: firstParam(sp.vendorId),
    sisterCompanySourceId: firstParam(sp.sisterCompanySourceId),
    jobStatus: firstParam(sp.jobStatus),
    submissionStatus: firstParam(sp.submissionStatus),
  };

  const jobStatus = (JOB_STATUSES as string[]).includes(current.jobStatus ?? "")
    ? (current.jobStatus as JobStatus)
    : undefined;
  const submissionStatus = (SUBMISSION_STATUSES as string[]).includes(
    current.submissionStatus ?? "",
  )
    ? (current.submissionStatus as SubmissionStatus)
    : undefined;

  const filters: AnalyticsFilters = {
    dateRange: parseDateRange({
      preset: current.preset,
      from: current.from,
      to: current.to,
    }),
    recruiterId: current.recruiterId,
    clientId: current.clientId,
    vendorId: current.vendorId,
    sisterCompanySourceId: current.sisterCompanySourceId,
    jobStatus,
    submissionStatus,
  };

  const hasFilters = Boolean(
    (current.preset && current.preset !== "all") ||
      current.recruiterId ||
      current.clientId ||
      current.vendorId ||
      current.sisterCompanySourceId ||
      jobStatus ||
      submissionStatus,
  );

  return { current, filters, hasFilters };
}
