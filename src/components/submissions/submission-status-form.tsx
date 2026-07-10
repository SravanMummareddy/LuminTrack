"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import { Select, Textarea, Input } from "@/components/ui/field";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { changeSubmissionStatus } from "@/server/actions/submissions";
import {
  SUBMISSION_STATUSES,
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
} from "@/lib/submission-flow";
import { StatusPipeline } from "@/components/submissions/status-pipeline";
import { Confetti } from "@/components/ui/confetti";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import type { SubmissionStatus } from "@/generated/prisma/enums";

const labelClass = "mb-1 block text-xs font-medium text-slate-500";
const linkClass = "text-xs font-medium text-indigo-600 hover:underline";

/** Current local date/time as a `datetime-local` input value. */
function nowDateTimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

type DialogKind = "reject" | "hold" | "backed_out" | "joined" | "confirm_jump";

/**
 * Status control on the submission detail page. Instead of a flat dropdown, the
 * common action is a single primary "Advance to <next>" button (see
 * `primaryAdvance` in submission-flow.ts); Hold / Reject / Backed-out are their
 * own buttons that open a small confirm capturing the reason (or, for Joined,
 * the placement heads-up + join date). The full status dropdown is still one
 * click away under "Jump to any stage" for corrections.
 *
 * All paths post the SAME `<form>` to the unchanged `changeSubmissionStatus`
 * action. Every submitted field is a hidden input bound to component state;
 * visible controls are name-less and just drive that state — so there's exactly
 * one input per field name regardless of which UI is showing. Controlled inputs
 * survive React 19's post-action form reset (the values must live until the
 * page revalidates); a `submitFlag` effect calls `requestSubmit()` after state
 * commits so the hidden `status` carries the intended target.
 */
export function SubmissionStatusForm({
  submissionId,
  status,
}: {
  submissionId: string;
  status: SubmissionStatus;
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

  const [showDetails, setShowDetails] = useState(false);
  const [showJump, setShowJump] = useState(false);
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
    setEventAt(nowDateTimeLocal());
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
      setEventAt(nowDateTimeLocal());
      setShowDetails(false);
      setShowJump(false);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [state, toast]);

  // Close the dialog once the action settles (success OR error). Runs when
  // isPending falls back to false after a dialog-initiated submit — so the
  // dialog shows a busy state throughout instead of vanishing the instant it's
  // confirmed (which read as a frozen page). On error, closing reveals the
  // error banner below the form.
  useEffect(() => {
    if (!isPending && submittedFromDialog.current) {
      submittedFromDialog.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDialog(null);
    }
  }, [isPending]);

  function clearTransient() {
    setNote("");
    setReason("");
    setExpectedJoinDate("");
    setActualJoinDate("");
  }

  /**
   * Build the payload from the live form + current state and dispatch the action
   * directly. The form's controls are all `type="button"`, so there is no native
   * submitter; dispatching `formAction(FormData)` inside a transition is the
   * reliable path (a prior `requestSubmit()`-from-effect indirection did not
   * dispatch the React form action on click). Every field is set explicitly so
   * the payload never depends on React having flushed the controlled hidden
   * inputs before this runs.
   */
  function submitWith(next: SubmissionStatus) {
    // Re-entrancy guard: never dispatch a second change while one is in flight.
    // `disabled={isPending}` has a one-frame gap; this closes it and prevents a
    // second dialog/action stacking mid-transition.
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

  function confirmDialog() {
    // Keep the dialog open (with a busy button) until the action resolves; the
    // isPending effect closes it. Closing here left only a greyed button behind
    // the dialog, which read as a frozen page.
    submittedFromDialog.current = true;
    submitWith(target);
  }

  function cancelDialog() {
    setDialog(null);
    clearTransient();
    setTarget(status);
  }

  const advance = primaryAdvance(status);
  const branches = branchActions(status);
  const terminal = isTerminal(status);

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
    else submitAs(advance.next);
  }

  // The immediate-next stage index drives the dashed "click to advance" cue on
  // the stepper (only when the happy path really is the next visual stage).
  const nextStageIndex =
    advance && stageStatus(SUBMISSION_STAGE_INDEX[status] + 1) === advance.next
      ? SUBMISSION_STAGE_INDEX[status] + 1
      : null;

  // Clicking a stepper dot: the happy path runs the primary action; a jump to
  // Joined opens the placement confirm; anything else (backward / skip) confirms
  // first. Stepper dots only ever target linear statuses, never Reject/Hold.
  function onStageClick(index: number) {
    const clicked = stageStatus(index);
    if (!clicked || clicked === status) return;
    if (advance && clicked === advance.next) {
      onPrimaryClick();
      return;
    }
    if (clicked === "JOINED") {
      openDialog("joined", "JOINED");
      return;
    }
    openDialog("confirm_jump", clicked);
  }

  // Which conditional fields the "Jump to any stage" control should reveal for
  // the currently-picked target (mirrors the old form's rules).
  const jumpShowReason = target === "REJECTED" || target === "ON_HOLD";
  const jumpShowExpectedJoin = target === "OFFER_ACCEPTED";
  const jumpShowActualJoin = target === "JOINED";

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
      />
      <div className="border-t border-slate-200 pt-3" />

      {!showJump && (
        <>
          {terminal ? (
            <p className="text-sm text-slate-500">
              This submission is closed —{" "}
              <span className="font-medium text-slate-700">
                {SUBMISSION_STATUS_LABEL[status]}
              </span>
              . Use{" "}
              <button
                type="button"
                className={linkClass}
                onClick={() => {
                  setTarget(status);
                  setShowJump(true);
                }}
              >
                Jump to any stage
              </button>{" "}
              to reopen or correct it.
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
                    <Input
                      id="eventAtCtl"
                      type="datetime-local"
                      value={eventAt}
                      onChange={(e) => setEventAt(e.target.value)}
                    />
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
                <button
                  type="button"
                  className={linkClass}
                  onClick={() => {
                    setTarget(status);
                    setShowJump(true);
                  }}
                >
                  Jump to any stage
                </button>
              </div>
            </>
          )}
        </>
      )}

      {showJump && (
        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-56">
              <label htmlFor="statusJump" className={labelClass}>
                Set status
              </label>
              <Select
                id="statusJump"
                value={target}
                onChange={(e) => setTarget(e.target.value as SubmissionStatus)}
              >
                {SUBMISSION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {SUBMISSION_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-56">
              <label htmlFor="eventAtJump" className={labelClass}>
                Effective date/time
              </label>
              <Input
                id="eventAtJump"
                type="datetime-local"
                value={eventAt}
                onChange={(e) => setEventAt(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => submitWith(target)}
              disabled={isPending}
            >
              {isPending ? "Updating…" : "Update"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowJump(false);
                setTarget(status);
                clearTransient();
              }}
            >
              Cancel
            </Button>
          </div>

          {jumpShowReason && (
            <div className="w-56">
              <label htmlFor="reasonJump" className={labelClass}>
                Reason
              </label>
              <Select
                id="reasonJump"
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
          )}
          {jumpShowExpectedJoin && (
            <div className="w-56">
              <label htmlFor="expectedJoinJump" className={labelClass}>
                Expected join date
              </label>
              <Input
                id="expectedJoinJump"
                type="date"
                value={expectedJoinDate}
                onChange={(e) => setExpectedJoinDate(e.target.value)}
              />
            </div>
          )}
          {jumpShowActualJoin && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Saving as <strong>Joined</strong> creates a placement and marks the
              candidate <strong>Placed</strong>. Set the placement&apos;s bill/pay
              rates afterward.
            </p>
          )}
          {jumpShowActualJoin && (
            <div className="w-56">
              <label htmlFor="actualJoinJump" className={labelClass}>
                Actual join date
              </label>
              <Input
                id="actualJoinJump"
                type="date"
                value={actualJoinDate}
                onChange={(e) => setActualJoinDate(e.target.value)}
              />
            </div>
          )}
          <div className="max-w-md">
            <label htmlFor="noteJump" className={labelClass}>
              Note
            </label>
            <Textarea
              id="noteJump"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note about this change"
            />
          </div>
        </div>
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

      {dialog === "confirm_jump" && (
        <Dialog
          open
          onClose={cancelDialog}
          title={`Move to ${SUBMISSION_STATUS_LABEL[target].toLowerCase()}?`}
          description="This sets the submission's status and logs the change on the timeline."
        >
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
              disabled={isPending}
            >
              {isPending
                ? "Saving…"
                : `Move to ${SUBMISSION_STATUS_LABEL[target].toLowerCase()}`}
            </Button>
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
                Actual join date
              </label>
              <Input
                id="actualJoinDlg"
                type="date"
                value={actualJoinDate}
                onChange={(e) => setActualJoinDate(e.target.value)}
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
                disabled={isPending}
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
