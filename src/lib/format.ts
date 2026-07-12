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
  const d = new Date(date);
  // Intl.format throws RangeError on an Invalid Date; other formatters guard,
  // so a nullable date routed here would otherwise crash the render.
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

export function formatDateTime(date: Date | string): string {
  return format(new Date(date), "MMM d, yyyy 'at' h:mm a");
}

export function formatTime(date: Date | string): string {
  return format(new Date(date), "h:mm a");
}

/**
 * Human-readable duration derived from a job's projected start + end (replaces
 * the retired free-text `durationLabel`). No start → "—"; start but no end →
 * "Ongoing"; end before start → "—"; otherwise "~N weeks" (under ~6 weeks) or
 * "~N months". Appends " (est.)" when the start date is a recruiter's estimate.
 * Pure + unit-tested.
 */
export function jobDuration(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  estimated = false,
): string {
  if (!start) return "—";
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return "—";
  const est = estimated ? " (est.)" : "";
  if (!end) return `Ongoing${est}`;
  const e = new Date(end);
  if (Number.isNaN(e.getTime())) return `Ongoing${est}`;
  const ms = e.getTime() - s.getTime();
  if (ms < 0) return "—";
  const days = Math.round(ms / 86_400_000);
  if (days < 42) {
    const weeks = Math.max(1, Math.round(days / 7));
    return `~${weeks} week${weeks === 1 ? "" : "s"}${est}`;
  }
  const months = Math.max(1, Math.round(days / 30));
  return `~${months} month${months === 1 ? "" : "s"}${est}`;
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
 *   Job         → JOB-00123       (5-digit padded sequence)
 *   Candidate   → CAND-001        (3-digit padded sequence)
 *   Submission  → SUB-001         (3-digit padded sequence)
 */
export function formatJobDisplayId(job: { seq: number }): string {
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
