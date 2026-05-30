"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { Button, buttonClass } from "@/components/ui/button";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";
import { isLikelyDriveUrl, DRIVE_LINK_WARNING } from "@/lib/validation/resume";

type ResumeOption = { id: string; label: string; driveLink: string };

type SubmissionAction = (
  prev: FormState,
  formData: FormData,
) => Promise<FormState>;

type RecruiterOption = { id: string; fullName: string; isActive: boolean };

type EditValues = {
  candidateRate: string;
  // "" = no résumé, "__new__" = add a new one, otherwise a saved résumé id.
  resumeSelection: string;
  submissionNotes: string;
  /** The raw submitted date — converted to a datetime-local value in the form. */
  submittedAt: Date | string;
  /** The current submitting recruiter — only editable when canReattribute. */
  submittedById: string;
};

type Fields = {
  candidateRate: string;
  resumeSelection: string;
  submissionNotes: string;
  submittedAt: string;
  submittedById: string;
  newResumeLabel: string;
  newResumeLink: string;
};

const NEW_RESUME = "__new__";

/** Converts a stored date into a `datetime-local` input value in the browser's timezone. */
function toDateTimeLocal(value: Date | string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
        {value}
      </p>
    </div>
  );
}

export function SubmissionEditForm({
  action,
  submissionId,
  candidateName,
  jobTitle,
  recruiterName,
  canReattribute = false,
  recruiters = [],
  resumes,
  values,
}: {
  action: SubmissionAction;
  submissionId: string;
  candidateName: string;
  jobTitle: string;
  recruiterName: string;
  /** Admins may correct the submitting recruiter; recruiters see it locked. */
  canReattribute?: boolean;
  recruiters?: RecruiterOption[];
  resumes: ResumeOption[];
  values: EditValues;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  // Inputs are controlled — a validation error returns without redirecting, and
  // React 19 would otherwise reset the uncontrolled fields.
  const [fields, setFields] = useState<Fields>({
    candidateRate: values.candidateRate,
    resumeSelection: values.resumeSelection,
    submissionNotes: values.submissionNotes,
    submittedAt: toDateTimeLocal(values.submittedAt),
    submittedById: values.submittedById,
    newResumeLabel: "",
    newResumeLink: "",
  });
  const set =
    (name: keyof Fields) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setFields((f) => ({ ...f, [name]: e.target.value }));

  // React 19 auto-resets the <form> after each action completes. This form
  // redirects on success, but a validation error returns without redirecting —
  // and then controlled <select>s do NOT re-sync (form.reset() snaps them to
  // their first option and React skips the DOM write because the value prop is
  // unchanged). That would silently mis-attribute the name-bearing "Submitted
  // by" select (now also backstopped by a hidden input below). Bump a key on
  // each action response so the selects remount and re-apply their controlled
  // value. MUST run in an effect — the reset fires AFTER commit, so a
  // render-time re-key would be clobbered by it. (Mirrors submission-form.tsx.)
  const [selectSyncKey, setSelectSyncKey] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectSyncKey((k) => k + 1);
  }, [state]);

  const errors = state.fieldErrors ?? {};
  const resumeChoice =
    fields.resumeSelection === ""
      ? "none"
      : fields.resumeSelection === NEW_RESUME
        ? "new"
        : "existing";

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={submissionId} />
      <input type="hidden" name="resumeChoice" value={resumeChoice} />
      <input
        type="hidden"
        name="candidateResumeId"
        value={resumeChoice === "existing" ? fields.resumeSelection : ""}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <LockedField label="Candidate" value={candidateName} />
        <LockedField label="Job" value={jobTitle} />
        {canReattribute ? (
          <Field
            label="Submitted by"
            htmlFor="submittedById"
            hint="Admin: correct who this submission is credited to."
            error={errors.submittedById}
          >
            {/* Backstop: the visible select is presentational (no name) so a
                post-action form reset can't diverge the submitted value from
                state. The hidden input is the one that's actually submitted. */}
            <input
              type="hidden"
              name="submittedById"
              value={fields.submittedById}
            />
            <Select
              key={`submittedBy-${selectSyncKey}`}
              id="submittedById"
              value={fields.submittedById}
              onChange={set("submittedById")}
            >
              {recruiters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.isActive ? r.fullName : `${r.fullName} (inactive)`}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <LockedField label="Submitted by" value={recruiterName} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Submitted date"
          htmlFor="submittedAt"
          required
          error={errors.submittedAt}
        >
          <Input
            id="submittedAt"
            name="submittedAt"
            type="datetime-local"
            value={fields.submittedAt}
            onChange={set("submittedAt")}
            required
          />
        </Field>

        <Field
          label="Candidate rate"
          htmlFor="candidateRate"
          error={errors.candidateRate}
        >
          <Input
            id="candidateRate"
            name="candidateRate"
            type="number"
            min="0"
            step="0.01"
            value={fields.candidateRate}
            onChange={set("candidateRate")}
          />
        </Field>
      </div>

      <Field
        label="Resume"
        htmlFor="resumeSelection"
        hint="Pick one of the candidate's saved resumes, add a new one, or leave as no resume."
        error={errors.candidateResumeId}
      >
        <Select
          key={`resumeSelection-${selectSyncKey}`}
          id="resumeSelection"
          value={fields.resumeSelection}
          onChange={set("resumeSelection")}
        >
          <option value="">No resume</option>
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
          <option value={NEW_RESUME}>+ Add a new resume</option>
        </Select>
      </Field>

      {resumeChoice === "new" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="New resume label"
            htmlFor="newResumeLabel"
            required
            error={errors.newResumeLabel}
          >
            <Input
              id="newResumeLabel"
              name="newResumeLabel"
              value={fields.newResumeLabel}
              onChange={set("newResumeLabel")}
              placeholder="e.g. Backend Engineer"
            />
          </Field>
          <Field
            label="New resume — Google Drive link"
            htmlFor="newResumeLink"
            required
            error={errors.newResumeLink}
          >
            <Input
              id="newResumeLink"
              name="newResumeLink"
              type="url"
              value={fields.newResumeLink}
              onChange={set("newResumeLink")}
              placeholder="https://drive.google.com/file/d/…"
            />
            {!isLikelyDriveUrl(fields.newResumeLink) && (
              <p className="mt-1 text-xs text-amber-700">{DRIVE_LINK_WARNING}</p>
            )}
          </Field>
        </div>
      )}

      <Field
        label="Submission notes"
        htmlFor="submissionNotes"
        error={errors.submissionNotes}
      >
        <Textarea
          id="submissionNotes"
          name="submissionNotes"
          rows={3}
          value={fields.submissionNotes}
          onChange={set("submissionNotes")}
        />
      </Field>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <Link
          href={`/submissions/${submissionId}`}
          className={buttonClass("secondary")}
        >
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
