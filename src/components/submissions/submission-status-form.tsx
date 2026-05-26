"use client";

import { useEffect, useState, useTransition } from "react";
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

/** Current local date/time as a `datetime-local` input value. */
function nowDateTimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

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
  const [expectedJoinDate, setExpectedJoinDate] = useState("");
  const [actualJoinDate, setActualJoinDate] = useState("");
  // `changeSubmissionStatus` returns void, so we use a transition to get
  // a pending flag without changing the action signature. The submit
  // button disables + relabels mid-flight, killing the double-click risk
  // that would otherwise let a slow demo network log duplicate audit rows.
  const [isPending, startTransition] = useTransition();

  // Default "when this happened" to now. This must run after mount, not in a
  // useState initializer: the client's local "now" is unknown during SSR, so
  // seeding it on the server would trip a hydration mismatch on the input.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only initial value
    setEventAt(nowDateTimeLocal());
  }, []);

  const showReason = selected === "REJECTED" || selected === "ON_HOLD";
  const showExpectedJoin = selected === "OFFER_ACCEPTED";
  const showActualJoin = selected === "JOINED";

  return (
    <form
      action={(formData) =>
        startTransition(() => changeSubmissionStatus(formData))
      }
      className="space-y-3"
    >
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
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? "Updating…" : "Update"}
        </Button>
      </div>
      <p className="text-xs text-slate-400">
        &ldquo;When this happened&rdquo; defaults to now — adjust it if the
        change actually happened earlier. To correct the original{" "}
        <strong>submitted date</strong>, use{" "}
        <a
          href={`/submissions/${submissionId}/edit`}
          className="text-indigo-600 hover:underline"
        >
          Edit submission
        </a>
        .
      </p>

      {showExpectedJoin && (
        <div className="w-56">
          <label htmlFor="expectedJoinDate" className={labelClass}>
            Expected join date
          </label>
          <Input
            id="expectedJoinDate"
            name="expectedJoinDate"
            type="date"
            value={expectedJoinDate}
            onChange={(e) => setExpectedJoinDate(e.target.value)}
          />
        </div>
      )}

      {showActualJoin && (
        <div className="w-56">
          <label htmlFor="actualJoinDate" className={labelClass}>
            Actual join date
          </label>
          <Input
            id="actualJoinDate"
            name="actualJoinDate"
            type="date"
            value={actualJoinDate}
            onChange={(e) => setActualJoinDate(e.target.value)}
          />
        </div>
      )}

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
