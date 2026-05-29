"use client";

import { useActionState, useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Select, Textarea, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { changeSubmissionStatus } from "@/server/actions/submissions";
import {
  SUBMISSION_STATUSES,
  SUBMISSION_STATUS_LABEL,
  STATUS_CHANGE_REASONS,
  STATUS_CHANGE_REASON_LABEL,
} from "@/lib/labels";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
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
  // useActionState gives us the pending flag, error surface, and field errors
  // returned by the Server Action. Double-click protection: the submit
  // button disables mid-flight, so a slow network can't log duplicate audit
  // rows.
  const [state, formAction, isPending] = useActionState(
    changeSubmissionStatus,
    EMPTY_FORM_STATE,
  );
  const { toast } = useToast();

  // Default "when this happened" to now. This must run after mount, not in a
  // useState initializer: the client's local "now" is unknown during SSR, so
  // seeding it on the server would trip a hydration mismatch on the input.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only initial value
    setEventAt(nowDateTimeLocal());
  }, []);

  // Confirm the save — this action revalidates instead of redirecting, so the
  // status change used to land with zero feedback. `state` is a fresh object
  // per submit, so a second identical change still re-fires the toast.
  useEffect(() => {
    if (state.ok && state.toast) {
      toast({
        tone: "success",
        title: state.toast.title,
        description: state.toast.description,
      });
    }
  }, [state, toast]);

  const showReason = selected === "REJECTED" || selected === "ON_HOLD";
  const showExpectedJoin = selected === "OFFER_ACCEPTED";
  const showActualJoin = selected === "JOINED";

  return (
    <form action={formAction} className="space-y-3">
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
          <label
            htmlFor="eventAt"
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
      {state.error && (
        <p
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
        >
          {state.error}
        </p>
      )}
      <p className="text-xs text-slate-400">
        To correct the original <strong>submitted date</strong> (not this
        change), use{" "}
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
