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
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-slate-50">
                <Link
                  href={`/submissions/${sub.id}`}
                  className="font-medium text-indigo-600 hover:underline"
                >
                  {sub.job.title}
                </Link>
                <span className="text-sm text-slate-600">
                  {sub.job.client.name}
                </span>
                <Badge tone={SUBMISSION_STATUS_TONE[sub.status]}>
                  {SUBMISSION_STATUS_LABEL[sub.status]}
                </Badge>
                <div className="flex flex-wrap items-center gap-1">
                  {shownRounds.map((r) => (
                    <RoundPip key={r.id} result={r.result} order={r.roundOrder} />
                  ))}
                  {overflow > 0 && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      +{overflow}
                    </span>
                  )}
                </div>
                <span className="ml-auto whitespace-nowrap text-xs text-slate-500">
                  {lastDate ? formatDate(lastDate) : "—"}
                </span>
                <span className="text-xs font-medium text-indigo-600 group-open:hidden">
                  See details ▾
                </span>
                <span className="hidden text-xs font-medium text-indigo-600 group-open:inline">
                  Hide ▴
                </span>
              </summary>

              <div className="border-t border-slate-100 px-4 py-3">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Round</th>
                      <th className="py-1 pr-3 font-medium">Type</th>
                      <th className="py-1 pr-3 font-medium">Mode</th>
                      <th className="py-1 pr-3 font-medium">Interviewer</th>
                      <th className="py-1 pr-3 font-medium">Scheduled</th>
                      <th className="py-1 pr-3 font-medium">Result</th>
                      <th className="py-1 pr-3 font-medium">Feedback</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sub.interviewRounds.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 pr-3 align-top whitespace-nowrap text-slate-700">
                          R{r.roundOrder} · {r.roundName}
                        </td>
                        <td className="py-2 pr-3 align-top text-slate-600">
                          {INTERVIEW_TYPE_LABEL[r.interviewType]}
                        </td>
                        <td className="py-2 pr-3 align-top text-slate-600">
                          {r.interviewMode
                            ? r.interviewPlatform
                              ? `${r.interviewMode} · ${r.interviewPlatform}`
                              : r.interviewMode
                            : "—"}
                        </td>
                        <td className="py-2 pr-3 align-top text-slate-600">
                          {r.interviewerName || "—"}
                        </td>
                        <td className="py-2 pr-3 align-top whitespace-nowrap text-slate-600">
                          {r.scheduledAt ? formatDateTime(r.scheduledAt) : "—"}
                        </td>
                        <td className="py-2 pr-3 align-top">
                          <Badge tone={INTERVIEW_RESULT_TONE[r.result]}>
                            {INTERVIEW_RESULT_LABEL[r.result]}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 align-top text-slate-600">
                          <span className="block max-w-md whitespace-pre-wrap">
                            {r.feedback || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
