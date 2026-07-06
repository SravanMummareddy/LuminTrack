"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { Button, buttonClass } from "@/components/ui/button";
import { RateChainWarning } from "@/components/ui/rate-chain-warning";
import { uploadCandidateResume } from "@/server/actions/resumes";
import { RESUME_ACCEPT, resumeFileError } from "@/lib/validation/resume";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";
import {
  BENCH_ENGAGEMENTS,
  BENCH_ENGAGEMENT_LABEL,
  OVERRIDE_REASONS,
  OVERRIDE_REASON_LABEL,
} from "@/lib/labels";

type ResumeOption = { id: string; label: string };
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
  // "" = no résumé, "__new__" = add a new one, otherwise a saved résumé id.
  resumeSelection: string;
  submissionNotes: string;
  engagement: string;
  vendorRecruiterName: string;
  jobDuties: string;
  payRate: string;
  billRate: string;
  clientRate: string;
  teamLead: string;
  // Set only when a gate (duplicate / iLabor) paused the submit.
  overridePreset: string;
  overrideNote: string;
  // Set only in convert mode when a convert-warn gate (candidate placed,
  // archived résumé, zero rates, bill < pay) paused the move. Any non-empty
  // value clears all four; latched so it rides through a follow-up gate.
  convertReason: string;
};


// Convert-only warn gates — cleared by a single free-text `convertOverrideReason`
// (vs. the duplicate/iLabor gates which take a preset reason).
const CONVERT_OVERRIDE_GATES = [
  "candidate_placed",
  "archived_resume",
  "zero_rates",
  "bill_below_pay",
];

export function SubmissionForm({
  action,
  mode,
  job,
  candidate,
  jobOptions = [],
  candidates = [],
  recruiters,
  defaultRecruiterId,
  cancelHref,
  requirementId,
  prefill,
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
  cancelHref: string;
  /**
   * Convert mode — when set, this form moves a Vendor Portal Requirement to a
   * real submission. Renders a hidden `requirementId`, prefills the bench fields
   * from the requirement, and surfaces the convert-only warn gates.
   */
  requirementId?: string;
  /** Initial field values (convert mode prefill — engagement, rates, etc.). */
  prefill?: Partial<Fields>;
}) {
  const isConvert = requirementId != null;
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  // Inputs are controlled — a gate (duplicate / not-assigned / iLabor) returns
  // without redirecting, and React 19 would otherwise reset uncontrolled fields.
  const [fields, setFields] = useState<Fields>({
    candidateId: candidate?.id ?? "",
    jobId: job?.id ?? "",
    submittedById: defaultRecruiterId,
    resumeSelection: "",
    submissionNotes: "",
    engagement: "",
    vendorRecruiterName: "",
    jobDuties: "",
    payRate: "",
    billRate: "",
    clientRate: "",
    teamLead: "",
    overridePreset: "",
    overrideNote: "",
    convertReason: "",
    ...prefill,
  });
  // Surfaced after a candidate switch clears a résumé pick, so the wipe isn't
  // silent (it used to vanish a freshly-typed Drive link with no warning).
  const [resumeCleared, setResumeCleared] = useState(false);
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

  // Inline "upload a new résumé" — uploads eagerly to private Blob (a separate
  // action call), then adds the created résumé to the picker and selects it, so
  // the submission itself just references an existing candidateResumeId. The
  // file never rides along in the main submit POST.
  const [uploadedResumes, setUploadedResumes] = useState<ResumeOption[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadPending, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const resetUpload = () => {
    setShowUpload(false);
    setUploadLabel("");
    setUploadError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleUpload = (candidateId: string) => {
    const file = fileRef.current?.files?.[0] ?? null;
    if (!uploadLabel.trim()) {
      setUploadError("Give this resume a label.");
      return;
    }
    if (!file) {
      setUploadError("Choose a file to upload.");
      return;
    }
    const fileErr = resumeFileError(file);
    if (fileErr) {
      setUploadError(fileErr);
      return;
    }
    const fd = new FormData();
    fd.set("candidateId", candidateId);
    fd.set("label", uploadLabel.trim());
    fd.set("file", file);
    setUploadError(null);
    startUpload(async () => {
      const res = await uploadCandidateResume(EMPTY_FORM_STATE, fd);
      if (res.ok && res.createdResume) {
        setUploadedResumes((prev) => [...prev, res.createdResume!]);
        setFields((f) => ({ ...f, resumeSelection: res.createdResume!.id }));
        setResumeCleared(false);
        resetUpload();
      } else {
        setUploadError(res.error ?? res.fieldErrors?.file ?? "Upload failed.");
      }
    });
  };

  // Switching candidate clears the résumé pick — a résumé belongs to one
  // candidate. Warn if there was anything to lose rather than wiping silently.
  const onCandidateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // A résumé (saved or freshly uploaded) belongs to one candidate — drop both
    // the pick and the just-uploaded list when the candidate changes.
    setUploadedResumes([]);
    resetUpload();
    setFields((f) => {
      const hadResume = f.resumeSelection !== "";
      setResumeCleared(hadResume);
      return {
        ...f,
        candidateId: e.target.value,
        resumeSelection: "",
      };
    });
  };

  const onJobChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextJobId = e.target.value;
    setFields((f) => ({
      ...f,
      jobId: nextJobId,
    }));
  };

  const errors = state.fieldErrors ?? {};

  // The candidate whose résumés the picker offers — the fixed one in
  // candidate-locked mode, otherwise whichever is selected.
  const activeCandidate =
    mode === "candidate-locked"
      ? candidate
      : candidates.find((c) => c.id === fields.candidateId);
  const resumes = [...(activeCandidate?.resumes ?? []), ...uploadedResumes];
  const resumeChoice = fields.resumeSelection === "" ? "none" : "existing";

  // The effective ids the action receives, accounting for the locked anchors.
  const effectiveJobId = mode === "job-locked" ? (job?.id ?? "") : fields.jobId;
  const effectiveCandidateId =
    mode === "candidate-locked" ? (candidate?.id ?? "") : fields.candidateId;

  const gate = state.needsConfirm;
  const isGate = gate !== undefined && gate !== true;
  // Convert-only warn gates (candidate placed / archived résumé / zero rates /
  // bill < pay) take a single free-text reason, not a preset.
  const isConvertGate =
    typeof gate === "string" && CONVERT_OVERRIDE_GATES.includes(gate);
  // The preset-reason gates (duplicate / iLabor closed / iLabor cap).
  const isReasonGate = isGate && !isConvertGate && gate !== "not_assigned";

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="jobId" value={effectiveJobId} />
      <input type="hidden" name="candidateId" value={effectiveCandidateId} />
      <input type="hidden" name="submittedById" value={fields.submittedById} />
      {isConvert && (
        <input type="hidden" name="requirementId" value={requirementId} />
      )}
      {/* Latched once provided so it rides through a follow-up duplicate/iLabor
          gate (which would otherwise re-fire all the convert-warn gates). */}
      {isConvert && fields.convertReason.trim() !== "" && (
        <input
          type="hidden"
          name="convertOverrideReason"
          value={fields.convertReason}
        />
      )}
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

      </div>

      <Field
        label="Resume"
        htmlFor="resumeSelection"
        hint="Pick one of the candidate's uploaded resumes, upload a new one, or leave as no resume."
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
        </Select>
        {resumeCleared && (
          <p className="mt-1 text-xs text-amber-700">
            Résumé selection was cleared because you changed the candidate. Pick
            one for the new candidate.
          </p>
        )}

        {effectiveCandidateId &&
          (showUpload ? (
            <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50/60 p-3">
              <Input
                aria-label="New resume label"
                value={uploadLabel}
                onChange={(e) => setUploadLabel(e.target.value)}
                placeholder="Resume label (e.g. Backend Engineer)"
              />
              <input
                ref={fileRef}
                type="file"
                accept={RESUME_ACCEPT}
                className="block w-full rounded-md border border-slate-300 text-sm text-slate-700 file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
              {uploadError && (
                <p className="text-xs text-red-700">{uploadError}</p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleUpload(effectiveCandidateId)}
                  disabled={uploadPending}
                >
                  {uploadPending ? "Uploading…" : "Upload"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={resetUpload}
                  disabled={uploadPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
            >
              Upload a new resume
            </button>
          ))}
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Engagement" htmlFor="engagement" error={errors.engagement} hint="Bench/W2 — for bench-sales submissions.">
          <Select
            id="engagement"
            name="engagement"
            value={fields.engagement}
            onChange={set("engagement")}
          >
            <option value="">—</option>
            {BENCH_ENGAGEMENTS.map((e) => (
              <option key={e} value={e}>{BENCH_ENGAGEMENT_LABEL[e]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Vendor recruiter name" htmlFor="vendorRecruiterName" error={errors.vendorRecruiterName}>
          <Input
            id="vendorRecruiterName"
            name="vendorRecruiterName"
            value={fields.vendorRecruiterName}
            onChange={set("vendorRecruiterName")}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Pay rate" htmlFor="payRate" error={errors.payRate} hint="$/hr we pay the consultant.">
          <Input id="payRate" name="payRate" type="number" min="0" step="0.01" inputMode="decimal" value={fields.payRate} onChange={set("payRate")} />
        </Field>
        <Field label="Bill rate" htmlFor="billRate" error={errors.billRate} hint="$/hr the vendor releases to us.">
          <Input id="billRate" name="billRate" type="number" min="0" step="0.01" inputMode="decimal" value={fields.billRate} onChange={set("billRate")} />
        </Field>
        <Field label="Client rate" htmlFor="clientRate" error={errors.clientRate} hint="$/hr the end client releases (optional).">
          <Input id="clientRate" name="clientRate" type="number" min="0" step="0.01" inputMode="decimal" value={fields.clientRate} onChange={set("clientRate")} />
        </Field>
        <Field label="Team lead" htmlFor="teamLead" error={errors.teamLead}>
          <Input id="teamLead" name="teamLead" value={fields.teamLead} onChange={set("teamLead")} />
        </Field>
      </div>

      <RateChainWarning rates={fields} />

      <Field label="Job duties" htmlFor="jobDuties" error={errors.jobDuties}>
        <Textarea
          id="jobDuties"
          name="jobDuties"
          rows={3}
          value={fields.jobDuties}
          onChange={set("jobDuties")}
        />
      </Field>

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

      {/* Convert-only warn gates: a single free-text "why convert anyway". */}
      {isConvertGate && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm text-amber-800">{state.error}</p>
          <Field
            label="Reason for moving anyway"
            htmlFor="convertReason"
            required
            hint="Captured on the requirement's timeline."
          >
            <Textarea
              id="convertReason"
              rows={2}
              value={fields.convertReason}
              onChange={set("convertReason")}
            />
          </Field>
        </div>
      )}

      {/* Duplicate / iLabor gates: a preset reason + optional note. */}
      {isReasonGate && (() => {
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
                ? isConvert
                  ? "Move anyway"
                  : "Submit anyway"
                : isConvert
                  ? "Move to submission"
                  : "Submit candidate"}
        </Button>
      </div>
    </form>
  );
}
