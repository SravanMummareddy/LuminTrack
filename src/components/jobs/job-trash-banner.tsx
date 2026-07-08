"use client";

import { useActionState, useState } from "react";
import { RotateCcw, Download, Trash2, AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { restoreJobFromTrash, eraseJobNow } from "@/server/actions/jobs";
import { EMPTY_FORM_STATE } from "@/lib/form-state";

/**
 * Banner shown on a trashed job's detail page. Restore (keeps its status) or —
 * the only place erase lives — Erase permanently (type the title to confirm),
 * which backs up to Blob then removes an empty job or tombstones one with
 * submission history. Mirrors CandidateTrashBanner.
 */
export function JobTrashBanner({
  jobId,
  jobTitle,
  deletedAt,
  retentionDays,
  canManage,
}: {
  jobId: string;
  jobTitle: string;
  deletedAt: string;
  retentionDays: number;
  canManage: boolean;
}) {
  const purgeMs = new Date(deletedAt).getTime() + retentionDays * 86_400_000;
  const purgeLabel = new Date(purgeMs).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const archiveHref = `/api/jobs/${jobId}/archive`;

  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, eraseAction, erasing] = useActionState(
    eraseJobNow,
    EMPTY_FORM_STATE,
  );
  const titleMatches = typed.trim() === jobTitle;

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
            aria-hidden
          />
          <div>
            <p className="text-sm font-medium text-amber-900">
              In trash — scheduled for permanent erasure
            </p>
            <p className="text-xs text-amber-800">
              This job auto-erases on {purgeLabel}. Restore it to keep it (comes
              back at its current status).
            </p>
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <a href={archiveHref} className={buttonClass("secondary")}>
              <Download className="h-4 w-4" aria-hidden />
              Download archive
            </a>
            <form action={restoreJobFromTrash}>
              <input type="hidden" name="id" value={jobId} />
              <button type="submit" className={buttonClass("primary")}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                Restore
              </button>
            </form>
            <Button variant="danger" onClick={() => setOpen(true)}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Erase permanently
            </Button>
          </div>
        )}
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Erase "${jobTitle}" permanently?`}
      >
        <form action={eraseAction} className="space-y-4">
          <input type="hidden" name="id" value={jobId} />
          <p className="text-sm text-slate-600">
            A backup is saved to Settings → Erased backups first. An empty job is
            removed entirely; a job with submissions becomes an anonymized
            &ldquo;Removed requisition&rdquo; so its history stays intact. This
            can&apos;t be undone.
          </p>
          <a
            href={archiveHref}
            className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download the archive first — this is your last chance.
          </a>
          <div>
            <label htmlFor="confirmTitle" className="text-xs text-slate-600">
              Type{" "}
              <span className="font-mono font-medium text-slate-900">
                {jobTitle}
              </span>{" "}
              to confirm
            </label>
            <Input
              id="confirmTitle"
              name="confirmTitle"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-1"
            />
            {state.fieldErrors?.confirmTitle && (
              <p className="mt-1 text-xs text-red-600">
                {state.fieldErrors.confirmTitle}
              </p>
            )}
          </div>
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
            <Button
              type="submit"
              variant="danger"
              disabled={erasing || !titleMatches}
            >
              {erasing ? "Erasing…" : "Erase permanently"}
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
