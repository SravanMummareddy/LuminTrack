"use client";

import { useState } from "react";
import { Select, Textarea, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { changeSubmissionStatus } from "@/server/actions/submissions";
import {
  SUBMISSION_STATUSES,
  SUBMISSION_STATUS_LABEL,
  STATUS_CHANGE_REASONS,
  STATUS_CHANGE_REASON_LABEL,
} from "@/lib/labels";
import type { SubmissionStatus } from "@/generated/prisma/enums";

const labelClass = "mb-1 block text-xs font-medium text-slate-500";

/**
 * Status update control on the submission detail page. Alongside the new
 * status it records when the change actually happened, an optional note, and
 * — for Rejected / On Hold — a reason. Controlled inputs: React 19 resets
 * uncontrolled <form action> fields after submit, and these must survive until
 * the page revalidates. The parent keys this form by status, so a committed
 * change remounts it with fresh fields.
 */
export function SubmissionStatusForm({
  submissionId,
  status,
}: {
  submissionId: string;
  status: SubmissionStatus;
}) {
  const [selected, setSelected] = useState<SubmissionStatus>(status);
  const [eventAt, setEventAt] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  const showReason = selected === "REJECTED" || selected === "ON_HOLD";

  return (
    <form action={changeSubmissionStatus} className="space-y-3">
      <input type="hidden" name="id" value={submissionId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-56">
          <label htmlFor="status" className={labelClass}>
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
        <div className="w-56">
          <label htmlFor="eventAt" className={labelClass}>
            When this happened
          </label>
          <Input
            id="eventAt"
            name="eventAt"
            type="datetime-local"
            value={eventAt}
            onChange={(e) => setEventAt(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary">
          Update
        </Button>
      </div>
      <p className="text-xs text-slate-400">
        Set &ldquo;when this happened&rdquo; only if the change occurred earlier
        than now — otherwise leave it blank.
      </p>

      {showReason && (
        <div className="w-56">
          <label htmlFor="reason" className={labelClass}>
            Reason
          </label>
          <Select
            id="reason"
            name="reason"
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

      <div className="max-w-md">
        <label htmlFor="note" className={labelClass}>
          Note
        </label>
        <Textarea
          id="note"
          name="note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            selected === "REJECTED"
              ? "Why was the candidate rejected?"
              : "Optional note about this change"
          }
        />
      </div>
    </form>
  );
}
