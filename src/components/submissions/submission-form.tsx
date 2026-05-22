"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { Button, buttonClass } from "@/components/ui/button";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";

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
        <Link href={`/jobs/${jobId}`} className={buttonClass("secondary")}>
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Submitting…" : "Submit candidate"}
        </Button>
      </div>
    </form>
  );
}
