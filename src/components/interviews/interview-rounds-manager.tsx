"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmSubmit } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { deleteInterviewRound } from "@/server/actions/interviews";
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
  supportProviders,
}: {
  submissionId: string;
  rounds: InterviewRoundData[];
  supportProviders: { id: string; name: string; skills: string[] }[];
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
                    {r.supportNeeded && (
                      <Badge tone="amber">
                        {r.supportProvider
                          ? `Supported by ${r.supportProvider.name}`
                          : "Done with support"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {INTERVIEW_TYPE_LABEL[r.interviewType]}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditing(r)}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    Edit
                  </button>
                  <ConfirmSubmit
                    action={deleteInterviewRound}
                    fields={{ id: r.id }}
                    title="Remove interview round?"
                    description={`Round ${r.roundOrder} · "${r.roundName}" will be removed. This can't be undone.`}
                    confirmLabel="Remove round"
                    trigger={<Trash2 className="h-4 w-4" aria-hidden />}
                    triggerClassName="text-slate-400 hover:text-red-600"
                    triggerTitle="Remove round"
                  />
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <RoundItem label="Interviewer">
                  {r.interviewerName || "—"}
                </RoundItem>
                <RoundItem label="Mode">
                  {interviewModeLabel(r.interviewMode, r.interviewPlatform)}
                </RoundItem>
                <RoundItem label="Date & time">
                  <span suppressHydrationWarning>
                    {r.scheduledAt ? formatDateTime(r.scheduledAt) : "—"}
                  </span>
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
                  <span suppressHydrationWarning>
                    {formatDateTime(r.updatedAt)}
                    {r.updatedBy ? ` · ${r.updatedBy.fullName}` : ""}
                  </span>
                </RoundItem>
              </dl>

              {r.supportNeeded && (r.supportProvider || r.supportMethod) && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-amber-700">
                    Support
                  </dt>
                  <dd className="mt-0.5 text-sm text-amber-800">
                    {r.supportProvider?.name ?? "Provider not set"}
                    {r.supportMethod ? ` · ${r.supportMethod}` : ""}
                    {r.supportProvider && (
                      <>
                        {" — "}
                        <Link
                          href="/settings?tab=support"
                          className="font-medium text-amber-900 underline"
                        >
                          contact details
                        </Link>
                      </>
                    )}
                  </dd>
                </div>
              )}

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
            supportProviders={supportProviders}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}
