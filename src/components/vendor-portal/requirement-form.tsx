"use client";

import { useActionState, useEffect, useState } from "react";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { LocationInput } from "@/components/ui/location-input";
import { Button } from "@/components/ui/button";
import {
  useUnsavedChanges,
  GuardedCancel,
} from "@/components/ui/unsaved-changes";
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
  clientRate: string;
  engagement: string;
  vendorRecruiterName: string;
  jobDuties: string;
  teamLead: string;
  submissionNotes: string;
};

const EMPTY_FIELDS: Fields = {
  candidateId: "",
  recruiterId: "",
  location: "",
  payRate: "",
  billRate: "",
  clientRate: "",
  engagement: "",
  vendorRecruiterName: "",
  jobDuties: "",
  teamLead: "",
  submissionNotes: "",
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
  teamLeads = [],
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
  /** Team-lead / manager users for the "Team lead" picker (stores the name). */
  teamLeads?: { id: string; fullName: string }[];
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

  return (
    <form action={formAction} onInput={markDirty} className="space-y-5">
      {mode === "create" ? (
        <input type="hidden" name="jobId" value={job.id} />
      ) : (
        <input type="hidden" name="id" value={requirementId ?? ""} />
      )}
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
          <SearchSelect
            id="candidateId"
            name="candidateId"
            value={fields.candidateId}
            onChange={(v) => setFields((f) => ({ ...f, candidateId: v }))}
            placeholder="Search candidates…"
            options={[
              { value: "", label: "— No candidate yet" },
              ...candidates.map((c) => ({ value: c.id, label: c.fullName })),
            ]}
          />
        </Field>

        <Field
          label="Recruiter"
          htmlFor="recruiterId"
          error={errors.recruiterId}
          hint="Who will market / submit this requirement."
        >
          <SearchSelect
            id="recruiterId"
            name="recruiterId"
            value={fields.recruiterId}
            onChange={(v) => setFields((f) => ({ ...f, recruiterId: v }))}
            placeholder="Search recruiters…"
            options={[
              { value: "", label: "— Unassigned" },
              ...recruiters.map((r) => ({
                value: r.id,
                label: r.isActive ? r.fullName : `${r.fullName} (inactive)`,
              })),
            ]}
          />
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Client rate" htmlFor="clientRate" error={errors.clientRate} hint="$/hr the end client releases (optional).">
          <Input
            id="clientRate"
            name="clientRate"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={fields.clientRate}
            onChange={set("clientRate")}
          />
        </Field>
        <Field label="Bill rate" htmlFor="billRate" error={errors.billRate} hint="$/hr the vendor releases to us.">
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
          <Select
            key={`teamLead-${selectSyncKey}`}
            id="teamLead"
            name="teamLead"
            value={fields.teamLead}
            onChange={set("teamLead")}
          >
            <option value="">—</option>
            {teamLeadChoices.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </Select>
        </Field>
      </div>

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
        <GuardedCancel href={cancelHref} dirty={dirty} />
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
