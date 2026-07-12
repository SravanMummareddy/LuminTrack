"use client";

import { useActionState, useEffect } from "react";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
  uploadCandidateResume,
  updateCandidateResume,
} from "@/server/actions/resumes";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { RESUME_ACCEPT, RESUME_MAX_BYTES } from "@/lib/validation/resume";
import type { ResumeKind } from "@/generated/prisma/enums";

export type ResumeData = {
  id: string;
  label: string;
  kind: ResumeKind;
};

const MAX_MB = Math.round(RESUME_MAX_BYTES / (1024 * 1024));

/**
 * Add / edit dialog form for a candidate's résumé. "Add" uploads a file to
 * private Blob (label + file); "Edit" only renames it — the uploaded file can't
 * be swapped in place, so re-upload for a new version.
 */
export function ResumeForm({
  candidateId,
  resume,
  onDone,
}: {
  candidateId: string;
  resume?: ResumeData;
  onDone: () => void;
}) {
  const isEdit = Boolean(resume);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateCandidateResume : uploadCandidateResume,
    EMPTY_FORM_STATE,
  );

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="candidateId" value={candidateId} />
      {resume && <input type="hidden" name="id" value={resume.id} />}

      <Field label="Label" htmlFor="label" required error={errors.label}>
        <Input
          id="label"
          name="label"
          defaultValue={resume?.label ?? ""}
          placeholder="e.g. Backend Engineer"
          required
        />
      </Field>

      <Field
        label="Type"
        hint="Original = the candidate's authentic résumé. Marketing = a reformatted version. A candidate should have an Original on file before being submitted."
        error={errors.kind}
      >
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
          {(
            [
              { value: "ORIGINAL", label: "Original" },
              { value: "MARKETING", label: "Marketing" },
            ] as const
          ).map((opt, i) => (
            <label key={opt.value} className={i > 0 ? "border-l border-slate-300" : ""}>
              <input
                type="radio"
                name="kind"
                value={opt.value}
                defaultChecked={(resume?.kind ?? "ORIGINAL") === opt.value}
                className="peer sr-only"
              />
              <span className="block cursor-pointer px-4 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 peer-checked:bg-indigo-50 peer-checked:font-medium peer-checked:text-indigo-700">
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      </Field>

      {!isEdit && (
        <Field
          label="Resume file"
          htmlFor="file"
          required
          hint={`PDF or Word document (.pdf, .doc, .docx), up to ${MAX_MB} MB.`}
          error={errors.file}
        >
          <input
            id="file"
            name="file"
            type="file"
            accept={RESUME_ACCEPT}
            required
            className="block w-full rounded-md border border-slate-300 text-sm text-slate-700 file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
        </Field>
      )}

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? isEdit
              ? "Saving…"
              : "Uploading…"
            : isEdit
              ? "Save changes"
              : "Upload resume"}
        </Button>
      </div>
    </form>
  );
}
