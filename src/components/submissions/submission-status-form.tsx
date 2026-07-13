"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, Info, Undo2 } from "lucide-react";
import { Select, Textarea } from "@/components/ui/field";
import { DateField, DateTimeField } from "@/components/ui/date-field";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { changeSubmissionStatus } from "@/server/actions/submissions";
import {
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STAGE_INDEX,
  STATUS_CHANGE_REASONS,
  STATUS_CHANGE_REASON_LABEL,
} from "@/lib/labels";
import {
  primaryAdvance,
  branchActions,
  isTerminal,
  stageStatus,
  previousStage,
  advanceBlock,
  type RoundLite,
} from "@/lib/submission-flow";
import { StatusPipeline } from "@/components/submissions/status-pipeline";
import { Confetti } from "@/components/ui/confetti";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import type { SubmissionStatus } from "@/generated/prisma/enums";

const labelClass = "mb-1 block text-xs font-medium text-slate-500";
const linkClass = "text-xs font-medium text-indigo-600 hover:underline";

/** Current instant as an ISO string — the DateTimeField's value format. */
function nowIso(): string {
  return new Date().toISOString();
}

// SB-5: advancing INTO one of these stages opens a stage-detail dialog (date +
// context) instead of submitting straight away — the "meaningful" stages the
// owner asked to capture. The rest (Resume picked, Selected) advance in one
// click. Joined keeps its own placement-heads-up dialog.
const MEANINGFUL_STAGES: SubmissionStatus[] = [
  "VENDOR_SCREENING_CALL",
  "CLIENT_INTERVIEW",
  "OFFER_RELEASED",
  "OFFER_ACCEPTED",
];

type DialogKind = "reject" | "hold" | "backed_out" | "joined" | "advance" | "correct";

/**
 * Status control on the submission detail page. The common action is a single
 * primary "Advance to <next>" button (see `primaryAdvance` in submission-flow.ts);
 * Hold / Reject / Backed-out are their own buttons that open a small confirm.
 *
 * SB-5/SB-6 (Wave 4): transitions are controlled — no free "jump to any stage".
 * Advancing into a meaningful stage opens a stage-detail dialog (and the vendor
 * screen can be recorded "didn't happen" with a reason); corrections step back
 * exactly one stage and require a written reason. All paths post the SAME
 * `<form>` to the unchanged `changeSubmissionStatus` action; every submitted
 * field is a hidden input bound to component state so there's exactly one input
 * per field name regardless of which UI is showing. Controlled inputs survive
 * React 19's post-action form reset.
 */
export function SubmissionStatusForm({
  submissionId,
  status,
  stageDates,
  rounds = [],
}: {
  submissionId: string;
  status: SubmissionStatus;
  /** SB-4: pre-formatted per-stage reached dates (server-derived from the log). */
  stageDates?: Record<number, string>;
  /** SB-5: interview/screening records, so the control can pre-empt a blocked
   *  advance (the server enforces the same gate). */
  rounds?: RoundLite[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  // Set when a submit was fired from an open dialog, so we hold the dialog open
  // (showing a busy state) until the action resolves, then close it.
  const submittedFromDialog = useRef(false);
  // `target` is the status we're about to POST — set right before every submit.
  const [target, setTarget] = useState<SubmissionStatus>(status);
  const [eventAt, setEventAt] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [expectedJoinDate, setExpectedJoinDate] = useState("");
  const [actualJoinDate, setActualJoinDate] = useState("");
  // SB-5: "this stage didn't happen" — on the vendor-screen advance dialog only.
  const [skip, setSkip] = useState(false);

  const [showDetails, setShowDetails] = useState(false);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [celebrateKey, setCelebrateKey] = useState(0);

  const [state, formAction, isPending] = useActionState(
    changeSubmissionStatus,
    EMPTY_FORM_STATE,
  );
  const { toast } = useToast();

  // Default "when this happened" to now — client-only (avoids a hydration
  // mismatch on the datetime input).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only initial value
    setEventAt(nowIso());
  }, []);

  // Confirm the save (the action revalidates instead of redirecting) and reset
  // the change-specific fields — this form is intentionally not remounted on
  // save, which would eat the toast.
  useEffect(() => {
    if (state.ok && state.toast) {
      toast({
        tone: "success",
        title: state.toast.title,
        description: state.toast.description,
      });
      /* eslint-disable react-hooks/set-state-in-effect */
      if (state.celebrate) setCelebrateKey((k) => k + 1);
      setNote("");
      setReason("");
      setExpectedJoinDate("");
      setActualJoinDate("");
      setSkip(false);
      setEventAt(nowIso());
      setShowDetails(false);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [state, toast]);

  // Close the dialog once the action settles (success OR error). Runs when
  // isPending falls back to false after a dialog-initiated submit — so the
  // dialog shows a busy state throughout instead of vanishing the instant it's
  // confirmed. On error, closing reveals the error banner below the form.
  useEffect(() => {
    if (!isPending && submittedFromDialog.current) {
      submittedFromDialog.current = false;
      setDialog(null);
    }
  }, [isPending]);

  function clearTransient() {
    setNote("");
    setReason("");
    setExpectedJoinDate("");
    setActualJoinDate("");
    setSkip(false);
  }

  /**
   * Build the payload from the live form + current state and dispatch the action
   * directly. The form's controls are all `type="button"`, so there is no native
   * submitter; dispatching `formAction(FormData)` inside a transition is the
   * reliable path. Every field is set explicitly so the payload never depends on
   * React having flushed the controlled hidden inputs before this runs.
   */
  function submitWith(next: SubmissionStatus) {
    // Re-entrancy guard: never dispatch a second change while one is in flight.
    if (isPending) return;
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    fd.set("id", submissionId);
    fd.set("status", next);
    fd.set("eventAt", eventAt);
    fd.set("note", note);
    fd.set("reason", reason);
    fd.set("expectedJoinDate", expectedJoinDate);
    fd.set("actualJoinDate", actualJoinDate);
    setTarget(next);
    startTransition(() => formAction(fd));
  }

  /** Set the target status and dispatch the change. */
  function submitAs(next: SubmissionStatus) {
    submitWith(next);
  }

  /** Open a branch/confirm dialog for `next`, starting from clean fields. Ignored
   *  while a change is in flight so a dialog can't stack on a pending action. */
  function openDialog(kind: DialogKind, next: SubmissionStatus) {
    if (isPending) return;
    clearTransient();
    setTarget(next);
    setDialog(kind);
  }

  /** SB-6: open the one-step-back correction dialog (reason required). */
  function openCorrect() {
    const prev = previousStage(status);
    if (!prev || isPending) return;
    clearTransient();
    setTarget(prev);
    setDialog("correct");
  }

  function confirmDialog() {
    // Keep the dialog open (with a busy button) until the action resolves; the
    // isPending effect closes it.
    submittedFromDialog.current = true;
    submitWith(target);
  }

  /** SB-5: confirm the stage-detail advance. A ticked "didn't happen" on the
   *  vendor screen skips it — advancing to Client interview with the note as the
   *  recorded reason. */
  function confirmAdvance() {
    submittedFromDialog.current = true;
    if (skip && target === "VENDOR_SCREENING_CALL") {
      submitWith("CLIENT_INTERVIEW");
    } else {
      submitWith(target);
    }
  }

  function cancelDialog() {
    setDialog(null);
    clearTransient();
    setTarget(status);
  }

  const advance = primaryAdvance(status);
  const branches = branchActions(status);
  const terminal = isTerminal(status);
  const prevStage = previousStage(status);

  // SB-5: the "record required" reason blocking an advance to `next`, or null.
  // Join dates are collected inside the dialog, so we assume they'll be present
  // here — this surfaces only the missing-interview / result gates up front.
  function recordBlock(next: SubmissionStatus): string | null {
    return advanceBlock(status, next, rounds, {
      hasExpectedJoinDate: true,
      hasActualJoinDate: true,
    });
  }

  /** Close the dialog and jump to the interview-rounds section to add the
   *  missing record. */
  function goToRounds() {
    setDialog(null);
    if (typeof document !== "undefined")
      document
        .getElementById("interview-rounds")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // In the advance dialog the vendor-screen skip retargets Client interview, so
  // the block it must satisfy is that stage's (needs a client-interview round).
  const advanceEffectiveTarget: SubmissionStatus =
    skip && target === "VENDOR_SCREENING_CALL" ? "CLIENT_INTERVIEW" : target;
  const advanceBlockedReason =
    dialog === "advance" ? recordBlock(advanceEffectiveTarget) : null;

  const branchLabel: Record<string, string> = {
    ON_HOLD: "Put on hold",
    REJECTED: "Reject",
    BACKED_OUT: "Backed out",
  };

  function onBranchClick(s: SubmissionStatus) {
    if (s === "ON_HOLD") openDialog("hold", "ON_HOLD");
    else if (s === "REJECTED") openDialog("reject", "REJECTED");
    else if (s === "BACKED_OUT") openDialog("backed_out", "BACKED_OUT");
  }

  function onPrimaryClick() {
    if (!advance) return;
    if (advance.next === "JOINED") openDialog("joined", "JOINED");
    else if (MEANINGFUL_STAGES.includes(advance.next))
      openDialog("advance", advance.next);
    else submitAs(advance.next);
  }

  // The immediate-next stage index drives the dashed "click to advance" cue on
  // the stepper (only when the happy path really is the next visual stage).
  const nextStageIndex =
    advance && stageStatus(SUBMISSION_STAGE_INDEX[status] + 1) === advance.next
      ? SUBMISSION_STAGE_INDEX[status] + 1
      : null;
  const prevStageIndex = prevStage ? SUBMISSION_STAGE_INDEX[prevStage] : null;

  // SB-6: clicking a stepper dot only does the two legal one-step moves — the
  // immediate next stage runs the primary advance; the immediate previous stage
  // opens the correction. Any farther dot is a no-op (no free jumps).
  function onStageClick(index: number) {
    const clicked = stageStatus(index);
    if (!clicked || clicked === status) return;
    if (advance && clicked === advance.next) {
      onPrimaryClick();
      return;
    }
    if (prevStage && clicked === prevStage) openCorrect();
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <Confetti fireKey={celebrateKey} />
      <input type="hidden" name="id" value={submissionId} />
      <input type="hidden" name="status" value={target} />
      <input type="hidden" name="eventAt" value={eventAt} />
      <input type="hidden" name="note" value={note} />
      <input type="hidden" name="reason" value={reason} />
      <input type="hidden" name="expectedJoinDate" value={expectedJoinDate} />
      <input type="hidden" name="actualJoinDate" value={actualJoinDate} />

      <StatusPipeline
        status={status}
        onStageClick={onStageClick}
        nextStageIndex={nextStageIndex}
        prevStageIndex={prevStageIndex}
        stageDates={stageDates}
      />
      <div className="border-t border-slate-200 pt-3" />

      {terminal ? (
        <p className="text-sm text-slate-500">
          This submission is closed —{" "}
          <span className="font-medium text-slate-700">
            {SUBMISSION_STATUS_LABEL[status]}
          </span>
          .{" "}
          {prevStage && (
            <>
              <button type="button" className={linkClass} onClick={openCorrect}>
                Move back a stage
              </button>{" "}
              to reopen or correct it.
            </>
          )}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {advance && (
              <Button
                type="button"
                variant="primary"
                onClick={onPrimaryClick}
                disabled={isPending}
              >
                {advance.label}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
            {branches.map((s) => (
              <button
                key={s}
                type="button"
                disabled={isPending}
                onClick={() => onBranchClick(s)}
                className={
                  s === "ON_HOLD"
                    ? "inline-flex items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-700 shadow-sm transition hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    : s === "REJECTED"
                      ? buttonClass("danger")
                      : buttonClass("secondary")
                }
              >
                {branchLabel[s]}
              </button>
            ))}
          </div>

          {showDetails && (
            <div className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
              <div className="w-56">
                <label
                  htmlFor="eventAtCtl"
                  className={`${labelClass} flex items-center gap-1`}
                >
                  Effective date/time
                  <span
                    tabIndex={0}
                    role="img"
                    aria-label="Defaults to now. Set this to when the change actually happened if it was earlier — it feeds the time-in-stage and time-to-fill reports."
                    title="Defaults to now. Set this to when the change actually happened if it was earlier — it feeds the time-in-stage and time-to-fill reports."
                    className="cursor-help text-slate-400"
                  >
                    <Info className="h-3 w-3" aria-hidden />
                  </span>
                </label>
                <DateTimeField id="eventAtCtl" value={eventAt} onChange={setEventAt} />
              </div>
              <div className="min-w-[16rem] flex-1">
                <label htmlFor="noteCtl" className={labelClass}>
                  Note
                </label>
                <Textarea
                  id="noteCtl"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note — applied to the next advance"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 pt-0.5">
            <button
              type="button"
              className={linkClass}
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails ? "Hide note / date" : "Add note or backdate"}
            </button>
            {prevStage && (
              <button
                type="button"
                className={`${linkClass} inline-flex items-center gap-1`}
                onClick={openCorrect}
              >
                <Undo2 className="h-3 w-3" aria-hidden />
                Correct — move back a stage
              </button>
            )}
          </div>
        </>
      )}

      {state.error && (
        <p
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
        >
          {state.error}
        </p>
      )}

      <p className="text-xs text-slate-400">
        To correct the original <strong>submitted date</strong> (not this change),
        use{" "}
        <a
          href={`/submissions/${submissionId}/edit`}
          className="text-indigo-600 hover:underline"
        >
          Edit submission
        </a>
        .
      </p>

      {(dialog === "reject" || dialog === "hold") && (
        <Dialog
          open
          onClose={cancelDialog}
          title={dialog === "reject" ? "Reject candidate" : "Put on hold"}
          description={
            dialog === "reject"
              ? "Pick a reason (optional) — it shows on the timeline and the reports."
              : "Pausing this submission. Pick a reason (optional)."
          }
        >
          <div className="space-y-3">
            <div>
              <label htmlFor="reasonDlg" className={labelClass}>
                Reason
              </label>
              <Select
                id="reasonDlg"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">Select a reason (optional)…</option>
                {STATUS_CHANGE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {STATUS_CHANGE_REASON_LABEL[r]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="noteDlg" className={labelClass}>
                Note
              </label>
              <Textarea
                id="noteDlg"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  dialog === "reject"
                    ? "Why was the candidate rejected?"
                    : "Optional note about this change"
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={cancelDialog}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={dialog === "reject" ? "danger" : "primary"}
                onClick={confirmDialog}
                disabled={isPending}
              >
                {isPending
                  ? "Saving…"
                  : dialog === "reject"
                    ? "Reject candidate"
                    : "Put on hold"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {dialog === "backed_out" && (
        <Dialog
          open
          onClose={cancelDialog}
          title="Mark as backed out"
          description="The candidate withdrew after being selected or offered."
        >
          <div className="space-y-3">
            <div>
              <label htmlFor="noteBacked" className={labelClass}>
                Note
              </label>
              <Textarea
                id="noteBacked"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional — what happened?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={cancelDialog}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={confirmDialog}
                disabled={isPending}
              >
                {isPending ? "Saving…" : "Mark backed out"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {dialog === "advance" && (
        <Dialog
          open
          onClose={cancelDialog}
          title={`Advance → ${SUBMISSION_STATUS_LABEL[target].toLowerCase()}`}
          description="Record when this stage happened and any context. It lands on the timeline."
        >
          <div className="space-y-3">
            {target === "VENDOR_SCREENING_CALL" && (
              <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={skip}
                  onChange={(e) => setSkip(e.target.checked)}
                />
                <span>
                  The client <strong>waived</strong> the vendor screen — skip it
                  and go straight to the client interview. You&apos;ll still need
                  the interview scheduled.
                </span>
              </label>
            )}

            {advanceBlockedReason ? (
              // SB-5 (strict): the required interview/screening record is missing
              // — guide the recruiter to add it rather than let the advance
              // through (the server enforces this too).
              <div className="space-y-3">
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {advanceBlockedReason}
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={cancelDialog}
                  >
                    Cancel
                  </Button>
                  <Button type="button" variant="primary" onClick={goToRounds}>
                    Go to interview rounds ↓
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="w-56">
                  <label htmlFor="advEventAt" className={labelClass}>
                    {skip ? "Effective date/time" : "When did this happen?"}
                  </label>
                  <DateTimeField id="advEventAt" value={eventAt} onChange={setEventAt} />
                </div>
                {target === "OFFER_ACCEPTED" && !skip && (
                  <div className="w-56">
                    <label htmlFor="advExpectedJoin" className={labelClass}>
                      Expected join date <span className="text-rose-500">*</span>
                    </label>
                    <DateField id="advExpectedJoin" value={expectedJoinDate} onChange={setExpectedJoinDate} />
                  </div>
                )}
                <div>
                  <label htmlFor="advNote" className={labelClass}>
                    {skip ? (
                      <>
                        Reason <span className="text-rose-500">*</span>
                      </>
                    ) : target === "CLIENT_INTERVIEW" ? (
                      "Note (log the round details below after advancing)"
                    ) : (
                      "Note"
                    )}
                  </label>
                  <Textarea
                    id="advNote"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      skip
                        ? "Why was the vendor screen skipped?"
                        : "Optional — what happened at this stage?"
                    }
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={cancelDialog}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={confirmAdvance}
                    disabled={
                      isPending ||
                      (skip && !note.trim()) ||
                      (target === "OFFER_ACCEPTED" && !skip && !expectedJoinDate)
                    }
                  >
                    {isPending
                      ? "Saving…"
                      : skip
                        ? "Skip & advance"
                        : "Save & advance"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Dialog>
      )}

      {dialog === "correct" && (
        <Dialog
          open
          onClose={cancelDialog}
          title={`Move back to ${SUBMISSION_STATUS_LABEL[target].toLowerCase()}?`}
          description="Corrections step back one stage and are logged on the timeline with who, when and why."
        >
          <div className="space-y-3">
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Moving <strong>back</strong> from{" "}
              {SUBMISSION_STATUS_LABEL[status].toLowerCase()} to{" "}
              {SUBMISSION_STATUS_LABEL[target].toLowerCase()}. This is a
              correction, not progress — say why.
            </p>
            <div>
              <label htmlFor="correctNote" className={labelClass}>
                Reason <span className="text-rose-500">*</span>
              </label>
              <Textarea
                id="correctNote"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why is this being moved back?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={cancelDialog}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={confirmDialog}
                disabled={isPending || !note.trim()}
              >
                {isPending ? "Saving…" : "Record correction"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {dialog === "joined" && (
        <Dialog
          open
          onClose={cancelDialog}
          title="Mark as joined"
          description="This creates a placement and marks the candidate placed."
        >
          <div className="space-y-3">
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Saving as <strong>Joined</strong> creates a placement and marks the
              candidate (and any linked bench profile) <strong>Placed</strong>. Set
              the placement&apos;s bill/pay rates afterward on the placement page.
            </p>
            <div className="w-56">
              <label htmlFor="actualJoinDlg" className={labelClass}>
                Actual join date <span className="text-rose-500">*</span>
              </label>
              <DateField id="actualJoinDlg" value={actualJoinDate} onChange={setActualJoinDate} />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={cancelDialog}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={confirmDialog}
                disabled={isPending || !actualJoinDate}
              >
                {isPending ? "Marking…" : "Mark joined"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </form>
  );
}
