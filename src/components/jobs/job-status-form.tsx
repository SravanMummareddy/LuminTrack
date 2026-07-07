"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { changeJobStatus } from "@/server/actions/jobs";
import { JOB_STATUS_LABEL } from "@/lib/labels";
import { jobStatusActions, type JobStatusAction } from "@/lib/job-flow";
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
}: {
  jobId: string;
  status: JobStatus;
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

  function onAction(a: JobStatusAction) {
    if (a.confirm) setConfirming(a);
    else submit(a.next);
  }

  const actions = jobStatusActions(status);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={jobId} />
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
