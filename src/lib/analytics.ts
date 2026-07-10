import type { Prisma } from "@/generated/prisma/client";
import type {
  JobStatus,
  SubmissionStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { JOB_STATUSES, SUBMISSION_STATUSES, OTHER_SOURCE } from "@/lib/labels";
import { parseDateRange, parseList, type DateRange } from "@/lib/filters";

/**
 * The roles that count as "performers" in recruiter analytics. Managers and
 * team leads submit alongside recruiters, so they belong in the recruiter
 * breakdown; ADMIN is excluded (support/ops, not a submitter to be ranked).
 * Single source of truth so the Recruiters page, Reports, and Dashboard all
 * report the same recruiter universe.
 */
export const PERFORMANCE_ROLES: UserRole[] = [
  "MANAGER",
  "TEAM_LEAD",
  "RECRUITER",
];

// ─── Open-job aging ──────────────────────────────────────────────────────────

export type AgingBucket = "0-15" | "16-30" | "31-60" | "60+";

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

// ─── Submission stage age ────────────────────────────────────────────────────

/**
 * The audited actions `changeSubmissionStatus` emits for a status transition.
 * Milestone statuses get their own action name but carry the same
 * oldValue/newValue labels, so a stage walk treats them uniformly. Shared by
 * Reports (time-in-stage) and the Submissions list (days-in-stage column) so
 * the two stay in lockstep.
 */
export const STATUS_TRANSITION_ACTIONS = [
  "SUBMISSION_STATUS_CHANGED",
  "CANDIDATE_SELECTED",
  "CANDIDATE_REJECTED",
  "OFFER_RELEASED",
  "OFFER_ACCEPTED",
  "CANDIDATE_JOINED",
] as const;

/**
 * Early-pipeline, non-terminal statuses where a submission sitting too long is
 * "stale" and needs a nudge. Shared by Reports §F3 (recruiter aging) and the
 * Submissions "Mine, stale >7d" quick filter.
 */
export const STALE_SUBMISSION_STATUSES: SubmissionStatus[] = [
  "SUBMITTED",
  "RESUME_PICKED",
  "VENDOR_SCREENING_CALL",
  "CLIENT_INTERVIEW",
];

/** Days a submission may sit in its current stale-eligible stage before the
 *  Submissions list flags it (amber) and the "Mine, stale >7d" filter matches. */
export const STALE_STAGE_DAYS = 7;

/**
 * Whole days the submission has sat in its *current* status. The latest
 * status-transition activity marks when it entered the current stage; with no
 * transitions yet it's been in SUBMITTED since `submittedAt`. `eventAt` (the
 * user-supplied "when this actually happened") wins over `createdAt`.
 */
export function currentStageDays(
  submittedAt: Date,
  transitions: { eventAt: Date | null; createdAt: Date }[],
): number {
  let enteredAt = submittedAt;
  for (const t of transitions) {
    const at = t.eventAt ?? t.createdAt;
    if (at.getTime() > enteredAt.getTime()) enteredAt = at;
  }
  return daysSince(enteredAt);
}

// ─── Shared analytics filters ────────────────────────────────────────────────

/**
 * The filter set shared by the Dashboard, Reports, and Recruiters pages.
 * The date range applies to a job's `createdAt` and a submission's `submittedAt`.
 */
export type AnalyticsFilters = {
  dateRange?: DateRange;
  recruiterId?: string[];
  sisterCompanySourceId?: string;
  clientId?: string[];
  vendorId?: string[];
  jobStatus?: JobStatus;
  submissionStatus?: SubmissionStatus;
};

function hasRange(range?: DateRange): boolean {
  return Boolean(range && (range.gte || range.lte));
}

/** Builds a Prisma `where` for jobs from the shared analytics filters. */
export function buildJobWhere(f: AnalyticsFilters): Prisma.JobWhereInput {
  // Trashed jobs + erased tombstones never count toward analytics/dashboard.
  const where: Prisma.JobWhereInput = { deletedAt: null };
  if (hasRange(f.dateRange)) where.createdAt = f.dateRange;
  if (f.jobStatus) where.status = f.jobStatus;
  if (f.clientId?.length) where.clientId = { in: f.clientId };
  if (f.vendorId?.length) where.vendorId = { in: f.vendorId };
  if (f.sisterCompanySourceId)
    where.sisterCompanySourceId =
      f.sisterCompanySourceId === OTHER_SOURCE ? null : f.sisterCompanySourceId;
  if (f.recruiterId?.length)
    where.assignments = { some: { recruiterId: { in: f.recruiterId } } };
  return where;
}

/** Builds a Prisma `where` for submissions from the shared analytics filters. */
export function buildSubmissionWhere(
  f: AnalyticsFilters,
): Prisma.SubmissionWhereInput {
  const where: Prisma.SubmissionWhereInput = {};
  if (hasRange(f.dateRange)) where.submittedAt = f.dateRange;
  if (f.submissionStatus) where.status = f.submissionStatus;
  if (f.recruiterId?.length) where.submittedById = { in: f.recruiterId };

  const job: Prisma.JobWhereInput = {};
  if (f.clientId?.length) job.clientId = { in: f.clientId };
  if (f.vendorId?.length) job.vendorId = { in: f.vendorId };
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
  /** "me" focuses the dashboard on the acting user; "org" is org-wide. */
  scope?: "me" | "org";
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
  const rawScope = firstParam(sp.scope);
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
    scope: rawScope === "me" || rawScope === "org" ? rawScope : undefined,
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
    recruiterId: parseList(sp.recruiterId),
    clientId: parseList(sp.clientId),
    vendorId: parseList(sp.vendorId),
    sisterCompanySourceId: current.sisterCompanySourceId,
    jobStatus,
    submissionStatus,
  };

  const hasFilters = Boolean(
    (current.preset && current.preset !== "all") ||
      filters.recruiterId ||
      filters.clientId ||
      filters.vendorId ||
      current.sisterCompanySourceId ||
      jobStatus ||
      submissionStatus,
  );

  return { current, filters, hasFilters };
}
