"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { LocationInput } from "@/components/ui/location-input";
import { Button, buttonClass } from "@/components/ui/button";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";
import { BENCH_ENGAGEMENTS, BENCH_ENGAGEMENT_LABEL } from "@/lib/labels";

type CandidateOption = { id: string; fullName: string };
type Recruiter = { id: string; fullName: string; isActive: boolean };

type RequirementAction = (
  prev: FormState,
  formData: FormData,
) => Promise<FormState>;

type Fields = {
  candidateId: string;
  recruiterId: string;
  location: string;
  payRate: string;
  billRate: string;
  candidateRate: string;
  engagement: string;
  vendorRecruiterName: string;
  jobDuties: string;
  teamLead: string;
  submissionNotes: string;
  resumeDriveLink: string;
};

const EMPTY_FIELDS: Fields = {
  candidateId: "",
  recruiterId: "",
  location: "",
  payRate: "",
  billRate: "",
  candidateRate: "",
  engagement: "",
  vendorRecruiterName: "",
  jobDuties: "",
  teamLead: "",
  submissionNotes: "",
  resumeDriveLink: "",
};

/**
 * Create / edit a Vendor Portal Requirement — the planning record a team-lead or
 * admin fills in before a recruiter moves it to a real submission. The job is
 * fixed (chosen on the way in); every other field is optional. Controlled inputs
 * so a validation error (the action returns without redirecting) doesn't lose
 * what was typed under React 19's post-action form reset.
 */
export function RequirementForm({
  action,
  mode,
  requirementId,
  job,
  candidates,
  recruiters,
  defaults,
  cancelHref,
}: {
  action: RequirementAction;
  mode: "create" | "edit";
  /** Required when mode === "edit". */
  requirementId?: string;
  job: {
    id: string;
    title: string;
    displayId: string;
    clientName: string | null;
    location: string | null;
  };
  candidates: CandidateOption[];
  recruiters: Recruiter[];
  defaults?: Partial<Fields>;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const [fields, setFields] = useState<Fields>({
    ...EMPTY_FIELDS,
    ...defaults,
  });

  // Re-key the selects after React 19's post-action <form> reset so they
  // re-apply their controlled value (same fix as the submission form).
  const [selectSyncKey, setSelectSyncKey] = useState(0);
  useEffect(() => {
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

  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      {mode === "create" ? (
        <input type="hidden" name="jobId" value={job.id} />
      ) : (
        <input type="hidden" name="id" value={requirementId ?? ""} />
      )}
      <input type="hidden" name="candidateId" value={fields.candidateId} />
      <input type="hidden" name="recruiterId" value={fields.recruiterId} />

      <Field label="Job">
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {job.title}
          {job.clientName ? ` — ${job.clientName}` : ""}{" "}
          <span className="font-mono text-xs text-slate-500">({job.displayId})</span>
        </p>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Candidate"
          htmlFor="candidateId"
          error={errors.candidateId}
          hint="Optional — leave blank to plan the requirement before a candidate is chosen."
        >
          <Select
            key={`candidateId-${selectSyncKey}`}
            id="candidateId"
            value={fields.candidateId}
            onChange={set("candidateId")}
          >
            <option value="">— No candidate yet</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Recruiter"
          htmlFor="recruiterId"
          error={errors.recruiterId}
          hint="Who will market / submit this requirement."
        >
          <Select
            key={`recruiterId-${selectSyncKey}`}
            id="recruiterId"
            value={fields.recruiterId}
            onChange={set("recruiterId")}
          >
            <option value="">— Unassigned</option>
            {recruiters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.isActive ? r.fullName : `${r.fullName} (inactive)`}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Location"
          htmlFor="location"
          error={errors.location}
          hint={job.location ? `Job location: ${job.location}` : undefined}
        >
          <LocationInput
            id="location"
            name="location"
            value={fields.location}
            onChange={set("location")}
            placeholder={job.location ?? "e.g. Remote / Dallas, TX"}
          />
        </Field>
        <Field
          label="Engagement"
          htmlFor="engagement"
          error={errors.engagement}
          hint="C2C or W2."
        >
          <Select
            key={`engagement-${selectSyncKey}`}
            id="engagement"
            value={fields.engagement}
            onChange={set("engagement")}
          >
            <option value="">—</option>
            {BENCH_ENGAGEMENTS.map((e) => (
              <option key={e} value={e}>
                {BENCH_ENGAGEMENT_LABEL[e]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Pay rate" htmlFor="payRate" error={errors.payRate} hint="$/hr to the consultant.">
          <Input
            id="payRate"
            name="payRate"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={fields.payRate}
            onChange={set("payRate")}
          />
        </Field>
        <Field label="Bill rate" htmlFor="billRate" error={errors.billRate} hint="$/hr to the client.">
          <Input
            id="billRate"
            name="billRate"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={fields.billRate}
            onChange={set("billRate")}
          />
        </Field>
        <Field
          label="Candidate rate"
          htmlFor="candidateRate"
          error={errors.candidateRate}
          hint="Target candidate rate."
        >
          <Input
            id="candidateRate"
            name="candidateRate"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={fields.candidateRate}
            onChange={set("candidateRate")}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Vendor recruiter name"
          htmlFor="vendorRecruiterName"
          error={errors.vendorRecruiterName}
        >
          <Input
            id="vendorRecruiterName"
            name="vendorRecruiterName"
            value={fields.vendorRecruiterName}
            onChange={set("vendorRecruiterName")}
          />
        </Field>
        <Field
          label="Team lead"
          htmlFor="teamLead"
          error={errors.teamLead}
          hint="Leave blank to auto-fill from the recruiter's team lead."
        >
          <Input
            id="teamLead"
            name="teamLead"
            value={fields.teamLead}
            onChange={set("teamLead")}
          />
        </Field>
      </div>

      <Field
        label="Résumé — Google Drive link"
        htmlFor="resumeDriveLink"
        error={errors.resumeDriveLink}
        hint="Optional. The recruiter picks/confirms the actual résumé when moving to a submission."
      >
        <Input
          id="resumeDriveLink"
          name="resumeDriveLink"
          type="url"
          value={fields.resumeDriveLink}
          onChange={set("resumeDriveLink")}
          placeholder="https://drive.google.com/file/d/…"
        />
      </Field>

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
        hint="Carried into the submission when this requirement is moved forward."
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
        <Link href={cancelHref} className={buttonClass("secondary")}>
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : mode === "create"
              ? "Create requirement"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
