import { RotateCcw, Download, AlertTriangle } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { restoreJobFromTrash } from "@/server/actions/jobs";
import { JobEraseButton } from "@/components/jobs/job-erase-button";

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
              <SubmitButton pendingLabel="Restoring…">
                <RotateCcw className="h-4 w-4" aria-hidden />
                Restore
              </SubmitButton>
            </form>
            <JobEraseButton jobId={jobId} jobTitle={jobTitle} />
          </div>
        )}
      </div>
    </section>
  );
}
