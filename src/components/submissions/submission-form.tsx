"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { Button, buttonClass } from "@/components/ui/button";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";
import { isLikelyDriveUrl, DRIVE_LINK_WARNING } from "@/lib/validation/resume";
import { OVERRIDE_REASONS, OVERRIDE_REASON_LABEL } from "@/lib/labels";

type ResumeOption = { id: string; label: string; driveLink: string };
type CandidateOption = {
  id: string;
  fullName: string;
  alreadySubmitted: boolean;
  resumes: ResumeOption[];
};
type Recruiter = { id: string; fullName: string; isActive: boolean };

type SubmissionAction = (
  prev: FormState,
  formData: FormData,
) => Promise<FormState>;

type Fields = {
  candidateId: string;
  submittedById: string;
  candidateRate: string;
  // "" = no résumé, "__new__" = add a new one, otherwise a saved résumé id.
  resumeSelection: string;
  newResumeLabel: string;
  newResumeLink: string;
  submissionNotes: string;
  // Set only when a gate (duplicate / iLabor) paused the submit.
  overridePreset: string;
  overrideNote: string;
};

const NEW_RESUME = "__new__";

export function SubmissionForm({
  action,
  jobId,
  candidates,
  recruiters,
  defaultRecruiterId,
  defaultCandidateRate,
}: {
  action: SubmissionAction;
  jobId: string;
  candidates: CandidateOption[];
  recruiters: Recruiter[];
  defaultRecruiterId: string;
  defaultCandidateRate: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  // Inputs are controlled — a duplicate-submission error returns without
  // redirecting, and React 19 would otherwise reset the uncontrolled fields.
  const [fields, setFields] = useState<Fields>({
    candidateId: "",
    submittedById: defaultRecruiterId,
    candidateRate: defaultCandidateRate,
    resumeSelection: "",
    newResumeLabel: "",
    newResumeLink: "",
    submissionNotes: "",
    overridePreset: "",
    overrideNote: "",
  });
  const set =
    (name: keyof Fields) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setFields((f) => ({ ...f, [name]: e.target.value }));

  // Switching candidate clears the résumé pick — a résumé belongs to one candidate.
  const onCandidateChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
    setFields((f) => ({
      ...f,
      candidateId: e.target.value,
      resumeSelection: "",
      newResumeLabel: "",
      newResumeLink: "",
    }));

  const errors = state.fieldErrors ?? {};
  const resumes =
    candidates.find((c) => c.id === fields.candidateId)?.resumes ?? [];
  const resumeChoice =
    fields.resumeSelection === ""
      ? "none"
      : fields.resumeSelection === NEW_RESUME
        ? "new"
        : "existing";

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="resumeChoice" value={resumeChoice} />
      <input
        type="hidden"
        name="candidateResumeId"
        value={resumeChoice === "existing" ? fields.resumeSelection : ""}
      />

      <Field
        label="Candidate"
        htmlFor="candidateId"
        required
        error={errors.candidateId}
        hint="Candidates already submitted to this job cannot be picked again."
      >
        <Select
          id="candidateId"
          name="candidateId"
          value={fields.candidateId}
          onChange={onCandidateChange}
          required
        >
          <option value="" disabled>
            Select a candidate…
          </option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id} disabled={c.alreadySubmitted}>
              {c.alreadySubmitted
                ? `${c.fullName} (already submitted)`
                : c.fullName}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Submitted by"
          htmlFor="submittedById"
          required
          error={errors.submittedById}
        >
          <Select
            id="submittedById"
            name="submittedById"
            value={fields.submittedById}
            onChange={set("submittedById")}
            required
          >
            <option value="" disabled>
              Select a recruiter…
            </option>
            {recruiters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.isActive ? r.fullName : `${r.fullName} (inactive)`}
              </option>
            ))}
          </Select>
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
          id="resumeSelection"
          value={fields.resumeSelection}
          onChange={set("resumeSelection")}
          disabled={!fields.candidateId}
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

      {state.needsConfirm && state.needsConfirm !== true && (() => {
        // The gate kind comes typed from the server (no error-string sniffing).
        // Duplicate overrides and iLabor overrides are recorded under different
        // audit fields, so the composed reason goes to the matching field name.
        const gate = state.needsConfirm;
        const fieldName =
          gate === "duplicate" ? "duplicateReason" : "ilaborOverrideReason";
        // Persist the preset code (analyzable) plus an optional note in parens.
        const composed =
          fields.overridePreset === ""
            ? ""
            : fields.overridePreset +
              (fields.overrideNote.trim()
                ? ` (${fields.overrideNote.trim()})`
                : "");
        return (
          <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">{state.error}</p>
            {gate === "duplicate" &&
              state.confirmData?.existingSubmissionId && (
                <Link
                  href={`/submissions/${state.confirmData.existingSubmissionId}`}
                  target="_blank"
                  className="inline-block text-sm font-medium text-amber-900 underline"
                >
                  View the existing submission →
                </Link>
              )}
            <input type="hidden" name={fieldName} value={composed} />
            <Field label="Reason" htmlFor="overridePreset" required>
              <Select
                id="overridePreset"
                value={fields.overridePreset}
                onChange={set("overridePreset")}
                required
              >
                <option value="" disabled>
                  Pick a reason…
                </option>
                {OVERRIDE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {OVERRIDE_REASON_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Note"
              htmlFor="overrideNote"
              hint="Optional — captured on the audit trail."
            >
              <Textarea
                id="overrideNote"
                rows={2}
                value={fields.overrideNote}
                onChange={set("overrideNote")}
              />
            </Field>
          </div>
        );
      })()}

      {state.error && !state.needsConfirm && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <Link href={`/jobs/${jobId}`} className={buttonClass("secondary")}>
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Submitting…"
            : state.needsConfirm
              ? "Submit anyway"
              : "Submit candidate"}
        </Button>
      </div>
    </form>
  );
}
