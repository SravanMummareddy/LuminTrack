"use client";

import { useActionState, useEffect, useState } from "react";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { Button } from "@/components/ui/button";
import { RateChainWarning } from "@/components/ui/rate-chain-warning";
import {
  useUnsavedChanges,
  GuardedCancel,
} from "@/components/ui/unsaved-changes";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";
import { BENCH_ENGAGEMENTS, BENCH_ENGAGEMENT_LABEL } from "@/lib/labels";

type ResumeOption = {
  id: string;
  label: string;
  // false when the résumé has been archived but this submission still uses it —
  // kept in the list so the selection isn't dropped, flagged so we can label it.
  isActive?: boolean;
};

type SubmissionAction = (
  prev: FormState,
  formData: FormData,
) => Promise<FormState>;

type RecruiterOption = { id: string; fullName: string; isActive: boolean };

type EditValues = {
  // "" = no résumé, "__new__" = add a new one, otherwise a saved résumé id.
  resumeSelection: string;
  submissionNotes: string;
  /** The raw submitted date — converted to a datetime-local value in the form. */
  submittedAt: Date | string;
  engagement: string;
  vendorRecruiterName: string;
  jobDuties: string;
  payRate: string;
  billRate: string;
  clientRate: string;
  teamLead: string;
  /** The current submitting recruiter — only editable when canReattribute. */
  submittedById: string;
};

type Fields = {
  resumeSelection: string;
  submissionNotes: string;
  submittedAt: string;
  submittedById: string;
  engagement: string;
  vendorRecruiterName: string;
  jobDuties: string;
  payRate: string;
  billRate: string;
  clientRate: string;
  teamLead: string;
};


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
  teamLeads = [],
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
  /** Team-lead / manager users for the "Team lead" picker (stores the name). */
  teamLeads?: { id: string; fullName: string }[];
  resumes: ResumeOption[];
  values: EditValues;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  // Inputs are controlled — a validation error returns without redirecting, and
  // React 19 would otherwise reset the uncontrolled fields.
  const [fields, setFields] = useState<Fields>({
    resumeSelection: values.resumeSelection,
    submissionNotes: values.submissionNotes,
    submittedAt: toDateTimeLocal(values.submittedAt),
    submittedById: values.submittedById,
    engagement: values.engagement,
    vendorRecruiterName: values.vendorRecruiterName,
    jobDuties: values.jobDuties,
    payRate: values.payRate,
    billRate: values.billRate,
    clientRate: values.clientRate,
    teamLead: values.teamLead,
  });
  // Free-text reason for the rate-chain soft block (see the gate below).
  const [rateReason, setRateReason] = useState("");
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

  // Unsaved-changes guard — any user input arms the leave prompt + Cancel confirm.
  const [dirty, setDirty] = useState(false);
  const markDirty = () => setDirty((d) => (d ? d : true));
  useUnsavedChanges(dirty);

  // Team-lead picker — keep the saved value even if it's not a current lead.
  const teamLeadNames = teamLeads.map((t) => t.fullName);
  const teamLeadChoices =
    fields.teamLead && !teamLeadNames.includes(fields.teamLead)
      ? [fields.teamLead, ...teamLeadNames]
      : teamLeadNames;
  const resumeChoice = fields.resumeSelection === "" ? "none" : "existing";

  return (
    <form action={formAction} onInput={markDirty} className="space-y-5">
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
            {/* SearchSelect is controlled (text + hidden input both driven by
                state), so it survives React 19's post-action form reset without
                the presentational-select + remount-key backstop. */}
            <SearchSelect
              id="submittedById"
              name="submittedById"
              value={fields.submittedById}
              onChange={(v) => setFields((f) => ({ ...f, submittedById: v }))}
              placeholder="Search recruiters…"
              options={recruiters.map((r) => ({
                value: r.id,
                label: r.isActive ? r.fullName : `${r.fullName} (inactive)`,
              }))}
            />
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

      </div>

      <Field
        label="Resume"
        htmlFor="resumeSelection"
        hint="Pick one of the candidate's uploaded resumes, or leave as no resume. Upload new resumes on the candidate's profile."
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
              {r.isActive === false ? " (archived)" : ""}
            </option>
          ))}
        </Select>
      </Field>

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

      {/* Rate-chain soft block: broken rungs + a required reason to save anyway. */}
      {state.needsConfirm === "rate_chain" && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">{state.error}</p>
          {state.confirmData?.warnings?.length ? (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-800">
              {state.confirmData.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
          <input type="hidden" name="rateOverrideReason" value={rateReason} />
          <Field
            label="Reason for saving anyway"
            htmlFor="rateReason"
            required
            hint="Captured on the submission's audit trail."
          >
            <Textarea
              id="rateReason"
              rows={2}
              value={rateReason}
              onChange={(e) => setRateReason(e.target.value)}
            />
          </Field>
        </div>
      )}

      {state.error && state.needsConfirm !== "rate_chain" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <GuardedCancel href={`/submissions/${submissionId}`} dirty={dirty} />
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : state.needsConfirm === "rate_chain"
              ? "Save anyway"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
