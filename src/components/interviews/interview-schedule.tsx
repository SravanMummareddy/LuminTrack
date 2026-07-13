import Link from "next/link";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  INTERVIEW_TYPE_LABEL,
  INTERVIEW_RESULT_LABEL,
  INTERVIEW_RESULT_TONE,
} from "@/lib/labels";
import {
  formatDate,
  formatTimeInZone,
  formatSubmissionDisplayId,
  deletedSuffix,
} from "@/lib/format";
import {
  bucketInterviews,
  type ScheduleBucketKey,
} from "@/lib/interview-schedule";
import { OrgEntityLink } from "@/components/settings/org-entity-link";
import type { InterviewListRow } from "@/server/queries/interviews";

// Per-bucket accent: awaiting is the actionable amber group, today is live
// indigo, the rest are neutral, completed is muted.
const BUCKET_ACCENT: Record<
  ScheduleBucketKey,
  { dot: string; header: string; rowBorder: string }
> = {
  awaiting: {
    dot: "bg-amber-500",
    header: "text-slate-800",
    rowBorder: "border-l-2 border-amber-400",
  },
  today: {
    dot: "bg-indigo-500",
    header: "text-slate-800",
    rowBorder: "border-l-2 border-indigo-400",
  },
  week: { dot: "bg-slate-300", header: "text-slate-800", rowBorder: "" },
  upcoming: { dot: "bg-slate-300", header: "text-slate-800", rowBorder: "" },
  completed: {
    dot: "bg-slate-300",
    header: "text-slate-500",
    rowBorder: "",
  },
};

/** Group a bucket's rounds by submission, preserving the bucket's sort order
 *  (first appearance wins) so R1/R2 of one candidate render under a single row. */
function groupBySubmission(items: InterviewListRow[]): InterviewListRow[][] {
  const groups: InterviewListRow[][] = [];
  const index = new Map<string, InterviewListRow[]>();
  for (const r of items) {
    let g = index.get(r.submission.id);
    if (!g) {
      g = [];
      index.set(r.submission.id, g);
      groups.push(g);
    }
    g.push(r);
  }
  return groups;
}

/** One candidate/submission block: the candidate + client header once, then each
 *  of that submission's rounds in this bucket nested beneath. */
function ScheduleGroup({
  group,
  bucket,
  isManager,
}: {
  group: InterviewListRow[];
  bucket: ScheduleBucketKey;
  isManager: boolean;
}) {
  const first = group[0];
  const c = first.submission.candidate;
  const done = bucket === "completed";
  const awaiting = bucket === "awaiting";
  return (
    <div
      className={`px-3.5 py-2.5 ${BUCKET_ACCENT[bucket].rowBorder} ${done ? "opacity-90" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {done && (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
        )}
        <Link
          href={`/candidates/${c.id}`}
          className={`text-sm font-medium hover:underline ${done ? "text-slate-600" : "text-indigo-600"}`}
        >
          {c.fullName}
          {deletedSuffix(c)}
        </Link>
        <span className="text-xs text-slate-500">
          ·{" "}
          <OrgEntityLink
            kind="client"
            id={first.submission.job.client.id}
            name={first.submission.job.client.name}
            isManager={isManager}
          />
        </span>
        <Link
          href={`/submissions/${first.submission.id}`}
          className="font-mono text-[11px] text-slate-400 hover:underline"
        >
          {formatSubmissionDisplayId(first.submission)}
        </Link>
      </div>

      <div className="mt-1.5 space-y-1 border-l border-slate-100 pl-3">
        {group.map((row) => (
          <div key={row.id} className="flex items-center gap-3">
            <div className="w-[74px] shrink-0 text-xs text-slate-500">
              <span className={done ? "" : "font-medium text-slate-700"}>
                {row.scheduledAt ? formatDate(row.scheduledAt) : "—"}
              </span>{" "}
              <span suppressHydrationWarning>
                {row.scheduledAt ? formatTimeInZone(row.scheduledAt, row.scheduledTimezone) : ""}
              </span>
            </div>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
              {INTERVIEW_TYPE_LABEL[row.interviewType]} · R{row.roundOrder}
            </span>
            <Badge tone={INTERVIEW_RESULT_TONE[row.result]}>
              {INTERVIEW_RESULT_LABEL[row.result]}
            </Badge>
            {awaiting && (
              <Link
                href={`/submissions/${row.submission.id}`}
                className="flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:underline"
              >
                <TriangleAlert className="h-3 w-3" aria-hidden />
                Log result
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The Interviews → Schedule view: an agenda grouped by time + outcome (see
 * `bucketInterviews`). Server-rendered from a single `now` so buckets are stable
 * and hydration-safe. Empty buckets are skipped.
 */
export function InterviewSchedule({
  rows,
  now,
  capped,
  isManager,
}: {
  rows: InterviewListRow[];
  now: Date;
  capped: boolean;
  isManager: boolean;
}) {
  const buckets = bucketInterviews(rows, now).filter((b) => b.items.length > 0);

  return (
    <div className="space-y-5">
      {capped && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Showing the 500 most recent interviews. Narrow with the filters or a
          date range to see the rest.
        </div>
      )}

      {buckets.map((b) => (
        <section key={b.key}>
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${BUCKET_ACCENT[b.key].dot}`}
            />
            <h3 className={`text-sm font-semibold ${BUCKET_ACCENT[b.key].header}`}>
              {b.label}
            </h3>
            <span className="text-xs text-slate-400">
              {b.items.length}
              {b.hint ? ` · ${b.hint}` : ""}
            </span>
          </div>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {groupBySubmission(b.items).map((group) => (
              <ScheduleGroup
                key={group[0].submission.id}
                group={group}
                bucket={b.key}
                isManager={isManager}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
