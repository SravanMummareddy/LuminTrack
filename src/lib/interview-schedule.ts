import type { InterviewResult } from "@/generated/prisma/enums";

/**
 * Buckets interview rounds for the Interviews → Schedule view: an agenda grouped
 * by time + outcome instead of a flat table. Pure + unit-tested; the page loads
 * the rows and passes a single `now`, so bucket assignment is deterministic and
 * hydration-safe (computed once on the server, rendered static).
 *
 * Two axes decide a round's bucket: its `result` and its `scheduledAt`.
 *  - A round that's no longer waiting on THIS round's outcome (selected /
 *    rejected / completed / need-another-round / on-hold) is **Completed**,
 *    regardless of date.
 *  - A still-WAITING round is placed on the timeline: a past date is
 *    **Awaiting outcome** (the actionable "log the result" group), else Today /
 *    This week / Upcoming.
 */

export type ScheduleBucketKey =
  | "awaiting"
  | "today"
  | "week"
  | "upcoming"
  | "completed";

/** Render order + copy for each bucket. */
export const SCHEDULE_BUCKET_META: {
  key: ScheduleBucketKey;
  label: string;
  hint: string;
}[] = [
  { key: "awaiting", label: "Awaiting outcome", hint: "past date, no result logged" },
  { key: "today", label: "Today", hint: "" },
  { key: "week", label: "This week", hint: "" },
  { key: "upcoming", label: "Upcoming", hint: "" },
  { key: "completed", label: "Completed", hint: "outcome logged" },
];

// A round whose result means THIS round is finished — it drops to Completed even
// if its date is in the future (e.g. an outcome entered ahead of the slot).
const CONCLUDED_RESULTS: ReadonlySet<InterviewResult> = new Set<InterviewResult>(
  ["SELECTED", "REJECTED", "COMPLETED", "NEED_ANOTHER_ROUND", "ON_HOLD"],
);

export function isConcluded(result: InterviewResult): boolean {
  return CONCLUDED_RESULTS.has(result);
}

type SchedulableRound = {
  scheduledAt: Date | string | null;
  result: InterviewResult;
};

const DAY_MS = 86_400_000;

// ponytail: day boundaries are computed in UTC to line up with the UTC date
// labels the app renders (formatDate). Correct for a single-region team; true
// per-user "today" would need the viewer's timezone offset threaded through.
function utcDayStartMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function scheduleBucketOf(
  round: SchedulableRound,
  now: Date,
): ScheduleBucketKey {
  if (isConcluded(round.result)) return "completed";
  // Not concluded == still WAITING on this round's outcome.
  const t = round.scheduledAt ? new Date(round.scheduledAt).getTime() : NaN;
  // Defensive: the query already excludes undated rounds, so this is unreachable
  // in practice — treat a stray null as upcoming rather than dropping it.
  if (Number.isNaN(t)) return "upcoming";
  const todayStart = utcDayStartMs(now);
  if (t < todayStart) return "awaiting";
  if (t < todayStart + DAY_MS) return "today";
  if (t < todayStart + 7 * DAY_MS) return "week";
  return "upcoming";
}

// Future buckets read best soonest-first; past/settled buckets most-recent-first.
const ASC_BUCKETS: ReadonlySet<ScheduleBucketKey> = new Set<ScheduleBucketKey>([
  "today",
  "week",
  "upcoming",
]);

function timeOf(r: SchedulableRound): number {
  return r.scheduledAt ? new Date(r.scheduledAt).getTime() : 0;
}

/**
 * Group `rows` into the five schedule buckets, each sorted for reading order.
 * Returns every bucket in render order (callers skip the empty ones).
 */
export function bucketInterviews<T extends SchedulableRound>(
  rows: T[],
  now: Date,
): { key: ScheduleBucketKey; label: string; hint: string; items: T[] }[] {
  const groups: Record<ScheduleBucketKey, T[]> = {
    awaiting: [],
    today: [],
    week: [],
    upcoming: [],
    completed: [],
  };
  for (const r of rows) groups[scheduleBucketOf(r, now)].push(r);
  return SCHEDULE_BUCKET_META.map((m) => ({
    ...m,
    items: groups[m.key]
      .slice()
      .sort((a, b) =>
        ASC_BUCKETS.has(m.key) ? timeOf(a) - timeOf(b) : timeOf(b) - timeOf(a),
      ),
  }));
}
