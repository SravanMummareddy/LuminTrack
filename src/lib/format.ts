import { format } from "date-fns";

// Date-only display is rendered in a fixed zone (UTC) so a Server Component
// (UTC) and a Client Component (the viewer's zone) produce identical text —
// otherwise a near-midnight date differs by a day and React throws hydration
// mismatch #418 in the list tables. Time-of-day helpers below stay local,
// where the exact wall-clock time matters (interviews, activity timeline).
const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatDate(date: Date | string): string {
  return DATE_FMT.format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return format(new Date(date), "MMM d, yyyy 'at' h:mm a");
}

export function formatTime(date: Date | string): string {
  return format(new Date(date), "h:mm a");
}

/**
 * Suffix marking a removed entity in history/reference lists. A candidate or job
 * that has been trashed or permanently erased keeps its real name (owner
 * decision); wherever that name still appears against a submission/placement/etc.
 * we append " (deleted)" so recruiters can read the history and see it's gone.
 * Returns "" for live records.
 */
export function deletedSuffix(entity: {
  deletedAt?: Date | string | null;
  erasedAt?: Date | string | null;
}): string {
  return entity.deletedAt || entity.erasedAt ? " (deleted)" : "";
}

/** Formats a numeric rate (Prisma Decimal, number, or string) as USD per hour. */
export function formatRate(
  value: { toString(): string } | number | string | null | undefined,
  emptyLabel = "—",
): string {
  if (value === null || value === undefined || value === "") return emptyLabel;
  const n = typeof value === "number" ? value : Number(value.toString());
  if (Number.isNaN(n)) return emptyLabel;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}/hr`;
}

/**
 * Display-ID helpers. The `id` field (cuid) stays the FK source-of-truth;
 * these strings are for humans (URLs still use the cuid).
 *
 *   Manual job  → JOB-00123       (5-digit padded sequence)
 *   iLabor job  → REQ-159263      (real iLabor portalRefId, no padding)
 *   Candidate   → CAND-001        (3-digit padded sequence)
 *   Submission  → SUB-001         (3-digit padded sequence)
 */
export function formatJobDisplayId(job: {
  seq: number;
  portalRefId?: string | null;
}): string {
  if (job.portalRefId) return `REQ-${job.portalRefId}`;
  return `JOB-${String(job.seq).padStart(5, "0")}`;
}

export function formatCandidateDisplayId(c: { seq: number }): string {
  return `CAND-${String(c.seq).padStart(3, "0")}`;
}

export function formatSubmissionDisplayId(s: { seq: number }): string {
  return `SUB-${String(s.seq).padStart(3, "0")}`;
}

export function formatPlacementDisplayId(p: { seq: number }): string {
  return `PLC-${String(p.seq).padStart(3, "0")}`;
}

export function formatBenchConsultantDisplayId(c: { seq: number }): string {
  return `BC-${String(c.seq).padStart(3, "0")}`;
}

export function formatVendorRequirementDisplayId(r: { seq: number }): string {
  return `VPR-${String(r.seq).padStart(3, "0")}`;
}

/** Formats a years-of-experience value (Prisma Decimal or number). */
export function formatExperience(
  value: { toString(): string } | number | null | undefined,
): string {
  if (value === null || value === undefined) return "—";
  return `${value.toString()} yrs`;
}
