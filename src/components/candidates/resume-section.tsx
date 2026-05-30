"use client";

import { useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmSubmit } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResumeForm, type ResumeData } from "./resume-form";
import {
  archiveCandidateResume,
  restoreCandidateResume,
  deleteCandidateResume,
} from "@/server/actions/resumes";
import { toDrivePreviewUrl } from "@/lib/resume";

export type ResumeItem = ResumeData & {
  submissionCount: number;
  isActive: boolean;
};

/**
 * The candidate's résumé library — add / edit / archive saved résumés, each a
 * labelled Google Drive link. Archiving (soft delete) keeps the row so any
 * submission that used it stays linked; archived résumés are hidden behind a
 * toggle and are never offered in the submit picker. A résumé with no
 * submissions can be permanently deleted. Previews expand one at a time to
 * avoid loading several Drive iframes at once.
 */
export function ResumeSection({
  candidateId,
  resumes,
}: {
  candidateId: string;
  resumes: ResumeItem[];
}) {
  const [editing, setEditing] = useState<ResumeData | "new" | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = resumes.filter((r) => r.isActive);
  const archived = resumes.filter((r) => !r.isActive);

  const renderResume = (r: ResumeItem) => {
    const previewUrl = toDrivePreviewUrl(r.driveLink);
    const expanded = expandedId === r.id;
    const unused = r.submissionCount === 0;
    const usedLabel = `${r.submissionCount} submission${r.submissionCount === 1 ? "" : "s"}`;
    return (
      <li key={r.id} className="rounded-md border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">
                {r.label}
              </span>
              {!r.isActive && <Badge tone="slate">Archived</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">Used by {usedLabel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-sm font-medium">
            <a
              href={r.driveLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
            >
              Open
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : r.id)}
              className="text-slate-600 hover:text-slate-900"
            >
              {expanded ? "Hide preview" : "Preview"}
            </button>
            {r.isActive ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="text-indigo-600 hover:text-indigo-800"
                >
                  Edit
                </button>
                <ConfirmSubmit
                  action={archiveCandidateResume}
                  fields={{ id: r.id }}
                  title="Archive resume?"
                  description={`"${r.label}" will be hidden from the library and the submit picker, but it stays linked to its ${usedLabel}. You can restore it anytime.`}
                  confirmLabel="Archive"
                  tone="primary"
                  trigger="Archive"
                  triggerClassName="text-amber-700 hover:text-amber-900"
                />
              </>
            ) : (
              <form action={restoreCandidateResume}>
                <input type="hidden" name="id" value={r.id} />
                <button
                  type="submit"
                  className="text-indigo-600 hover:text-indigo-800"
                >
                  Restore
                </button>
              </form>
            )}
            {unused && (
              <ConfirmSubmit
                action={deleteCandidateResume}
                fields={{ id: r.id }}
                title="Delete resume permanently?"
                description={`"${r.label}" isn't used by any submission and will be permanently removed. This can't be undone.`}
                confirmLabel="Delete permanently"
                trigger="Delete"
                triggerClassName="text-red-600 hover:text-red-800"
              />
            )}
          </div>
        </div>

        {expanded &&
          (previewUrl ? (
            <iframe
              src={previewUrl}
              title={`${r.label} preview`}
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
              loading="lazy"
              className="mt-3 h-[70vh] w-full rounded-md border border-slate-200 md:h-[600px]"
            />
          ) : (
            <p className="mt-3 text-xs text-slate-500">
              Inline preview is available for Google Drive links only — use the
              Open link above.
            </p>
          ))}
      </li>
    );
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Resumes ({active.length})
        </h2>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" />
          Add resume
        </Button>
      </div>

      {active.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
          No active resumes. Add one so it can be picked when submitting this
          candidate to a job.
        </p>
      ) : (
        <ul className="space-y-3">{active.map(renderResume)}</ul>
      )}

      {archived.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowArchived((s) => !s)}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </button>
          {showArchived && (
            <ul className="mt-3 space-y-3">{archived.map(renderResume)}</ul>
          )}
        </div>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add resume" : "Edit resume"}
      >
        {editing !== null && (
          <ResumeForm
            candidateId={candidateId}
            resume={editing === "new" ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}
