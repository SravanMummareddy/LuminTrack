"use client";

import { useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ResumeForm, type ResumeData } from "./resume-form";
import { deleteCandidateResume } from "@/server/actions/resumes";
import { toDrivePreviewUrl } from "@/lib/resume";

export type ResumeItem = ResumeData & { submissionCount: number };

/**
 * The candidate's résumé library — add / edit / delete saved résumés, each a
 * labelled Google Drive link. Previews expand one at a time to avoid loading
 * several Drive iframes at once.
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

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Resumes ({resumes.length})
        </h2>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" />
          Add resume
        </Button>
      </div>

      {resumes.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
          No resumes yet. Add one so it can be picked when submitting this
          candidate to a job.
        </p>
      ) : (
        <ul className="space-y-3">
          {resumes.map((r) => {
            const previewUrl = toDrivePreviewUrl(r.driveLink);
            const expanded = expandedId === r.id;
            return (
              <li key={r.id} className="rounded-md border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-slate-900">
                      {r.label}
                    </span>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Used by {r.submissionCount} submission
                      {r.submissionCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-sm font-medium">
                    <a
                      href={r.driveLink}
                      target="_blank"
                      rel="noreferrer"
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
                    <button
                      type="button"
                      onClick={() => setEditing(r)}
                      className="text-indigo-600 hover:text-indigo-800"
                    >
                      Edit
                    </button>
                    <form action={deleteCandidateResume}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        onClick={(e) => {
                          const msg =
                            r.submissionCount > 0
                              ? `Delete "${r.label}"? ${r.submissionCount} submission(s) used it — each keeps its own copy of the link.`
                              : `Delete "${r.label}"?`;
                          if (!window.confirm(msg)) e.preventDefault();
                        }}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>

                {expanded &&
                  (previewUrl ? (
                    <iframe
                      src={previewUrl}
                      title={`${r.label} preview`}
                      sandbox="allow-scripts allow-same-origin"
                      referrerPolicy="no-referrer"
                      className="mt-3 h-[70vh] w-full rounded-md border border-slate-200 md:h-[600px]"
                    />
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">
                      Inline preview is available for Google Drive links only —
                      use the Open link above.
                    </p>
                  ))}
              </li>
            );
          })}
        </ul>
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
