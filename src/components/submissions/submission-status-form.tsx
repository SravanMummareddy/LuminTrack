"use client";

import { useState } from "react";
import { Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { changeSubmissionStatus } from "@/server/actions/submissions";
import { SUBMISSION_STATUSES, SUBMISSION_STATUS_LABEL } from "@/lib/labels";
import type { SubmissionStatus } from "@/generated/prisma/enums";

/**
 * Status update control on the submission detail page. Controlled inputs —
 * React 19 resets uncontrolled <form action> fields after submit, and a
 * rejection reason must survive until the page revalidates.
 */
export function SubmissionStatusForm({
  submissionId,
  status,
  rejectionReason,
}: {
  submissionId: string;
  status: SubmissionStatus;
  rejectionReason: string;
}) {
  const [selected, setSelected] = useState<SubmissionStatus>(status);
  const [reason, setReason] = useState(rejectionReason);

  return (
    <form action={changeSubmissionStatus} className="space-y-3">
      <input type="hidden" name="id" value={submissionId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-56">
          <label
            htmlFor="status"
            className="mb-1 block text-xs font-medium text-slate-500"
          >
            Submission status
          </label>
          <Select
            id="status"
            name="status"
            value={selected}
            onChange={(e) => setSelected(e.target.value as SubmissionStatus)}
          >
            {SUBMISSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUBMISSION_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Update
        </Button>
      </div>

      {selected === "REJECTED" && (
        <div className="max-w-md">
          <label
            htmlFor="rejectionReason"
            className="mb-1 block text-xs font-medium text-slate-500"
          >
            Rejection reason
          </label>
          <Textarea
            id="rejectionReason"
            name="rejectionReason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why was the candidate rejected?"
          />
        </div>
      )}
    </form>
  );
}
