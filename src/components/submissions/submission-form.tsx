"use client";

import { useActionState, useEffect, useState } from "react";
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
  alreadySubmitted?: boolean;
  resumes: ResumeOption[];
};
type JobOption = {
  id: string;
  title: string;
  displayId: string;
  clientName: string | null;
  candidateRate: string;
};
type Recruiter = { id: string; fullName: string; isActive: boolean };

/**
 * One form, three entry points (Round 5). `mode` decides which of the two
 * anchor fields (candidate / job) is fixed:
 *   - "job-locked"       — from /jobs/[id]: job fixed, pick a candidate.
 *   - "candidate-locked" — from /candidates/[id]: candidate fixed, pick a job.
 *   - "open"             — from /submissions: pick both.
 */
type Mode = "job-locked" | "candidate-locked" | "open";

type SubmissionAction = (
  prev: FormState,
  formData: FormData,
) => Promise<FormState>;

type Fields = {
  candidateId: string;
  jobId: string;
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
  mode,
  job,
  candidate,
  jobOptions = [],
  candidates = [],
  recruiters,
  defaultRecruiterId,
  defaultCandidateRate,
  cancelHref,
}: {
  action: SubmissionAction;
  mode: Mode;
  /** The fixed job — required when mode === "job-locked". */
  job?: { id: string; title: string };
  /** The fixed candidate — required when mode === "candidate-locked". */
  candidate?: { id: string; fullName: string; resumes: ResumeOption[] };
  /** Job picker options — used when mode is "candidate-locked" or "open". */
  jobOptions?: JobOption[];
  /** Candidate picker options — used when mode is "job-locked" or "open". */
  candidates?: CandidateOption[];
  recruiters: Recruiter[];
  defaultRecruiterId: string;
  defaultCandidateRate: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  // Inputs are controlled — a gate (duplicate / not-assigned / iLabor) returns
  // without redirecting, and React 19 would otherwise reset uncontrolled fields.
  const [fields, setFields] = useState<Fields>({
    candidateId: candidate?.id ?? "",
    jobId: job?.id ?? "",
    submittedById: defaultRecruiterId,
    candidateRate: defaultCandidateRate,
    resumeSelection: "",
    newResumeLabel: "",
    newResumeLink: "",
    submissionNotes: "",
    overridePreset: "",
    overrideNote: "",
  });
  // Surfaced after a candidate switch clears a résumé pick, so the wipe isn't
  // silent (it used to vanish a freshly-typed Drive link with no warning).
  const [resumeCleared, setResumeCleared] = useState(false);
  // The rate prefills from the job's target rate. Flag it as an unconfirmed
  // default until the recruiter edits it, so they don't submit the job's
  // number as if it were the negotiated candidate rate.
  const [rateUnconfirmed, setRateUnconfirmed] = useState(
    defaultCandidateRate !== "",
  );
  // A recruiter who self-claims an unassigned job can hit a SECOND gate right
  // after (iLabor closed/cap, or a duplicate). The claim flag used to live only
  // inside the not-assigned prompt, so it was dropped on the next submit and the
  // action re-fired `not_assigned` — an inescapable loop that also discarded the
  // override reason. Once the recruiter chooses to claim, latch this and keep
  // claim=1 on every subsequent submit so they clear the assignment gate and
  // reach the real override. The actual assignment still only commits in the same
  // tx as the submission, so a claim is never persisted without a submission.
  const [claimIntent, setClaimIntent] = useState(false);
  // React 19 auto-resets the <form> after each action completes. Controlled
  // <input>s survive (their value prop is re-applied), but controlled <select>s
  // do NOT re-sync — form.reset() snaps them to their first option and React
  // skips the DOM write because its value prop is unchanged. That made every
  // select show the wrong option after a gate re-render (and previously caused
  // the name-bearing "Submitted by" select to SUBMIT the wrong recruiter —
  // submittedById is now also backstopped by a hidden input below).
  // Fix: bump a key on each action response so the selects remount and re-apply
  // their controlled value. This MUST run in an effect, not during render — the
  // form reset fires AFTER commit, so a render-time re-key gets clobbered by it.
  // The extra render is intentional and bounded to one per action response.
  const [selectSyncKey, setSelectSyncKey] = useState(0);
  useEffect(() => {
    // Re-key after React 19's post-action <form> reset, which only runs after
    // commit; a render-time bump would be clobbered by it. Bounded to one extra
    // render per action response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectSyncKey((k) => k + 1);
  }, [state]);

  const set =
    (name: keyof Fields) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setFields((f) => ({ ...f, [name]: e.target.value }));

  // Switching candidate clears the résumé pick — a résumé belongs to one
  // candidate. Warn if there was anything to lose rather than wiping silently.
  const onCandidateChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
    setFields((f) => {
      const hadResume =
        f.resumeSelection !== "" ||
        f.newResumeLabel.trim() !== "" ||
        f.newResumeLink.trim() !== "";
      setResumeCleared(hadResume);
      return {
        ...f,
        candidateId: e.target.value,
        resumeSelection: "",
        newResumeLabel: "",
        newResumeLink: "",
      };
    });

  // Picking a job in candidate-locked / open mode seeds the rate default from
  // that job (only when the recruiter hasn't already typed one).
  const onJobChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextJobId = e.target.value;
    const picked = jobOptions.find((j) => j.id === nextJobId);
    const seeded = fields.candidateRate === "" && !!picked?.candidateRate;
    setFields((f) => ({
      ...f,
      jobId: nextJobId,
      candidateRate: f.candidateRate === "" ? (picked?.candidateRate ?? "") : f.candidateRate,
    }));
    if (seeded) setRateUnconfirmed(true);
  };

  const errors = state.fieldErrors ?? {};

  // The candidate whose résumés the picker offers — the fixed one in
  // candidate-locked mode, otherwise whichever is selected.
  const activeCandidate =
    mode === "candidate-locked"
      ? candidate
      : candidates.find((c) => c.id === fields.candidateId);
  const resumes = activeCandidate?.resumes ?? [];
  const resumeChoice =
    fields.resumeSelection === ""
      ? "none"
      : fields.resumeSelection === NEW_RESUME
        ? "new"
        : "existing";

  // The effective ids the action receives, accounting for the locked anchors.
  const effectiveJobId = mode === "job-locked" ? (job?.id ?? "") : fields.jobId;
  const effectiveCandidateId =
    mode === "candidate-locked" ? (candidate?.id ?? "") : fields.candidateId;

  const gate = state.needsConfirm;
  const isGate = gate !== undefined && gate !== true;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="jobId" value={effectiveJobId} />
      <input type="hidden" name="candidateId" value={effectiveCandidateId} />
      <input type="hidden" name="submittedById" value={fields.submittedById} />
      {/* Persisted across gate transitions once the recruiter has claimed —
          see claimIntent above. Carries the self-claim through a second gate. */}
      {claimIntent && <input type="hidden" name="claim" value="1" />}
      <input type="hidden" name="resumeChoice" value={resumeChoice} />
      <input
        type="hidden"
        name="candidateResumeId"
        value={resumeChoice === "existing" ? fields.resumeSelection : ""}
      />

      {/* Job — fixed in job-locked mode, a picker otherwise. */}
      {mode === "job-locked" ? (
        <Field label="Job">
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {job?.title}
          </p>
        </Field>
      ) : (
        <Field
          label="Job"
          htmlFor="jobId"
          required
          error={errors.jobId}
          hint="Only jobs still open for submissions are listed."
        >
          <Select
            key={`jobId-${selectSyncKey}`}
            id="jobId"
            value={fields.jobId}
            onChange={onJobChange}
            required
          >
            <option value="" disabled>
              Select a job…
            </option>
            {jobOptions.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
                {j.clientName ? ` — ${j.clientName}` : ""} ({j.displayId})
              </option>
            ))}
          </Select>
        </Field>
      )}

      {/* Candidate — fixed in candidate-locked mode, a picker otherwise. */}
      {mode === "candidate-locked" ? (
        <Field label="Candidate">
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {candidate?.fullName}
          </p>
        </Field>
      ) : (
        <Field
          label="Candidate"
          htmlFor="candidateId"
          required
          error={errors.candidateId}
          hint={
            mode === "job-locked"
              ? "Candidates already submitted to this job cannot be picked again."
              : undefined
          }
        >
          <Select
            key={`candidateId-${selectSyncKey}`}
            id="candidateId"
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
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Submitted by"
          htmlFor="submittedById"
          required
          error={errors.submittedById}
        >
          <Select
            key={`submittedBy-${selectSyncKey}`}
            id="submittedById"
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
            onChange={(e) => {
              setRateUnconfirmed(false);
              set("candidateRate")(e);
            }}
          />
          {rateUnconfirmed && fields.candidateRate !== "" && (
            <p className="mt-1 text-xs text-amber-700">
              Prefilled from the job&apos;s target rate — confirm or adjust to
              the candidate&apos;s actual rate.
            </p>
          )}
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
          onChange={(e) => {
            setResumeCleared(false);
            set("resumeSelection")(e);
          }}
          disabled={!effectiveCandidateId}
        >
          <option value="">No resume</option>
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
          <option value={NEW_RESUME}>+ Add a new resume</option>
        </Select>
        {resumeCleared && (
          <p className="mt-1 text-xs text-amber-700">
            Résumé selection was cleared because you changed the candidate. Pick
            one for the new candidate.
          </p>
        )}
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

      {/* Not-assigned gate: a self-claim prompt, not a reason picker. The
          hidden claim flag rides along so the next submit assigns + submits. */}
      {gate === "not_assigned" && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm text-amber-800">{state.error}</p>
          <p className="text-xs text-amber-700">
            Claiming assigns this job to you (recorded on the job&apos;s timeline)
            so you own it going forward. Admins can reassign later.
          </p>
          <input type="hidden" name="claim" value="1" />
        </div>
      )}

      {/* Duplicate / iLabor gates: a preset reason + optional note. */}
      {isGate && gate !== "not_assigned" && (() => {
        // The gate kind comes typed from the server (no error-string sniffing).
        // Duplicate overrides and iLabor overrides are recorded under different
        // audit fields, so the composed reason goes to the matching field name.
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
                key={`overridePreset-${selectSyncKey}`}
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

      {state.error && !isGate && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <Link href={cancelHref} className={buttonClass("secondary")}>
          Cancel
        </Link>
        <Button
          type="submit"
          disabled={pending}
          onClick={() => {
            // Latch the claim the moment the recruiter acts on the not-assigned
            // prompt, so claim=1 also rides along to any follow-up gate.
            if (gate === "not_assigned") setClaimIntent(true);
          }}
        >
          {pending
            ? "Submitting…"
            : gate === "not_assigned"
              ? "Claim this job & submit"
              : isGate
                ? "Submit anyway"
                : "Submit candidate"}
        </Button>
      </div>
    </form>
  );
}
