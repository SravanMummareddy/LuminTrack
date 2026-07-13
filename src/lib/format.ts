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
/**
 * D3/V-5: whole days from when a requirement was *received* to its first
 * submission. Measured from `receivedAt` (not the logged `createdAt`) so the
 * turnaround reflects the real clock. Returns null when there's no submission
 * yet. Clamped at 0 — a résumé logged before the job existed (owner's edge case)
 * would otherwise read negative. Pure, so it's unit-testable apart from the UI.
 */
export function daysToFirstSubmission(
  receivedAt: Date | string | null | undefined,
  firstSubmittedAt: Date | string | null | undefined,
): number | null {
  if (!receivedAt || !firstSubmittedAt) return null;
  const r = new Date(receivedAt);
  const f = new Date(firstSubmittedAt);
  if (Number.isNaN(r.getTime()) || Number.isNaN(f.getTime())) return null;
  const days = Math.round((f.getTime() - r.getTime()) / 86_400_000);
  return Math.max(0, days);
}

/**
 * V-5 rollup: the average days-to-first-submission across a set of submissions,
 * to one decimal, or null when there's nothing to average. Groups by `jobId` and
 * uses each job's **earliest** submission (from the rows given) — so passing all
 * submissions yields the team average, and passing one recruiter's submissions
 * yields their average (each job credited with *their* first submission on it,
 * per the "every submitter counts" attribution). Pure/unit-tested.
 */
export function avgDaysToFirstSubmission(
  subs: {
    jobId: string;
    receivedAt: Date | string;
    submittedAt: Date | string;
  }[],
): number | null {
  const earliest = new Map<string, { receivedAt: Date | string; submittedAt: Date | string }>();
  for (const s of subs) {
    const cur = earliest.get(s.jobId);
    if (!cur || new Date(s.submittedAt) < new Date(cur.submittedAt))
      earliest.set(s.jobId, { receivedAt: s.receivedAt, submittedAt: s.submittedAt });
  }
  const days = [...earliest.values()]
    .map((e) => daysToFirstSubmission(e.receivedAt, e.submittedAt))
    .filter((d): d is number => d != null);
  if (!days.length) return null;
  return Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10;
}

/** Label for `daysToFirstSubmission`: "—" (no submission), "Same day", or "N days". */
export function timeToFirstSubmissionLabel(
  receivedAt: Date | string | null | undefined,
  firstSubmittedAt: Date | string | null | undefined,
): string {
  const d = daysToFirstSubmission(receivedAt, firstSubmittedAt);
  if (d == null) return "—";
  if (d === 0) return "Same day";
  return `${d} day${d === 1 ? "" : "s"}`;
}

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

// Org-entity display IDs (Settings records with their own detail pages).
export function formatClientDisplayId(c: { seq: number }): string {
  return `CLI-${String(c.seq).padStart(3, "0")}`;
}
export function formatVendorDisplayId(v: { seq: number }): string {
  return `VEN-${String(v.seq).padStart(3, "0")}`;
}
export function formatSourceDisplayId(s: { seq: number }): string {
  return `SRC-${String(s.seq).padStart(3, "0")}`;
}
export function formatReferrerDisplayId(r: { seq: number }): string {
  return `REF-${String(r.seq).padStart(3, "0")}`;
}

// WS4 — admin-entity display IDs (Users / Teams / Roles / Organizations / Glossary).
export function formatUserDisplayId(u: { seq: number }): string {
  return `USR-${String(u.seq).padStart(3, "0")}`;
}
export function formatTeamDisplayId(t: { seq: number }): string {
  return `TEAM-${String(t.seq).padStart(3, "0")}`;
}
export function formatRoleDisplayId(r: { seq: number }): string {
  return `ROLE-${String(r.seq).padStart(3, "0")}`;
}
export function formatOrganizationDisplayId(o: { seq: number }): string {
  return `ORG-${String(o.seq).padStart(3, "0")}`;
}
export function formatGlossaryDisplayId(g: { seq: number }): string {
  return `GLO-${String(g.seq).padStart(3, "0")}`;
}

/** Formats a years-of-experience value (Prisma Decimal or number). */
export function formatExperience(
  value: { toString(): string } | number | null | undefined,
): string {
  if (value === null || value === undefined) return "—";
  return `${value.toString()} yrs`;
}

/** Splits a single full name into first/last for surfaces that only capture a
 *  combined name (e.g. the bench form) but write to the Candidate model, which
 *  requires both parts (fullName is derived from them). First token → firstName,
 *  remainder → lastName; a single word puts everything in firstName. Matches the
 *  name-split migration backfill. */
export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = fullName.trim();
  const sp = trimmed.indexOf(" ");
  if (sp === -1) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, sp),
    lastName: trimmed.slice(sp + 1).trim(),
  };
}
