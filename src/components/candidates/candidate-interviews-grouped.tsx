import Link from "next/link";
import { Check, X, Hourglass } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STATUS_TONE,
  INTERVIEW_TYPE_LABEL,
  INTERVIEW_RESULT_LABEL,
  INTERVIEW_RESULT_TONE,
} from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import type { CandidateInterviewGroup } from "@/server/queries/interviews";

const PIP_CAP = 5;

/**
 * One row per submission, with a row of result pips that summarize each
 * interview round at a glance. The native `<details>` element handles the
 * "See details" expand without any client-state plumbing.
 */
export function CandidateInterviewsGrouped({
  rows,
}: {
  rows: CandidateInterviewGroup[];
}) {
  return (
    <ul className="space-y-2">
      {rows.map((sub) => {
        const shownRounds = sub.interviewRounds.slice(0, PIP_CAP);
        const overflow = sub.interviewRounds.length - shownRounds.length;
        const last = sub.interviewRounds[sub.interviewRounds.length - 1];
        const lastDate = last?.scheduledAt ?? null;

        return (
          <li
            key={sub.id}
            className="rounded-md border border-slate-200 bg-white"
          >
            <details className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:[outline-offset:-2px]">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <Link
                    href={`/submissions/${sub.id}`}
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    {sub.job.title}
                  </Link>
                  <span className="inline-flex items-baseline gap-2 text-sm text-slate-600">
                    <span aria-hidden className="text-slate-300">·</span>
                    {sub.job.client.name}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={SUBMISSION_STATUS_TONE[sub.status]}>
                    {SUBMISSION_STATUS_LABEL[sub.status]}
                  </Badge>
                  <div className="flex flex-wrap items-center gap-1">
                    {shownRounds.map((r) => (
                      <RoundPip
                        key={r.id}
                        result={r.result}
                        order={r.roundOrder}
                      />
                    ))}
                    {overflow > 0 && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        +{overflow}
                      </span>
                    )}
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate-500">
                    {lastDate ? formatDate(lastDate) : "—"}
                  </span>
                  <span className="text-xs font-medium text-indigo-600 group-open:hidden">
                    See details ▾
                  </span>
                  <span className="hidden text-xs font-medium text-indigo-600 group-open:inline">
                    Hide ▴
                  </span>
                </div>
              </summary>

              <div className="space-y-3 border-t border-slate-100 px-4 py-3">
                {sub.interviewRounds.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-md border border-slate-200 bg-slate-50/60 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">
                        R{r.roundOrder} · {r.roundName}
                      </p>
                      <Badge tone={INTERVIEW_RESULT_TONE[r.result]}>
                        {INTERVIEW_RESULT_LABEL[r.result]}
                      </Badge>
                    </div>
                    <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <RoundItem label="Type">
                        {INTERVIEW_TYPE_LABEL[r.interviewType]}
                      </RoundItem>
                      <RoundItem label="Mode">
                        {r.interviewMode
                          ? r.interviewPlatform
                            ? `${r.interviewMode} · ${r.interviewPlatform}`
                            : r.interviewMode
                          : "—"}
                      </RoundItem>
                      <RoundItem label="Interviewer">
                        {r.interviewerName || "—"}
                      </RoundItem>
                      <RoundItem label="Scheduled">
                        {r.scheduledAt ? formatDateTime(r.scheduledAt) : "—"}
                      </RoundItem>
                      <RoundItem label="Meeting link">
                        {r.meetingLink ? (
                          <a
                            href={r.meetingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all text-indigo-600 hover:underline"
                          >
                            Join
                          </a>
                        ) : (
                          "—"
                        )}
                      </RoundItem>
                    </dl>
                    {r.feedback && (
                      <div className="mt-3">
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                          Feedback
                        </dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">
                          {r.feedback}
                        </dd>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

function RoundPip({
  result,
  order,
}: {
  result: CandidateInterviewGroup["interviewRounds"][number]["result"];
  order: number;
}) {
  // Bucket the round result into one of three visual states:
  //   ✓ green = clearly positive (SELECTED, COMPLETED)
  //   ✗ red   = negative (REJECTED)
  //   ⌛ slate = pending / inconclusive (WAITING, NEED_ANOTHER_ROUND, ON_HOLD)
  const bucket =
    result === "SELECTED" || result === "COMPLETED"
      ? "ok"
      : result === "REJECTED"
        ? "bad"
        : "pending";

  const cls =
    bucket === "ok"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : bucket === "bad"
        ? "border-red-300 bg-red-50 text-red-700"
        : "border-slate-300 bg-slate-50 text-slate-600";

  const Icon = bucket === "ok" ? Check : bucket === "bad" ? X : Hourglass;

  return (
    <span
      title={`Round ${order} · ${INTERVIEW_RESULT_LABEL[result]}`}
      className={
        "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium " +
        cls
      }
    >
      <Icon className="h-3 w-3" aria-hidden />R{order}
    </span>
  );
}

function RoundItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}
