"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { changeJobStatus } from "@/server/actions/jobs";
import { JOB_STATUS_LABEL } from "@/lib/labels";
import {
  jobStatusActions,
  isTerminalJobStatus,
  type JobStatusAction,
} from "@/lib/job-flow";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import type { JobStatus } from "@/generated/prisma/enums";

const HOLD_CLASS =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 shadow-sm transition hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

function actionClass(tone: JobStatusAction["tone"]): string {
  if (tone === "hold") return HOLD_CLASS;
  return buttonClass(tone, "sm");
}

/**
 * Job-status control on the job detail page. Replaces the old dropdown + Update
 * with one-click quick-action buttons for the valid moves from the current
 * status (see `jobStatusActions`). Confirm-flagged moves (Cancel) open a small
 * dialog first. Posts the same field set to the unchanged `changeJobStatus`
 * action (which returns a toast on success). Dispatches the action directly
 * rather than relying on requestSubmit (see the submission status form for why).
 */
export function JobStatusForm({
  jobId,
  status,
  openVprCount = 0,
  inFlightCount = 0,
  positions = null,
  activePlacementCount = 0,
}: {
  jobId: string;
  status: JobStatus;
  /** Open vendor requirements on this job — cancelled when the job closes. */
  openVprCount?: number;
  /** In-flight (non-terminal) submissions — kept, but flagged before closing. */
  inFlightCount?: number;
  /** Requisition's seat count (nullable on imported jobs — treated as 1). */
  positions?: number | null;
  /** Seats filled right now — active placements against this job. */
  activePlacementCount?: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [target, setTarget] = useState<JobStatus>(status);
  const [confirming, setConfirming] = useState<JobStatusAction | null>(null);
  const [state, formAction, pending] = useActionState(
    changeJobStatus,
    EMPTY_FORM_STATE,
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok && state.toast)
      toast({ tone: "success", title: state.toast.title });
  }, [state, toast]);

  function submit(next: JobStatus) {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    fd.set("id", jobId);
    fd.set("status", next);
    setTarget(next);
    startTransition(() => formAction(fd));
  }

  // Closing/filling/cancelling a job cancels its open requirements and leaves
  // in-flight candidates behind — warn before doing it, even for moves that
  // aren't otherwise confirm-gated (Close / Mark filled).
  const hasCascade = openVprCount > 0 || inFlightCount > 0;
  function willCascade(a: JobStatusAction) {
    return isTerminalJobStatus(a.next) && hasCascade;
  }

  function onAction(a: JobStatusAction) {
    if (a.confirm || willCascade(a)) setConfirming(a);
    else submit(a.next);
  }

  const actions = jobStatusActions(status);

  // Every seat filled? Nudge to mark the job Filled (the owner chose "prompt",
  // not auto-close). `positions` is nullable on imported jobs → treat as 1.
  const seatsTarget = positions && positions > 0 ? positions : 1;
  const fillAction = actions.find((a) => a.next === "FILLED");
  const seatsFilled = activePlacementCount >= seatsTarget && Boolean(fillAction);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={jobId} />
      {seatsFilled && fillAction && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-sm text-emerald-800">
            All{" "}
            <strong>
              {seatsTarget} position{seatsTarget === 1 ? "" : "s"}
            </strong>{" "}
            {seatsTarget === 1 ? "is" : "are"} filled
            {activePlacementCount > seatsTarget
              ? ` (${activePlacementCount} active placements)`
              : ""}
            . Mark this job Filled?
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => onAction(fillAction)}
            className={buttonClass("primary", "sm")}
          >
            Mark filled
          </button>
        </div>
      )}
      <input type="hidden" name="status" value={target} />
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((a) => (
          <button
            key={a.next}
            type="button"
            disabled={pending}
            onClick={() => onAction(a)}
            className={actionClass(a.tone)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
        >
          {state.error}
        </p>
      )}

      {confirming && (
        <Dialog
          open
          onClose={() => setConfirming(null)}
          title={`${confirming.label}?`}
          description={`This sets the job's status to ${JOB_STATUS_LABEL[confirming.next]}. You can reopen it later.`}
        >
          {willCascade(confirming) && (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {openVprCount > 0 && (
                <>
                  This{" "}
                  {confirming.next === "FILLED"
                    ? "closes"
                    : "cancels"}{" "}
                  <strong>
                    {openVprCount} open requirement
                    {openVprCount === 1 ? "" : "s"}
                  </strong>{" "}
                  on this job
                  {confirming.next === "FILLED" ? " as fulfilled" : ""}.{" "}
                </>
              )}
              {inFlightCount > 0 && (
                <>
                  <strong>
                    {inFlightCount} candidate{inFlightCount === 1 ? "" : "s"}
                  </strong>{" "}
                  {inFlightCount === 1 ? "is" : "are"} still in the pipeline —
                  they stay, but the job will be {JOB_STATUS_LABEL[confirming.next].toLowerCase()}.
                </>
              )}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={buttonClass("secondary")}
              onClick={() => setConfirming(null)}
            >
              Keep as is
            </button>
            <button
              type="button"
              className={buttonClass("danger")}
              onClick={() => {
                const next = confirming.next;
                setConfirming(null);
                submit(next);
              }}
            >
              {confirming.label}
            </button>
          </div>
        </Dialog>
      )}
    </form>
  );
}
