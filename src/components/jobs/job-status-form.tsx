"use client";

import { useActionState, useEffect, useState } from "react";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { changeJobStatus } from "@/server/actions/jobs";
import { JOB_STATUSES, JOB_STATUS_LABEL } from "@/lib/labels";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import type { JobStatus } from "@/generated/prisma/enums";

/**
 * Job-status control on the job detail page. The action used to be a `void`
 * direct-form action that saved silently; it now returns a `FormState` so we
 * can confirm the change with a toast and surface a no-op / error inline.
 */
export function JobStatusForm({
  jobId,
  status,
}: {
  jobId: string;
  status: JobStatus;
}) {
  const [selected, setSelected] = useState<JobStatus>(status);
  const [state, formAction, pending] = useActionState(
    changeJobStatus,
    EMPTY_FORM_STATE,
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok && state.toast)
      toast({ tone: "success", title: state.toast.title });
  }, [state, toast]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={jobId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-48">
          <label
            htmlFor="status"
            className="mb-1 block text-xs font-medium text-slate-500"
          >
            Update job status
          </label>
          <Select
            id="status"
            name="status"
            value={selected}
            onChange={(e) => setSelected(e.target.value as JobStatus)}
          >
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {JOB_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Updating…" : "Update"}
        </Button>
      </div>
      {state.error && (
        <p
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
