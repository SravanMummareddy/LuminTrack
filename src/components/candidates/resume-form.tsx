"use client";

import { useActionState, useEffect, useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
  createCandidateResume,
  updateCandidateResume,
} from "@/server/actions/resumes";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { isLikelyDriveUrl, DRIVE_LINK_WARNING } from "@/lib/validation/resume";

export type ResumeData = {
  id: string;
  label: string;
  driveLink: string;
};

/** Add / edit dialog form for a candidate's saved résumé. */
export function ResumeForm({
  candidateId,
  resume,
  onDone,
}: {
  candidateId: string;
  resume?: ResumeData;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    resume ? updateCandidateResume : createCandidateResume,
    EMPTY_FORM_STATE,
  );

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const errors = state.fieldErrors ?? {};
  const [driveLink, setDriveLink] = useState(resume?.driveLink ?? "");
  const showDriveWarning = !isLikelyDriveUrl(driveLink);

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
        label="Resume — Google Drive link"
        htmlFor="driveLink"
        required
        hint="Paste a shared Drive link; it previews on the candidate page."
        error={errors.driveLink}
      >
        <Input
          id="driveLink"
          name="driveLink"
          type="url"
          value={driveLink}
          onChange={(e) => setDriveLink(e.target.value)}
          placeholder="https://drive.google.com/file/d/…"
          required
        />
        {showDriveWarning && (
          <p className="mt-1 text-xs text-amber-700">{DRIVE_LINK_WARNING}</p>
        )}
      </Field>

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
          {pending ? "Saving…" : resume ? "Save changes" : "Add resume"}
        </Button>
      </div>
    </form>
  );
}
