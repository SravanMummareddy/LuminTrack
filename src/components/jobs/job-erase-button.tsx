"use client";

import { useActionState, useState } from "react";
import { Trash2, Download } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { eraseJobNow } from "@/server/actions/jobs";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import type { Size } from "@/components/ui/button";

/**
 * Permanent-erase control for a job — the type-the-title guard + backup reminder,
 * shared by the trashed-job detail banner and the jobs Trash list so both flows
 * are identical. Erase backs up to Blob first, then removes an empty job or
 * tombstones one with submission history.
 */
export function JobEraseButton({
  jobId,
  jobTitle,
  size = "md",
  label = "Erase permanently",
}: {
  jobId: string;
  jobTitle: string;
  size?: Size;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, eraseAction, erasing] = useActionState(
    eraseJobNow,
    EMPTY_FORM_STATE,
  );
  const archiveHref = `/api/jobs/${jobId}/archive`;
  const titleMatches = typed.trim() === jobTitle;

  return (
    <>
      <Button variant="danger" size={size} onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" aria-hidden />
        {label}
      </Button>

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
          <a
            href={`/jobs/${jobId}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
          >
            Review full details first ↗
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
    </>
  );
}
