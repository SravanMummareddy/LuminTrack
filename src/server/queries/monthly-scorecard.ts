import {
  startOfMonth,
  endOfMonth,
  eachWeekOfInterval,
  endOfWeek,
  format,
  max as dateMax,
  min as dateMin,
} from "date-fns";
import { getScopedPrisma } from "@/lib/session";
import { SUBMISSION_STATUS_LABEL } from "@/lib/labels";

/**
 * Monthly Performance scorecard (spreadsheet "Monthly Performance" tab).
 *
 * One row per active recruiter, five metrics, bucketed into the calendar weeks
 * of a chosen month plus a per-recruiter Total. All aggregation is done in
 * memory (the team is <10 recruiters and a month's worth of rows is small) and
 * every recruiter is zero-seeded so the grid is dense — mirrors the in-memory
 * roll-ups in `reports.ts` / `recruiters.ts`.
 *
 * Metrics, and what each one is keyed on:
 *  - Submissions  — submissions by the recruiter, bucketed on `submittedAt`.
 *  - Interviews   — interview rounds whose submission belongs to the recruiter,
 *                   bucketed on the round's `scheduledAt`.
 *  - New vendors  — a vendor new to the *whole company*: the first time anyone
 *                   ever submitted to a job with that vendor. Counts once, in the
 *                   week of that company-first submit, credited to whoever made
 *                   it (no credit shows if that person isn't a listed recruiter).
 *  - Closures     — a submission by the recruiter reaching OFFER_ACCEPTED,
 *                   bucketed on the week that status change happened (read from
 *                   the audit log), not on when the candidate was submitted.
 *  - Backouts     — a submission by the recruiter reaching BACKED_OUT, bucketed
 *                   on the week the back-out happened (from the audit log). A
 *                   back-out of a prior-month submission still lands in the
 *                   month it occurred — it is NOT keyed on the submit date.
 *
 * Backouts/Closures read the status-change date from the Activity log, dated by
 * the real-world `eventAt` when the recruiter set one, else `createdAt`.
 */

export const SCORECARD_METRICS = [
  "submissions",
  "interviews",
  "newVendors",
  "closures",
  "backouts",
] as const;

export type ScorecardMetric = (typeof SCORECARD_METRICS)[number];

export const SCORECARD_METRIC_LABEL: Record<ScorecardMetric, string> = {
  submissions: "Submissions",
  interviews: "Interviews",
  newVendors: "New vendors",
  closures: "Closures",
  backouts: "Backouts",
};

type MetricCounts = Record<ScorecardMetric, number>;

const zeroCounts = (): MetricCounts => ({
  submissions: 0,
  interviews: 0,
  newVendors: 0,
  closures: 0,
  backouts: 0,
});

export type ScorecardRow = {
  recruiterId: string;
  recruiterName: string;
  empId: string | null;
  teamId: string | null;
  teamName: string | null;
  /** One MetricCounts per week, index-aligned with `weekLabels`. */
  weeks: MetricCounts[];
  /** Sum of all weeks for this recruiter. */
  total: MetricCounts;
};

export type MonthlyScorecard = {
  year: number;
  monthIndex: number; // 0-based, matches JS Date
  monthLabel: string; // "June 2026"
  weekLabels: string[]; // "Jun 1–7", "Jun 8–14", …
  rows: ScorecardRow[];
};

export type ScorecardParams = {
  year: number;
  monthIndex: number; // 0-based
  teamId?: string;
};

export async function getMonthlyScorecard({
  year,
  monthIndex,
  teamId,
}: ScorecardParams): Promise<MonthlyScorecard> {
  const db = await getScopedPrisma();
  const monthStart = startOfMonth(new Date(year, monthIndex, 1));
  const monthEnd = endOfMonth(monthStart);
  // lt-exclusive upper bound for range queries (avoids the last-ms edge case).
  const nextMonthStart = new Date(year, monthIndex + 1, 1);

  // Mon-start weeks overlapping the month. The first weekStart may precede
  // monthStart (it's the Monday of the week containing the 1st) — fine, every
  // in-month event still lands in exactly one [weekStart, weekEnd] span.
  const weekStarts = eachWeekOfInterval(
    { start: monthStart, end: monthEnd },
    { weekStartsOn: 1 },
  );
  const weeks = weekStarts.map((start) => ({
    start,
    end: endOfWeek(start, { weekStartsOn: 1 }),
  }));
  const weekLabels = weeks.map((w) => {
    const from = dateMax([w.start, monthStart]);
    const to = dateMin([w.end, monthEnd]);
    return `${format(from, "MMM d")}–${format(to, "d")}`;
  });

  const weekIndexFor = (d: Date): number =>
    weeks.findIndex((w) => d >= w.start && d <= w.end);

  // The recruiter filter shared by every per-recruiter aggregation.
  const recruiterWhere = {
    role: "RECRUITER" as const,
    ...(teamId ? { teamId } : {}),
  };

  // Status-change audit rows carry the human status LABEL in `newValue`.
  const BACKED_OUT_LABEL = SUBMISSION_STATUS_LABEL.BACKED_OUT;
  const OFFER_ACCEPTED_LABEL = SUBMISSION_STATUS_LABEL.OFFER_ACCEPTED;

  const [recruiters, submissions, rounds, statusEvents, vendorHistory] =
    await Promise.all([
      db.user.findMany({
        where: { ...recruiterWhere, isActive: true },
        select: {
          id: true,
          fullName: true,
          empId: true,
          team: { select: { id: true, name: true } },
        },
        // nulls-last so "Unassigned" recruiters sort after the named teams.
        orderBy: [{ team: { name: "asc" } }, { fullName: "asc" }],
      }),
      db.submission.findMany({
        where: {
          submittedAt: { gte: monthStart, lt: nextMonthStart },
          submittedBy: recruiterWhere,
        },
        select: { submittedById: true, submittedAt: true },
      }),
      db.interviewRound.findMany({
        where: {
          scheduledAt: { gte: monthStart, lt: nextMonthStart },
          submission: { submittedBy: recruiterWhere },
        },
        select: {
          scheduledAt: true,
          submission: { select: { submittedById: true } },
        },
      }),
      // Backouts + Closures are keyed on WHEN the status change happened, read
      // from the audit log (a change to BACKED_OUT / OFFER_ACCEPTED). Effective
      // date = eventAt when the recruiter set a real-world date, else createdAt;
      // filter on whichever applies so an event lands in the month it occurred.
      db.activity.findMany({
        where: {
          newValue: { in: [BACKED_OUT_LABEL, OFFER_ACCEPTED_LABEL] },
          submission: { is: { submittedBy: recruiterWhere } },
          OR: [
            { eventAt: { gte: monthStart, lt: nextMonthStart } },
            {
              eventAt: null,
              createdAt: { gte: monthStart, lt: nextMonthStart },
            },
          ],
        },
        select: {
          newValue: true,
          eventAt: true,
          createdAt: true,
          submission: { select: { submittedById: true } },
        },
      }),
      // Every submission ever, COMPANY-WIDE (not filtered by recruiter/team) —
      // needed to find each vendor's *company-first* use. Small dataset, so the
      // full scan is cheap; ordered ascending so the first row per vendor is the
      // earliest submission to it by anyone.
      db.submission.findMany({
        select: {
          submittedById: true,
          submittedAt: true,
          job: { select: { vendorId: true } },
        },
        orderBy: { submittedAt: "asc" },
      }),
    ]);

  // Zero-seed one row per recruiter.
  const byRecruiter = new Map<string, ScorecardRow>();
  for (const r of recruiters) {
    byRecruiter.set(r.id, {
      recruiterId: r.id,
      recruiterName: r.fullName,
      empId: r.empId,
      teamId: r.team?.id ?? null,
      teamName: r.team?.name ?? null,
      weeks: weeks.map(zeroCounts),
      total: zeroCounts(),
    });
  }

  const bump = (
    recruiterId: string,
    when: Date,
    metric: ScorecardMetric,
  ) => {
    const row = byRecruiter.get(recruiterId);
    if (!row) return; // recruiter inactive / filtered out
    const wi = weekIndexFor(when);
    if (wi < 0) return; // outside the month's weeks (shouldn't happen)
    row.weeks[wi][metric] += 1;
    row.total[metric] += 1;
  };

  for (const s of submissions) {
    bump(s.submittedById, s.submittedAt, "submissions");
  }
  for (const r of rounds) {
    if (r.scheduledAt) bump(r.submission.submittedById, r.scheduledAt, "interviews");
  }
  // Backouts + Closures, keyed on the status-change date (see the fetch above).
  // bump() drops anything whose effective date falls outside the month's weeks.
  for (const a of statusEvents) {
    const rid = a.submission?.submittedById;
    if (!rid) continue;
    const when = a.eventAt ?? a.createdAt;
    if (a.newValue === BACKED_OUT_LABEL) bump(rid, when, "backouts");
    else if (a.newValue === OFFER_ACCEPTED_LABEL) bump(rid, when, "closures");
  }

  // Company-first use per vendor across all history; if that first-ever submit
  // falls inside this month, credit the recruiter who made it. bump() no-ops
  // when the submitter isn't a listed recruiter (e.g. an admin or another team),
  // so a vendor already "claimed" company-wide never re-counts here.
  const firstSeen = new Set<string>();
  for (const s of vendorHistory) {
    const vendorId = s.job.vendorId;
    if (!vendorId) continue;
    if (firstSeen.has(vendorId)) continue;
    firstSeen.add(vendorId);
    if (s.submittedAt >= monthStart && s.submittedAt < nextMonthStart) {
      bump(s.submittedById, s.submittedAt, "newVendors");
    }
  }

  return {
    year,
    monthIndex,
    monthLabel: format(monthStart, "MMMM yyyy"),
    weekLabels,
    rows: [...byRecruiter.values()],
  };
}
