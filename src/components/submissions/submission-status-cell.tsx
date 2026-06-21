"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { Td } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { changeSubmissionStatus } from "@/server/actions/submissions";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import {
  SUBMISSION_STATUSES,
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STATUS_TONE,
  STATUS_CHANGE_REASONS,
  STATUS_CHANGE_REASON_LABEL,
} from "@/lib/labels";
import type { SubmissionStatus } from "@/generated/prisma/enums";

const labelClass = "mb-1 block text-xs font-medium text-slate-500";

/**
 * Inline status editor for the Submissions list "Status" column — modelled on
 * `JobRecruitersCell`. The badge is a button that opens a Dialog with a status
 * <Select> (plus a reason for Rejected / On Hold and an optional note), so a
 * recruiter can advance a submission without losing the list's filters/scroll.
 * The Server Action revalidates the list and a toast confirms the change
 * (including the placement id when a JOINED triggers one).
 */
export function SubmissionStatusCell({
  submissionId,
  status,
}: {
  submissionId: string;
  status: SubmissionStatus;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SubmissionStatus>(status);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const showReason = selected === "REJECTED" || selected === "ON_HOLD";

  const openPicker = () => {
    setSelected(status);
    setReason("");
    setNote("");
    setError(null);
    setOpen(true);
  };

  const onSave = () => {
    setError(null);
    if (selected === status) {
      setError("Pick a different status to update.");
      return;
    }
    const fd = new FormData();
    fd.set("id", submissionId);
    fd.set("status", selected);
    if (showReason && reason) fd.set("reason", reason);
    if (note) fd.set("note", note);
    startTransition(async () => {
      const res = await changeSubmissionStatus(EMPTY_FORM_STATE, fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.toast)
        toast({
          tone: "success",
          title: res.toast.title,
          description: res.toast.description,
        });
      setOpen(false);
    });
  };

  return (
    <Td label="Status">
      <button
        type="button"
        onClick={openPicker}
        aria-label={`Status: ${SUBMISSION_STATUS_LABEL[status]}. Click to change.`}
        className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:[outline-offset:-2px]"
      >
        <Badge tone={SUBMISSION_STATUS_TONE[status]}>
          {SUBMISSION_STATUS_LABEL[status]}
        </Badge>
        <ChevronDown className="h-3 w-3 flex-shrink-0 text-slate-400" />
      </button>

      <Dialog
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title="Update status"
        description="Advance this submission. The change is logged on its timeline. To backdate it or correct other fields, open the submission."
        className="max-w-sm"
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="inline-status" className={labelClass}>
              Submission status
            </label>
            <Select
              id="inline-status"
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

          {showReason && (
            <div>
              <label htmlFor="inline-reason" className={labelClass}>
                Reason
              </label>
              <Select
                id="inline-reason"
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

          <div>
            <label htmlFor="inline-note" className={labelClass}>
              Note
            </label>
            <Textarea
              id="inline-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note about this change"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className={buttonClass("ghost", "sm")}
          >
            Cancel
          </button>
          <Button type="button" onClick={onSave} disabled={pending} size="sm">
            {pending ? "Updating…" : "Update status"}
          </Button>
        </div>
      </Dialog>
    </Td>
  );
}
