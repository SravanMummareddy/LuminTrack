"use client";

import { useActionState, useState } from "react";
import { Trash2, Download, AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, buttonClass } from "@/components/ui/button";
import { trashJob } from "@/server/actions/jobs";
import { isTerminalJobStatus } from "@/lib/job-flow";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import type { JobStatus } from "@/generated/prisma/enums";

/**
 * Danger zone on a live job's detail page (admin only). Download archive + Move
 * to trash. Trashing is only available once the job is retired (Closed / Filled
 * / Cancelled) — the ladder is Open → Close → Trash → Erase, and erasing happens
 * only from the trash banner, never here.
 */
export function JobDangerZone({
  jobId,
  jobTitle,
  retentionDays,
  status,
  openVprCount = 0,
  inFlightCount = 0,
  activePlacementCount = 0,
}: {
  jobId: string;
  jobTitle: string;
  retentionDays: number;
  status: JobStatus;
  /** Open VPRs — auto-cancelled on trash. */
  openVprCount?: number;
  /** Non-terminal submissions — kept, but flagged so the admin knows. */
  inFlightCount?: number;
  /** Active/extended placements — these BLOCK the trash server-side. */
  activePlacementCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    trashJob,
    EMPTY_FORM_STATE,
  );
  const archiveHref = `/api/jobs/${jobId}/archive`;
  const retired = isTerminalJobStatus(status);
  const blockedByPlacement = activePlacementCount > 0;
  const hasLinks = openVprCount > 0 || inFlightCount > 0;

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
              Zip of the requisition + its submissions and requirements — to your device.
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
              Move to trash
            </div>
            <p className="text-xs text-slate-500">
              Hidden from everyone, restorable for {retentionDays} days, then
              permanently erased.
            </p>
          </div>
          <Button variant="danger" onClick={() => setOpen(true)}>
            <Trash2 className="h-4 w-4" aria-hidden />
            Move to trash
          </Button>
        </div>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Move "${jobTitle}" to trash?`}
      >
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={jobId} />
          {!retired && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This job is still open. Moving it to trash will{" "}
              <strong>close</strong> it first, then hide it.
            </p>
          )}
          <p className="text-sm text-slate-600">
            The job is hidden from lists, search, and reports. You can restore it
            for{" "}
            <span className="font-medium text-slate-900">
              {retentionDays} days
            </span>
            , after which it&apos;s permanently erased. Its open requirements are
            cancelled; submissions are kept.
          </p>

          {blockedByPlacement ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              This job has{" "}
              <strong>
                {activePlacementCount} active placement
                {activePlacementCount === 1 ? "" : "s"}
              </strong>{" "}
              — end{activePlacementCount === 1 ? " it" : " them"} before moving
              the job to trash.
            </p>
          ) : hasLinks ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Still linked to this job:
              <ul className="mt-1 list-disc pl-5">
                {openVprCount > 0 && (
                  <li>
                    <strong>
                      {openVprCount} open requirement
                      {openVprCount === 1 ? "" : "s"}
                    </strong>{" "}
                    — will be cancelled
                  </li>
                )}
                {inFlightCount > 0 && (
                  <li>
                    <strong>
                      {inFlightCount} candidate{inFlightCount === 1 ? "" : "s"} in
                      the pipeline
                    </strong>{" "}
                    — kept (their submissions stay)
                  </li>
                )}
              </ul>
            </div>
          ) : null}

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
            <Button
              type="submit"
              variant="danger"
              disabled={pending || blockedByPlacement}
            >
              {pending
                ? "Moving to trash…"
                : retired
                  ? "Move to trash"
                  : "Close & move to trash"}
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
