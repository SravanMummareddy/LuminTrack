"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { Button } from "@/components/ui/button";
import { RateChainWarning } from "@/components/ui/rate-chain-warning";
import {
  useUnsavedChanges,
  GuardedCancel,
} from "@/components/ui/unsaved-changes";
import { uploadCandidateResume } from "@/server/actions/resumes";
import { fetchSubmissionPrefill } from "@/server/actions/submission-prefill";
import { RESUME_ACCEPT, resumeFileError } from "@/lib/validation/resume";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";
import {
  BENCH_ENGAGEMENTS,
  BENCH_ENGAGEMENT_LABEL,
  OVERRIDE_REASONS,
  OVERRIDE_REASON_LABEL,
} from "@/lib/labels";
import { roleLabel } from "@/lib/permissions";
import type { UserRole } from "@/generated/prisma/enums";

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
type Recruiter = {
  id: string;
  fullName: string;
  isActive: boolean;
  // Team leads and managers submit too; the picker tags them so the person
  // attributing the submission can tell roles apart.
  role?: UserRole;
};

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
  // Every gate reason is its own field, so the whole stack of warnings can be
  // filled at once and posts together via latched hidden inputs below. The
  // duplicate preset + note pair composes into one reason string.
  rateReason: string;
  convertReason: string;
  candidateStatusReason: string;
  workAuthReason: string;
  originalResumeReason: string;
  benchReason: string;
  duplicatePreset: string;
  duplicateNote: string;
};

export function SubmissionForm({
  action,
  mode,
  job,
  candidate,
  jobOptions = [],
  candidates = [],
  recruiters,
  teamLeads = [],
  defaultRecruiterId,
  canReattribute = false,
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
  /** Team-lead / manager users for the "Team lead" picker (stores the name). */
  teamLeads?: { id: string; fullName: string }[];
  defaultRecruiterId: string;
  /**
   * Whether the acting user may credit the submission to a different recruiter
   * (managers / team leads). Recruiters see "Submitted by" locked to themselves.
   * UI mirror of the server-side attribution guard in createSubmissionRecord —
   * the server enforces it regardless, this just avoids showing a control that
   * can't be honoured.
   */
  canReattribute?: boolean;
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
    rateReason: "",
    convertReason: "",
    candidateStatusReason: "",
    workAuthReason: "",
    originalResumeReason: "",
    benchReason: "",
    duplicatePreset: "",
    duplicateNote: "",
    ...prefill,
  });
  // Surfaced after a candidate switch clears a résumé pick, so the wipe isn't
  // silent (it used to vanish a freshly-typed Drive link with no warning).
  const [resumeCleared, setResumeCleared] = useState(false);
  // A recruiter who self-claims an unassigned job can hit a SECOND gate right
  // after (e.g. a duplicate). The claim flag used to live only
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
  // A gate's message (state.error) is baked server-side for a specific
  // candidate/job. If the user changes that anchor without resubmitting, the gate
  // is stale — hide it until the next action result. Cleared on every new
  // response so a fresh gate always shows.
  const [gateDismissed, setGateDismissed] = useState(false);
  useEffect(() => {
    // Re-key after React 19's post-action <form> reset, which only runs after
    // commit; a render-time bump would be clobbered by it. Bounded to one extra
    // render per action response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectSyncKey((k) => k + 1);
    // A new action response is the current gate context — un-dismiss.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGateDismissed(false);
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
  const [, startPrefill] = useTransition();
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

  // Hide the (now stale) gate and clear any override reasons — they were typed
  // against the previous candidate/job and must not ride into a new gate context
  // (a reason logged to the wrong candidate is a real data-integrity slip).
  const dismissStaleGate = () => {
    setGateDismissed(true);
    setFields((f) => ({
      ...f,
      rateReason: "",
      convertReason: "",
      candidateStatusReason: "",
      workAuthReason: "",
      originalResumeReason: "",
      benchReason: "",
      duplicatePreset: "",
      duplicateNote: "",
    }));
  };

  // Switching candidate clears the résumé pick — a résumé belongs to one
  // candidate. Warn if there was anything to lose rather than wiping silently.
  const onCandidateChange = (nextCandidateId: string) => {
    // A résumé (saved or freshly uploaded) belongs to one candidate — drop both
    // the pick and the just-uploaded list when the candidate changes.
    setUploadedResumes([]);
    resetUpload();
    // The prior gate + any override reasons belonged to the old candidate.
    dismissStaleGate();
    setFields((f) => {
      const hadResume = f.resumeSelection !== "";
      setResumeCleared(hadResume);
      return {
        ...f,
        candidateId: nextCandidateId,
        resumeSelection: "",
      };
    });
  };

  const onJobChange = (nextJobId: string) => {
    dismissStaleGate();
    setFields((f) => ({
      ...f,
      jobId: nextJobId,
    }));
    // Prefill the commercial terms from the job's OPEN vendor requirement, so
    // the open / candidate-locked entry points behave like the job page + the
    // convert flow (rates flow down instead of being re-typed).
    if (!nextJobId) return;
    startPrefill(async () => {
      const p = await fetchSubmissionPrefill(nextJobId);
      if (!p) return;
      setFields((f) => ({
        ...f,
        payRate: p.payRate,
        billRate: p.billRate,
        clientRate: p.clientRate,
        engagement: p.engagement,
        vendorRecruiterName: p.vendorRecruiterName,
        teamLead: p.teamLead,
        jobDuties: p.jobDuties,
        submissionNotes: p.submissionNotes,
      }));
    });
  };

  const errors = state.fieldErrors ?? {};

  // Unsaved-changes guard: any user input flips `dirty` (idempotent — the
  // functional updater bails out of re-render once already true), arming the
  // browser's leave prompt and the branded Cancel confirm. A successful submit
  // redirects (soft nav, no unload) so it never prompts.
  const [dirty, setDirty] = useState(false);
  const markDirty = () => setDirty((d) => (d ? d : true));
  useUnsavedChanges(dirty);

  // The candidate whose résumés the picker offers — the fixed one in
  // candidate-locked mode, otherwise whichever is selected.
  const activeCandidate =
    mode === "candidate-locked"
      ? candidate
      : candidates.find((c) => c.id === fields.candidateId);
  // Dedupe by id: after an inline upload, `uploadCandidateResume` revalidates
  // the page, so the new résumé reappears in `activeCandidate.resumes` while
  // still present in the optimistic `uploadedResumes` list — same id twice
  // would trip React's duplicate-key warning. Server row wins (listed first).
  const resumes = (() => {
    const seen = new Set<string>();
    const merged: ResumeOption[] = [];
    for (const r of [...(activeCandidate?.resumes ?? []), ...uploadedResumes]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      merged.push(r);
    }
    return merged;
  })();
  const resumeChoice = fields.resumeSelection === "" ? "none" : "existing";

  // The effective ids the action receives, accounting for the locked anchors.
  const effectiveJobId = mode === "job-locked" ? (job?.id ?? "") : fields.jobId;
  const effectiveCandidateId =
    mode === "candidate-locked" ? (candidate?.id ?? "") : fields.candidateId;

  // Every soft gate that fired, shown stacked. Suppressed when the user has since
  // changed the candidate/job (the baked messages would be stale — dismissStaleGate).
  const pendingGates = gateDismissed ? [] : (state.pendingGates ?? []);
  const gate = (k: string) => pendingGates.find((g) => g.kind === k);
  const hasGates = pendingGates.length > 0;
  const dupGate = gate("duplicate");
  // Composed override strings posted via the latched hidden inputs below.
  const composeReason = (preset: string, note: string) =>
    preset === "" ? "" : preset + (note.trim() ? ` (${note.trim()})` : "");

  // The commercial-terms block (engagement, vendor recruiter, rates, team lead,
  // job duties). In convert mode these are already prefilled from the VPR, so we
  // show a read-only summary and tuck the editable fields behind "Edit terms";
  // in the other modes they render inline. The inputs are always mounted (even
  // inside a collapsed <details>), so they always post.
  const money = (v: string) => (v && v.trim() !== "" ? `$${v}` : "—");
  const engagementLabel = fields.engagement
    ? BENCH_ENGAGEMENT_LABEL[
        fields.engagement as keyof typeof BENCH_ENGAGEMENT_LABEL
      ]
    : "—";
  // Team-lead picker options. Keep the currently-saved value even if it isn't a
  // current lead (e.g. a legacy free-text name) so the selection never drops.
  const teamLeadNames = teamLeads.map((t) => t.fullName);
  const teamLeadChoices =
    fields.teamLead && !teamLeadNames.includes(fields.teamLead)
      ? [fields.teamLead, ...teamLeadNames]
      : teamLeadNames;
  const commercialTermsFields = (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Engagement" htmlFor="engagement" error={errors.engagement} hint="Bench/W2 — for bench-sales submissions.">
          <Select
            key={`engagement-${selectSyncKey}`}
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
          <Select key={`teamLead-${selectSyncKey}`} id="teamLead" name="teamLead" value={fields.teamLead} onChange={set("teamLead")}>
            <option value="">—</option>
            {teamLeadChoices.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </Select>
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
    </>
  );

  return (
    <form action={formAction} onInput={markDirty} className="space-y-5">
      {/* Job + candidate are carried by their SearchSelect (name=…) when a picker
          is shown; in the locked modes there's no picker, so a hidden input holds
          the fixed value. submittedById is always a picker (SearchSelect). */}
      {mode === "job-locked" && (
        <input type="hidden" name="jobId" value={effectiveJobId} />
      )}
      {mode === "candidate-locked" && (
        <input type="hidden" name="candidateId" value={effectiveCandidateId} />
      )}
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
      {/* Do-not-contact / not-interested override reason, latched persistently so
          it survives a follow-up gate (e.g. rates-pending) instead of being lost
          when the candidate_status gate hands off — the bug it fixes. */}
      {fields.candidateStatusReason.trim() !== "" && (
        <input
          type="hidden"
          name="candidateStatusOverrideReason"
          value={fields.candidateStatusReason}
        />
      )}
      {/* Expired work-authorization override reason, latched so it survives a
          follow-up gate. */}
      {fields.workAuthReason.trim() !== "" && (
        <input
          type="hidden"
          name="workAuthOverrideReason"
          value={fields.workAuthReason}
        />
      )}
      {/* No-original-résumé override reason (C-1), latched so it survives a
          follow-up gate. */}
      {fields.originalResumeReason.trim() !== "" && (
        <input
          type="hidden"
          name="originalResumeOverrideReason"
          value={fields.originalResumeReason}
        />
      )}
      {/* Off-bench override reason, latched so it survives a follow-up gate. */}
      {fields.benchReason.trim() !== "" && (
        <input
          type="hidden"
          name="benchOverrideReason"
          value={fields.benchReason}
        />
      )}
      {/* Each stacked gate's reason posts via its own latched hidden input, so the
          whole batch submits together (the visible fields drive these values). */}
      {fields.rateReason.trim() !== "" && (
        <input type="hidden" name="rateOverrideReason" value={fields.rateReason} />
      )}
      {composeReason(fields.duplicatePreset, fields.duplicateNote) !== "" && (
        <input
          type="hidden"
          name="duplicateReason"
          value={composeReason(fields.duplicatePreset, fields.duplicateNote)}
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
          <SearchSelect
            id="jobId"
            name="jobId"
            value={fields.jobId}
            onChange={onJobChange}
            placeholder="Search jobs…"
            options={jobOptions.map((j) => ({
              value: j.id,
              label: `${j.title}${j.clientName ? ` — ${j.clientName}` : ""} (${j.displayId})`,
            }))}
          />
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
          <SearchSelect
            id="candidateId"
            name="candidateId"
            value={fields.candidateId}
            onChange={onCandidateChange}
            placeholder="Search candidates…"
            options={candidates.map((c) => ({
              value: c.id,
              label: c.fullName,
              disabled: c.alreadySubmitted,
              hint: c.alreadySubmitted ? "(already submitted)" : undefined,
            }))}
          />
        </Field>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {canReattribute ? (
          <Field
            label="Submitted by"
            htmlFor="submittedById"
            required
            error={errors.submittedById}
          >
            <SearchSelect
              id="submittedById"
              name="submittedById"
              value={fields.submittedById}
              onChange={(v) => setFields((f) => ({ ...f, submittedById: v }))}
              placeholder="Search recruiters…"
              options={recruiters.map((r) => {
                const name = r.isActive
                  ? r.fullName
                  : `${r.fullName} (inactive)`;
                // Tag team leads / managers so it's clear who's being credited.
                const tag =
                  r.role && r.role !== "RECRUITER"
                    ? ` · ${roleLabel(r.role)}`
                    : "";
                return { value: r.id, label: `${name}${tag}` };
              })}
            />
          </Field>
        ) : (
          // Recruiters can't credit a submission to anyone else — the field is
          // locked to them (the server forces this too). Post the id via a
          // hidden input so the schema still receives a value.
          <div>
            <p className="text-sm font-medium text-slate-700">Submitted by</p>
            <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              {recruiters.find((r) => r.id === defaultRecruiterId)?.fullName ??
                "You"}
            </p>
            <input
              type="hidden"
              name="submittedById"
              value={defaultRecruiterId}
            />
          </div>
        )}

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
              <p className="text-xs text-slate-500">
                Saved to this candidate&apos;s résumé library and selected for this
                submission.
              </p>
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

      {isConvert ? (
        <div className="space-y-2">
          <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-xs font-medium text-slate-500">
              Commercial terms — carried from the requirement
            </p>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">Pay rate</dt>
                <dd className="font-medium text-slate-800">{money(fields.payRate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Bill rate</dt>
                <dd className="font-medium text-slate-800">{money(fields.billRate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Client rate</dt>
                <dd className="font-medium text-slate-800">{money(fields.clientRate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Engagement</dt>
                <dd className="font-medium text-slate-800">{engagementLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Team lead</dt>
                <dd className="font-medium text-slate-800">{fields.teamLead || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Vendor recruiter</dt>
                <dd className="font-medium text-slate-800">
                  {fields.vendorRecruiterName || "—"}
                </dd>
              </div>
            </dl>
          </div>
          <details className="rounded-md border border-slate-200 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-indigo-600">
              Edit terms
            </summary>
            <div className="mt-3 space-y-4">{commercialTermsFields}</div>
          </details>
        </div>
      ) : (
        commercialTermsFields
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

      {/* Every applicable warning, stacked into ONE review panel so the recruiter
          resolves them together and submits once. Each reason drives a latched
          hidden input above, so the whole batch posts on a single submit. */}
      {hasGates && (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
            <p className="text-sm font-medium text-amber-800">
              Review before submitting
            </p>
            <span className="ml-auto rounded-md bg-white px-2 py-0.5 text-xs font-medium text-amber-800">
              {pendingGates.length} to confirm
            </span>
          </div>

          {gate("not_assigned") && (
            <div className="border-t border-amber-200 pt-3">
              <p className="text-sm font-medium text-amber-800">
                You&apos;re not assigned to this job.
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                Submitting will claim it for you (recorded on the job&apos;s
                timeline). Admins can reassign later.
              </p>
            </div>
          )}

          {gate("rate_chain") && (
            <div className="border-t border-amber-200 pt-3">
              <p className="text-sm font-medium text-amber-800">
                These rates break the rate chain.
              </p>
              {gate("rate_chain")!.warnings?.length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-amber-800">
                  {gate("rate_chain")!.warnings!.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : null}
              <Field
                label="Reason for saving anyway"
                htmlFor="rateReason"
                required
                hint="Captured on the audit trail."
              >
                <Textarea
                  id="rateReason"
                  rows={2}
                  required
                  value={fields.rateReason}
                  onChange={set("rateReason")}
                />
              </Field>
            </div>
          )}

          {gate("candidate_status") && (
            <div className="border-t border-amber-200 pt-3">
              <p className="text-sm font-medium text-amber-800">
                {gate("candidate_status")!.message ??
                  "Candidate has a blocking status."}
              </p>
              <Field
                label="Reason for submitting anyway"
                htmlFor="candidateStatusReason"
                required
                hint="Captured on the audit trail."
              >
                <Textarea
                  id="candidateStatusReason"
                  rows={2}
                  required
                  value={fields.candidateStatusReason}
                  onChange={set("candidateStatusReason")}
                />
              </Field>
            </div>
          )}

          {gate("work_auth") && (
            <div className="border-t border-amber-200 pt-3">
              <p className="text-sm font-medium text-amber-800">
                {gate("work_auth")!.message ??
                  "Candidate's work authorization has expired."}
              </p>
              <Field
                label="Reason for submitting anyway"
                htmlFor="workAuthReason"
                required
                hint="Captured on the audit trail."
              >
                <Textarea
                  id="workAuthReason"
                  rows={2}
                  required
                  value={fields.workAuthReason}
                  onChange={set("workAuthReason")}
                />
              </Field>
            </div>
          )}

          {gate("no_original_resume") && (
            <div className="border-t border-amber-200 pt-3">
              <p className="text-sm font-medium text-amber-800">
                Candidate has no original résumé.
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                An authentic (non-marketing) résumé should be on file before
                submitting.
              </p>
              <Field
                label="Reason for submitting anyway"
                htmlFor="originalResumeReason"
                required
                hint="Captured on the audit trail."
              >
                <Textarea
                  id="originalResumeReason"
                  rows={2}
                  required
                  value={fields.originalResumeReason}
                  onChange={set("originalResumeReason")}
                />
              </Field>
            </div>
          )}

          {gate("not_marketing") && (
            <div className="border-t border-amber-200 pt-3">
              <p className="text-sm font-medium text-amber-800">
                Candidate isn&apos;t on the active bench.
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                Submitting will re-add them to the active bench.
              </p>
              <Field
                label="Reason for submitting anyway"
                htmlFor="benchReason"
                required
                hint="Captured on the audit trail."
              >
                <Textarea
                  id="benchReason"
                  rows={2}
                  required
                  value={fields.benchReason}
                  onChange={set("benchReason")}
                />
              </Field>
            </div>
          )}

          {gate("convert_warn") && (
            <div className="border-t border-amber-200 pt-3">
              <p className="text-sm font-medium text-amber-800">
                {(gate("convert_warn")!.warnings?.length ?? 0) > 1
                  ? "A few things to confirm:"
                  : "One thing to confirm:"}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-amber-800">
                {gate("convert_warn")!.warnings?.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              <Field
                label="Reason for moving anyway"
                htmlFor="convertReason"
                required
                hint="Captured on the requirement's timeline."
              >
                <Textarea
                  id="convertReason"
                  rows={2}
                  required
                  value={fields.convertReason}
                  onChange={set("convertReason")}
                />
              </Field>
            </div>
          )}

          {dupGate && (
            <div className="border-t border-amber-200 pt-3">
              <p className="text-sm font-medium text-amber-800">
                This candidate was already submitted to this job.
              </p>
              {dupGate.existingSubmissionId && (
                <Link
                  href={`/submissions/${dupGate.existingSubmissionId}`}
                  target="_blank"
                  className="mt-0.5 inline-block text-sm font-medium text-amber-900 underline"
                >
                  View the existing submission →
                </Link>
              )}
              <Field label="Reason to submit again" htmlFor="duplicatePreset" required>
                <Select
                  key={`duplicatePreset-${selectSyncKey}`}
                  id="duplicatePreset"
                  value={fields.duplicatePreset}
                  onChange={set("duplicatePreset")}
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
                htmlFor="duplicateNote"
                hint="Optional — captured on the audit trail."
              >
                <Textarea
                  id="duplicateNote"
                  rows={2}
                  value={fields.duplicateNote}
                  onChange={set("duplicateNote")}
                />
              </Field>
            </div>
          )}
        </div>
      )}

      {state.error && !hasGates && !gateDismissed && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <GuardedCancel href={cancelHref} dirty={dirty} />
        <Button
          type="submit"
          disabled={pending}
          onClick={() => {
            // Latch the claim the moment the recruiter acts on the not-assigned
            // prompt, so claim=1 also rides along on the stacked submit.
            if (gate("not_assigned")) setClaimIntent(true);
          }}
        >
          {pending
            ? "Submitting…"
            : hasGates
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
