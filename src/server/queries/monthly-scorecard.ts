import {
  startOfMonth,
  endOfMonth,
  eachWeekOfInterval,
  endOfWeek,
  format,
  max as dateMax,
  min as dateMin,
} from "date-fns";
import { prisma } from "@/server/db";

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
 *  - Closures     — placements whose submission belongs to the recruiter,
 *                   bucketed on the placement `startDate` (the join/closure).
 *  - Backouts     — submissions now in BACKED_OUT, bucketed on `submittedAt`
 *                   so the column reconciles against the Submissions column.
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
  teamLabel: string | null;
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
  teamLabel?: string;
};

export async function getMonthlyScorecard({
  year,
  monthIndex,
  teamLabel,
}: ScorecardParams): Promise<MonthlyScorecard> {
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
    ...(teamLabel ? { teamLabel } : {}),
  };

  const [recruiters, submissions, rounds, placements, vendorHistory] =
    await Promise.all([
      prisma.user.findMany({
        where: { ...recruiterWhere, isActive: true },
        select: { id: true, fullName: true, empId: true, teamLabel: true },
        orderBy: [{ teamLabel: "asc" }, { fullName: "asc" }],
      }),
      // Submissions + Backouts both come from here (one fetch, two metrics).
      prisma.submission.findMany({
        where: {
          submittedAt: { gte: monthStart, lt: nextMonthStart },
          submittedBy: recruiterWhere,
        },
        select: { submittedById: true, submittedAt: true, status: true },
      }),
      prisma.interviewRound.findMany({
        where: {
          scheduledAt: { gte: monthStart, lt: nextMonthStart },
          submission: { submittedBy: recruiterWhere },
        },
        select: {
          scheduledAt: true,
          submission: { select: { submittedById: true } },
        },
      }),
      prisma.placement.findMany({
        where: {
          startDate: { gte: monthStart, lt: nextMonthStart },
          submission: { submittedBy: recruiterWhere },
        },
        select: {
          startDate: true,
          submission: { select: { submittedById: true } },
        },
      }),
      // Every submission ever, COMPANY-WIDE (not filtered by recruiter/team) —
      // needed to find each vendor's *company-first* use. Small dataset, so the
      // full scan is cheap; ordered ascending so the first row per vendor is the
      // earliest submission to it by anyone.
      prisma.submission.findMany({
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
      teamLabel: r.teamLabel,
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
    if (s.status === "BACKED_OUT") bump(s.submittedById, s.submittedAt, "backouts");
  }
  for (const r of rounds) {
    if (r.scheduledAt) bump(r.submission.submittedById, r.scheduledAt, "interviews");
  }
  for (const p of placements) {
    bump(p.submission.submittedById, p.startDate, "closures");
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
