"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  InterviewRoundForm,
  type InterviewRoundData,
} from "./interview-round-form";
import {
  INTERVIEW_TYPE_LABEL,
  INTERVIEW_RESULT_LABEL,
  INTERVIEW_RESULT_TONE,
  interviewModeLabel,
} from "@/lib/labels";
import { formatDateTime } from "@/lib/format";

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

/**
 * Interview rounds card on the submission detail page — unlimited ordered
 * rounds with inline add/edit dialogs (spec §9.8).
 */
export function InterviewRoundsManager({
  submissionId,
  rounds,
}: {
  submissionId: string;
  rounds: InterviewRoundData[];
}) {
  const [editing, setEditing] = useState<InterviewRoundData | "new" | null>(
    null,
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Interview rounds ({rounds.length})
        </h2>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" />
          Add round
        </Button>
      </div>

      {rounds.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
          No interview rounds yet. Add the first round to start tracking
          interviews.
        </p>
      ) : (
        <ul className="space-y-3">
          {rounds.map((r) => (
            <li key={r.id} className="rounded-md border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      Round {r.roundOrder} · {r.roundName}
                    </span>
                    <Badge tone={INTERVIEW_RESULT_TONE[r.result]}>
                      {INTERVIEW_RESULT_LABEL[r.result]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {INTERVIEW_TYPE_LABEL[r.interviewType]}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                >
                  Edit
                </button>
              </div>

              <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <RoundItem label="Interviewer">
                  {r.interviewerName || "—"}
                </RoundItem>
                <RoundItem label="Mode">
                  {interviewModeLabel(r.interviewMode, r.interviewPlatform)}
                </RoundItem>
                <RoundItem label="Date & time">
                  {r.scheduledAt ? formatDateTime(r.scheduledAt) : "—"}
                  {r.scheduledAt && r.scheduledTimezone ? (
                    <span className="ml-1 text-xs text-slate-500">
                      ({r.scheduledTimezone})
                    </span>
                  ) : null}
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
                <RoundItem label="Last updated">
                  {formatDateTime(r.updatedAt)}
                  {r.updatedBy ? ` · ${r.updatedBy.fullName}` : ""}
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
              {r.notes && (
                <div className="mt-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Notes
                  </dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">
                    {r.notes}
                  </dd>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add interview round" : "Edit interview round"}
      >
        {editing !== null && (
          <InterviewRoundForm
            submissionId={submissionId}
            round={editing === "new" ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}
