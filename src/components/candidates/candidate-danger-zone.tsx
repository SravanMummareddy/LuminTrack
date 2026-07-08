"use client";

import { useActionState, useState } from "react";
import { Trash2, Download, AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, buttonClass } from "@/components/ui/button";
import { trashCandidate } from "@/server/actions/candidates";
import { EMPTY_FORM_STATE } from "@/lib/form-state";

export function CandidateDangerZone({
  candidateId,
  candidateName,
  retentionDays,
}: {
  candidateId: string;
  candidateName: string;
  retentionDays: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    trashCandidate,
    EMPTY_FORM_STATE,
  );
  const archiveHref = `/api/candidates/${candidateId}/archive`;

  return (
    <section className="overflow-hidden rounded-lg border border-red-200">
      <div className="flex items-center gap-1.5 bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        Danger zone
      </div>
      <div className="space-y-4 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-800">
              Download archive
            </div>
            <p className="text-xs text-slate-500">
              Zip of profile, submissions, and all document files — to your device.
            </p>
          </div>
          <a href={archiveHref} className={buttonClass("secondary")}>
            <Download className="h-4 w-4" aria-hidden />
            Download archive
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div>
            <div className="text-sm font-medium text-slate-800">
              Delete candidate
            </div>
            <p className="text-xs text-slate-500">
              Moves to trash, hidden from everyone. Restorable for {retentionDays}{" "}
              days, then permanently erased (files shredded).
            </p>
          </div>
          <Button variant="danger" onClick={() => setOpen(true)}>
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete
          </Button>
        </div>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${candidateName}?`}
      >
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={candidateId} />
          <p className="text-sm text-slate-600">
            This moves the candidate to trash — hidden from lists, submissions,
            and search. You can restore them for{" "}
            <span className="font-medium text-slate-900">
              {retentionDays} days
            </span>
            , after which they&apos;re permanently erased and their files
            shredded.
          </p>

          <a
            href={archiveHref}
            className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download the archive first if you want a copy.
          </a>

          {state.error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Moving to trash…" : "Move to trash"}
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
