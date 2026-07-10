import { Download, ShieldX, Archive } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-dialog";
import { ArchivePreviewModal } from "@/components/settings/archive-preview-modal";
import { removeCandidateArchive } from "@/server/actions/candidates";
import type { CandidateArchiveEntry } from "@/server/queries/candidate-archives";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Admin "recycle bin" for permanently-deleted candidates. Each row is a backup
 * zip that was written to private Blob just before the candidate was scrubbed —
 * download it to restore, or "Remove for good" to make it truly unrecoverable.
 */
export function DeletedCandidatesSection({
  archives,
}: {
  archives: CandidateArchiveEntry[];
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Archive className="h-4 w-4 text-slate-400" />
          Erased candidates
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Backups saved when a candidate was permanently erased. Download one to
          recover it, or remove it for good to make it unrecoverable.
        </p>
      </div>

      {archives.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No erased-candidate backups.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Candidate</th>
                <th className="px-4 py-2.5">Erased</th>
                <th className="px-4 py-2.5 text-right">Size</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {archives.map((a) => (
                <tr key={a.pathname} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                    {a.displayId}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {formatWhen(a.uploadedAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                    {formatBytes(a.size)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <ArchivePreviewModal
                        kind="candidate"
                        displayId={a.displayId}
                        pathname={a.pathname}
                        url={a.url}
                        downloadHref={`/api/candidates/archives/download?path=${encodeURIComponent(a.pathname)}`}
                        removeAction={removeCandidateArchive}
                      />
                      <a
                        href={`/api/candidates/archives/download?path=${encodeURIComponent(a.pathname)}`}
                        className={buttonClass("secondary")}
                      >
                        <Download className="h-4 w-4" aria-hidden />
                        Download
                      </a>
                      <ConfirmSubmit
                        action={removeCandidateArchive}
                        fields={{ pathname: a.pathname, url: a.url }}
                        title={`Remove backup ${a.displayId} for good?`}
                        description="This permanently removes the backup zip. After this, the candidate's data is unrecoverable."
                        confirmLabel="Remove for good"
                        triggerClassName={buttonClass("danger")}
                        trigger={
                          <>
                            <ShieldX className="h-4 w-4" aria-hidden />
                            Remove for good
                          </>
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
