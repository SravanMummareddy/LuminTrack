import { format } from "date-fns";

export function formatDate(date: Date | string): string {
  return format(new Date(date), "MMM d, yyyy");
}

export function formatDateTime(date: Date | string): string {
  return format(new Date(date), "MMM d, yyyy 'at' h:mm a");
}

/** Formats a numeric rate (Prisma Decimal, number, or string) as USD per hour. */
export function formatRate(
  value: { toString(): string } | number | string | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value.toString());
  if (Number.isNaN(n)) return "—";
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
