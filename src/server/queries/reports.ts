import { prisma } from "@/server/db";
import {
  AGING_BUCKETS,
  agingBucket,
  buildJobWhere,
  buildSubmissionWhere,
  daysSince,
  type AnalyticsFilters,
} from "@/lib/analytics";
import {
  SUBMISSION_STATUSES,
  SUBMISSION_STATUS_LABEL,
  jobSourceLabel,
} from "@/lib/labels";
import type { SubmissionStatus } from "@/generated/prisma/enums";

// §F2 — funnel-velocity stats. Median + p90 over a small sample of days,
// computed in-memory (no library; data volumes are < 10k samples). Both
// return null on an empty array so the UI can render "—".
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank method — matches what most ATS dashboards report.
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[idx];
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(
    0,
    Math.round((to.getTime() - from.getTime()) / 86400_000),
  );
}

// Reverse lookup from a human-readable status label (what gets persisted on
// Activity.oldValue/newValue) back to the enum key. Built once at module
// load — the map never changes.
const LABEL_TO_STATUS = new Map<string, SubmissionStatus>(
  SUBMISSION_STATUSES.map((s) => [SUBMISSION_STATUS_LABEL[s], s]),
);

type DimensionRow = {
  name: string;
  jobs: number;
  submissions: number;
  interviews: number;
  selected: number;
  joined: number;
};

/** Merges job counts and submission outcomes into one per-dimension table. */
function performanceByDimension(
  jobNames: string[],
  submissions: {
    name: string;
    status: SubmissionStatus;
    interviews: number;
  }[],
): DimensionRow[] {
  const map = new Map<string, DimensionRow>();
  const row = (name: string): DimensionRow => {
    let entry = map.get(name);
    if (!entry) {
      entry = { name, jobs: 0, submissions: 0, interviews: 0, selected: 0, joined: 0 };
      map.set(name, entry);
    }
    return entry;
  };

  for (const name of jobNames) row(name).jobs += 1;
  for (const s of submissions) {
    const entry = row(s.name);
    entry.submissions += 1;
    entry.interviews += s.interviews;
    if (s.status === "SELECTED") entry.selected += 1;
    if (s.status === "JOINED") entry.joined += 1;
  }

  return [...map.values()].sort(
    (a, b) => b.submissions - a.submissions || b.jobs - a.jobs,
  );
}

/** Everything the Reports / Analytics page (spec §9.11) renders. */
export async function getReportsData(filters: AnalyticsFilters) {
  const [jobs, submissions, recruiters] = await Promise.all([
    prisma.job.findMany({
      where: buildJobWhere(filters),
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        client: { select: { name: true } },
        vendor: { select: { name: true } },
        sisterCompanySource: { select: { name: true } },
        sourceOther: true,
      },
    }),
    prisma.submission.findMany({
      where: buildSubmissionWhere(filters),
      select: {
        // §F2 — id and submittedAt feed time-to-fill / time-in-stage joins
        // against the Activity audit. job.createdAt anchors time-to-fill.
        id: true,
        submittedAt: true,
        actualJoinDate: true,
        status: true,
        submittedById: true,
        _count: { select: { interviewRounds: true } },
        job: {
          select: {
            createdAt: true,
            client: { select: { name: true } },
            vendor: { select: { name: true } },
            sisterCompanySource: { select: { name: true } },
            sourceOther: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const subRows = submissions.map((s) => ({
    status: s.status,
    interviews: s._count.interviewRounds,
    client: s.job.client.name,
    vendor: s.job.vendor.name,
    source: jobSourceLabel(s.job),
  }));

  const byClient = performanceByDimension(
    jobs.map((j) => j.client.name),
    subRows.map((s) => ({ name: s.client, status: s.status, interviews: s.interviews })),
  );
  const byVendor = performanceByDimension(
    jobs.map((j) => j.vendor.name),
    subRows.map((s) => ({ name: s.vendor, status: s.status, interviews: s.interviews })),
  );
  const bySource = performanceByDimension(
    jobs.map((j) => jobSourceLabel(j)),
    subRows.map((s) => ({ name: s.source, status: s.status, interviews: s.interviews })),
  );

  // Recruiter breakdown.
  const byRecruiter = recruiters
    .map((r) => {
      const own = submissions.filter((s) => s.submittedById === r.id);
      return {
        name: r.fullName,
        submissions: own.length,
        interviews: own.reduce((sum, s) => sum + s._count.interviewRounds, 0),
        selected: own.filter((s) => s.status === "SELECTED").length,
        joined: own.filter((s) => s.status === "JOINED").length,
      };
    })
    .filter((r) => r.submissions > 0)
    .sort((a, b) => b.submissions - a.submissions);

  // Candidate pipeline by stage.
  const pipeline = SUBMISSION_STATUSES.map((status) => ({
    status,
    count: submissions.filter((s) => s.status === status).length,
  }));

  // Conversion rates.
  const interviewed = submissions.filter(
    (s) => s._count.interviewRounds > 0,
  ).length;
  const selectedAfterInterview = submissions.filter(
    (s) =>
      s._count.interviewRounds > 0 &&
      (s.status === "SELECTED" ||
        s.status === "OFFER_RELEASED" ||
        s.status === "JOINED"),
  ).length;
  const conversions = {
    totalSubmissions: submissions.length,
    interviewed,
    selectedAfterInterview,
    submissionToInterview: submissions.length
      ? interviewed / submissions.length
      : 0,
    interviewToSelection: interviewed
      ? selectedAfterInterview / interviewed
      : 0,
  };

  // Open-job aging report — OPEN and ON_HOLD jobs.
  const openJobs = jobs
    .filter((j) => j.status === "OPEN" || j.status === "ON_HOLD")
    .map((j) => {
      const days = daysSince(j.createdAt);
      return {
        id: j.id,
        title: j.title,
        status: j.status,
        client: j.client.name,
        days,
        bucket: agingBucket(days),
      };
    })
    .sort((a, b) => b.days - a.days);

  const agingBuckets = AGING_BUCKETS.map((bucket) => ({
    bucket,
    count: openJobs.filter((j) => j.bucket === bucket).length,
  }));

  // §F3 — recruiter aging: submissions older than 14 days that haven't moved
  // past the early-pipeline stages. Surfaces neglected work the recruiter
  // owns. "Stale" = submittedAt > 14d and status still SUBMITTED /
  // RESUME_PICKED / VENDOR_SCREENING_CALL / CLIENT_INTERVIEW.
  const STALE_DAYS = 14;
  const STALE_STATUSES: SubmissionStatus[] = [
    "SUBMITTED",
    "RESUME_PICKED",
    "VENDOR_SCREENING_CALL",
    "CLIENT_INTERVIEW",
  ];
  const staleSubs = await prisma.submission.findMany({
    where: {
      status: { in: STALE_STATUSES },
      submittedAt: { lt: new Date(Date.now() - STALE_DAYS * 86400_000) },
    },
    select: {
      id: true,
      seq: true,
      status: true,
      submittedAt: true,
      submittedBy: { select: { id: true, fullName: true } },
      candidate: { select: { fullName: true } },
      job: { select: { title: true, client: { select: { name: true } } } },
    },
    orderBy: { submittedAt: "asc" },
    take: 200,
  });
  const recruiterAging = staleSubs.map((s) => ({
    submissionId: s.id,
    seq: s.seq,
    status: s.status,
    submittedAt: s.submittedAt,
    days: daysSince(s.submittedAt),
    recruiter: s.submittedBy.fullName,
    candidate: s.candidate.fullName,
    job: s.job.title,
    client: s.job.client.name,
  }));

  // §F4 — per-client revenue projection: Σ candidateRate × positions × duration
  // over OPEN/ON_HOLD jobs. Duration is computed from startDate→endDate when
  // both are present; otherwise we use a conservative 90-day default so a
  // missing endDate doesn't zero the whole client out. Positions defaults to 1.
  const DEFAULT_DURATION_DAYS = 90;
  const HOURS_PER_DAY = 8;
  const projJobs = await prisma.job.findMany({
    where: {
      status: { in: ["OPEN", "ON_HOLD"] },
      candidateRate: { not: null },
    },
    select: {
      candidateRate: true,
      positions: true,
      startDate: true,
      endDate: true,
      client: { select: { name: true } },
    },
  });
  const revMap = new Map<string, { client: string; jobs: number; projected: number }>();
  for (const j of projJobs) {
    const rate = Number(j.candidateRate ?? 0);
    if (!rate) continue;
    const positions = j.positions && j.positions > 0 ? j.positions : 1;
    const days =
      j.startDate && j.endDate
        ? Math.max(
            1,
            Math.round(
              (j.endDate.getTime() - j.startDate.getTime()) / 86400_000,
            ),
          )
        : DEFAULT_DURATION_DAYS;
    const projected = rate * HOURS_PER_DAY * days * positions;
    const key = j.client.name;
    const entry = revMap.get(key) ?? { client: key, jobs: 0, projected: 0 };
    entry.jobs += 1;
    entry.projected += projected;
    revMap.set(key, entry);
  }
  const clientRevenue = [...revMap.values()].sort(
    (a, b) => b.projected - a.projected,
  );

  // §F2 — funnel velocity. Single pass over the audit table for every
  // SUBMISSION_STATUS_CHANGED row belonging to a submission already in the
  // filtered set. Bounded by `submissionId IN (…)` so the scan is cheap.
  const filteredSubmissionIds = submissions.map((s) => s.id);
  const statusChangeRows = filteredSubmissionIds.length
    ? await prisma.activity.findMany({
        where: {
          action: "SUBMISSION_STATUS_CHANGED",
          submissionId: { in: filteredSubmissionIds },
        },
        select: {
          submissionId: true,
          oldValue: true,
          newValue: true,
          eventAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // Group activity rows by submission. The activity action stores the moment
  // each transition was recorded; eventAt (if the user supplied "when this
  // actually happened") wins over createdAt.
  const rowsBySub = new Map<string, typeof statusChangeRows>();
  for (const row of statusChangeRows) {
    if (!row.submissionId) continue;
    const list = rowsBySub.get(row.submissionId) ?? [];
    list.push(row);
    rowsBySub.set(row.submissionId, list);
  }
  const rowTime = (r: (typeof statusChangeRows)[number]): Date =>
    r.eventAt ?? r.createdAt;

  // ── Time-to-fill: only submissions that actually reached JOINED count.
  type FillSample = { client: string; source: string; days: number };
  const fillSamples: FillSample[] = [];
  const JOINED_LABEL = SUBMISSION_STATUS_LABEL.JOINED;
  for (const s of submissions) {
    if (s.status !== "JOINED") continue;
    const events = rowsBySub.get(s.id) ?? [];
    const joinedEvent = events.find((e) => e.newValue === JOINED_LABEL);
    // Defensive fallback chain — actualJoinDate first (most accurate per
    // §C2), then the JOINED audit row, then nothing.
    const joinedAt: Date | null = s.actualJoinDate ?? (joinedEvent ? rowTime(joinedEvent) : null);
    if (!joinedAt) continue;
    fillSamples.push({
      client: s.job.client.name,
      source: jobSourceLabel(s.job),
      days: daysBetween(s.job.createdAt, joinedAt),
    });
  }

  const buildFillRow = (name: string, samples: number[]) => ({
    name,
    filled: samples.length,
    median: samples.length >= 3 ? median(samples) : null,
    p90: samples.length >= 3 ? percentile(samples, 0.9) : null,
  });

  const groupBy = (
    samples: FillSample[],
    key: keyof FillSample,
  ): Array<ReturnType<typeof buildFillRow>> => {
    const map = new Map<string, number[]>();
    for (const s of samples) {
      const k = String(s[key]);
      const list = map.get(k) ?? [];
      list.push(s.days);
      map.set(k, list);
    }
    return [...map.entries()]
      .map(([name, arr]) => buildFillRow(name, arr))
      .sort((a, b) => b.filled - a.filled);
  };

  const allFillDays = fillSamples.map((s) => s.days);
  const timeToFill = {
    overall: {
      filled: allFillDays.length,
      median: median(allFillDays),
      p90: percentile(allFillDays, 0.9),
    },
    byClient: groupBy(fillSamples, "client"),
    bySource: groupBy(fillSamples, "source"),
  };

  // ── Time-in-stage: walk each submission's status history. The implicit
  // first transition is "submitted at submittedAt" → enters SUBMITTED. Every
  // pair (prev, next) contributes `next − prev` days to the prev status's
  // bucket. Submissions still in a stage contribute (now − last) — flagged
  // separately so callers can subtract them out if the median looks weird.
  const stageBuckets = new Map<SubmissionStatus, number[]>();
  const ongoingBuckets = new Map<SubmissionStatus, number[]>();
  const push = (
    map: Map<SubmissionStatus, number[]>,
    key: SubmissionStatus,
    val: number,
  ) => {
    const arr = map.get(key) ?? [];
    arr.push(val);
    map.set(key, arr);
  };
  const NOW = new Date();
  for (const s of submissions) {
    const events = rowsBySub.get(s.id) ?? [];
    // Synthesise the initial "SUBMITTED entered at submittedAt" event so the
    // first real transition has something to subtract from.
    let prevStatus: SubmissionStatus = "SUBMITTED";
    let prevTime: Date = s.submittedAt;
    for (const e of events) {
      const next = e.newValue ? LABEL_TO_STATUS.get(e.newValue) : null;
      const at = rowTime(e);
      // Sample goes against the *prev* bucket — that's how long it sat there.
      push(stageBuckets, prevStatus, daysBetween(prevTime, at));
      if (next) {
        prevStatus = next;
        prevTime = at;
      }
    }
    // Still sitting in the current stage (unless it's terminal).
    const TERMINAL: SubmissionStatus[] = ["JOINED", "REJECTED", "ON_HOLD"];
    if (!TERMINAL.includes(prevStatus)) {
      push(ongoingBuckets, prevStatus, daysBetween(prevTime, NOW));
    }
  }

  // Stages we report on — everything except the terminal "decision" branches.
  const STAGE_ORDER: SubmissionStatus[] = [
    "SUBMITTED",
    "RESUME_PICKED",
    "VENDOR_SCREENING_CALL",
    "CLIENT_INTERVIEW",
    "SELECTED",
    "OFFER_RELEASED",
    "OFFER_ACCEPTED",
  ];
  const timeInStage = STAGE_ORDER.map((status) => {
    const closed = stageBuckets.get(status) ?? [];
    const ongoing = ongoingBuckets.get(status) ?? [];
    const all = [...closed, ...ongoing];
    return {
      status,
      n: all.length,
      ongoing: ongoing.length,
      median: median(all),
      p90: percentile(all, 0.9),
    };
  });

  return {
    totalJobs: jobs.length,
    byClient,
    byVendor,
    bySource,
    byRecruiter,
    pipeline,
    conversions,
    openJobs,
    agingBuckets,
    recruiterAging,
    clientRevenue,
    timeToFill,
    timeInStage,
  };
}

export type ReportsData = Awaited<ReturnType<typeof getReportsData>>;
