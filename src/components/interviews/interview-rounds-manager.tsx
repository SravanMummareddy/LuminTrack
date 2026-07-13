"use client";

import { useEffect, useRef, useState } from "react";
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
import { LogResultForm } from "./log-result-form";
import {
  INTERVIEW_TYPE_LABEL,
  INTERVIEW_RESULT_LABEL,
  INTERVIEW_RESULT_TONE,
  interviewModeLabel,
} from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import { isTerminal } from "@/lib/submission-flow";
import type { SubmissionStatus } from "@/generated/prisma/enums";

/** Inline support-provider contact popover — recruiters need the supporter's
 *  email/phone during the interview but can't open the manager-only Settings page
 *  the old "contact details" link pointed at. Renders the details in place. */
function SupportContact({
  provider,
}: {
  provider: { name: string; email: string | null; phone: string | null };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="font-medium text-amber-900 underline"
      >
        contact details
      </button>
      {open && (
        <span className="absolute left-0 z-20 mt-1 block w-60 rounded-md border border-slate-200 bg-white p-3 shadow-lg">
          <span className="block text-sm font-medium text-slate-900">
            {provider.name}
          </span>
          <span className="mt-2 block space-y-1 text-xs">
            <span className="flex justify-between gap-3">
              <span className="text-slate-500">Email</span>
              {provider.email ? (
                <a href={`mailto:${provider.email}`} className="truncate text-indigo-600 hover:underline">
                  {provider.email}
                </a>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </span>
            <span className="flex justify-between gap-3">
              <span className="text-slate-500">Phone</span>
              {provider.phone ? (
                <a href={`tel:${provider.phone}`} className="text-indigo-600 hover:underline">
                  {provider.phone}
                </a>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </span>
          </span>
        </span>
      )}
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

/**
 * Interview rounds card on the submission detail page — unlimited ordered
 * rounds with inline add/edit dialogs (spec §9.8).
 */
export function InterviewRoundsManager({
  submissionId,
  submissionStatus,
  rounds,
  supportProviders,
}: {
  submissionId: string;
  submissionStatus: SubmissionStatus;
  rounds: InterviewRoundData[];
  supportProviders: { id: string; name: string; skills: string[] }[];
}) {
  // A closed submission (Joined / Rejected / Backed out) can't be advanced, so
  // logging a result would only no-op the coupling — hide the affordance
  // (mirrors the "can't add rounds to a closed submission" rule server-side).
  const closed = isTerminal(submissionStatus);
  const [editing, setEditing] = useState<InterviewRoundData | "new" | null>(
    null,
  );
  // "Log result" opens the focused Log-result dialog (H2) — records the outcome
  // AND drives the submission status in one step, separate from the full form.
  const [logging, setLogging] = useState<InterviewRoundData | null>(null);
  function openAdd() {
    setEditing("new");
  }
  function openEdit(r: InterviewRoundData) {
    setEditing(r);
  }
  function openLogResult(r: InterviewRoundData) {
    setLogging(r);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Interview rounds ({rounds.length})
        </h2>
        <Button size="sm" onClick={openAdd}>
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
                  {r.result === "WAITING" && !closed && (
                    <button
                      type="button"
                      onClick={() => openLogResult(r)}
                      className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-sm font-medium text-amber-800 hover:bg-amber-100"
                    >
                      Log result
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
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
                        <SupportContact provider={r.supportProvider} />
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

      {rounds.length > 0 && (
        <p className="mt-3 rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
          <strong className="text-slate-600">After this round:</strong> another
          round coming up? <em>Add round</em> — it moves the submission into that
          interview stage. Interview done? <em>Log result</em> — a passing outcome
          marks the candidate <strong>Selected</strong>, a rejection or hold moves
          the submission for you. No second trip to the Status pipeline.
        </p>
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

      <Dialog
        open={logging !== null}
        onClose={() => setLogging(null)}
        title="Log interview result"
      >
        {logging !== null && (
          <LogResultForm round={logging} onDone={() => setLogging(null)} />
        )}
      </Dialog>
    </section>
  );
}
