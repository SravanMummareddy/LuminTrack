"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { Button, buttonClass } from "@/components/ui/button";
import {
  JOB_STATUSES,
  JOB_STATUS_LABEL,
  OTHER_SOURCE,
  WORK_MODES,
  WORK_MODE_LABEL,
  JOB_PRIORITIES,
  JOB_PRIORITY_LABEL,
  BENCH_ENGAGEMENTS,
  BENCH_ENGAGEMENT_LABEL,
} from "@/lib/labels";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";

type Option = { id: string; name: string; isActive: boolean };
type Recruiter = { id: string; fullName: string; isActive: boolean };

export type JobFormValues = {
  id: string;
  title: string;
  clientId: string;
  vendorId: string;
  sisterCompanySourceId: string;
  sourceOther: string;
  status: string;
  location: string;
  vendorRate: string;
  candidateRate: string;
  description: string;
  notes: string;
  recruiterIds: string[];
  positions: string;
  reqType: string;
  department: string;
  durationLabel: string;
  atsId: string;
  /** YYYY-MM-DD or "" — bound to <input type="date">. */
  startDate: string;
  endDate: string;
  workMode: string;
  priority: string;
  targetCloseDate: string;
  postingUrl: string;
  workAuthRequirement: string;
  /** Comma-separated; server-action splits + dedupes. */
  skills: string;
};

type JobAction = (prev: FormState, formData: FormData) => Promise<FormState>;

function optionLabel(name: string, isActive: boolean): string {
  return isActive ? name : `${name} (inactive)`;
}

export function JobForm({
  action,
  clients,
  vendors,
  sources,
  recruiters,
  values,
  submitLabel,
  canManageRequirements = false,
}: {
  action: JobAction;
  clients: Option[];
  vendors: Option[];
  sources: Option[];
  recruiters: Recruiter[];
  values?: JobFormValues;
  submitLabel: string;
  /** Show the optional "plan a vendor requirement" section (create mode only). */
  canManageRequirements?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const errors = state.fieldErrors ?? {};
  const assigned = new Set(values?.recruiterIds ?? []);
  const cancelHref = values ? `/jobs/${values.id}` : "/jobs";

  // The source is either a managed source (FK) or a free-text entry. When a
  // saved job has no FK but a `sourceOther`, the select shows the "Other" option.
  const [sourceValue, setSourceValue] = useState(
    values?.sisterCompanySourceId
      ? values.sisterCompanySourceId
      : values?.sourceOther
        ? OTHER_SOURCE
        : "",
  );
  const isOtherSource = sourceValue === OTHER_SOURCE;

  return (
    <form action={formAction} className="space-y-5">
      {values && <input type="hidden" name="id" value={values.id} />}

      <Field label="Job title" htmlFor="title" required error={errors.title}>
        <Input id="title" name="title" defaultValue={values?.title ?? ""} required />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Client" htmlFor="clientId" required error={errors.clientId}>
          <Select
            id="clientId"
            name="clientId"
            defaultValue={values?.clientId ?? ""}
            required
          >
            <option value="" disabled>
              Select a client…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {optionLabel(c.name, c.isActive)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Vendor" htmlFor="vendorId" required error={errors.vendorId}>
          <Select
            id="vendorId"
            name="vendorId"
            defaultValue={values?.vendorId ?? ""}
            required
          >
            <option value="" disabled>
              Select a vendor…
            </option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {optionLabel(v.name, v.isActive)}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Source"
          htmlFor="sisterCompanySourceId"
          required
          error={errors.sisterCompanySourceId ?? errors.sourceOther}
        >
          <Select
            id="sisterCompanySourceId"
            name="sisterCompanySourceId"
            value={sourceValue}
            onChange={(e) => setSourceValue(e.target.value)}
            required
          >
            <option value="" disabled>
              Select a source…
            </option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {optionLabel(s.name, s.isActive)}
              </option>
            ))}
            <option value={OTHER_SOURCE}>Other — enter manually</option>
          </Select>
          {/* The manual-entry box sits directly under the dropdown so it's
              obviously the thing to fill in once "Other" is picked. */}
          {isOtherSource && (
            <Input
              id="sourceOther"
              name="sourceOther"
              defaultValue={values?.sourceOther ?? ""}
              placeholder="Type the source name (e.g. LinkedIn, referral)"
              className="mt-2"
              autoFocus
            />
          )}
        </Field>

        <Field label="Status" htmlFor="status" error={errors.status}>
          <Select id="status" name="status" defaultValue={values?.status ?? "OPEN"}>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {JOB_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Vendor rate" htmlFor="vendorRate" error={errors.vendorRate}>
          <Input
            id="vendorRate"
            name="vendorRate"
            type="number"
            min="0"
            step="0.01"
            defaultValue={values?.vendorRate ?? ""}
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
            defaultValue={values?.candidateRate ?? ""}
          />
        </Field>
      </div>

      <Field label="Location" htmlFor="location" error={errors.location}>
        <Input
          id="location"
          name="location"
          defaultValue={values?.location ?? ""}
          placeholder="e.g. Remote, New York, NY"
        />
      </Field>

      <details className="rounded-md border border-slate-200 bg-slate-50/40 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          More job details (optional)
        </summary>
        <p className="mt-1 text-xs text-slate-500">
          Mirrors what iLabor stores. Fill what you have — every field is
          optional.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Positions"
            htmlFor="positions"
            hint="How many openings on this req."
            error={errors.positions}
          >
            <Input
              id="positions"
              name="positions"
              type="number"
              min="1"
              step="1"
              defaultValue={values?.positions ?? ""}
              placeholder="1"
            />
          </Field>
          <Field
            label="Position type"
            htmlFor="reqType"
            hint="e.g. Contract, Full-time, Contract-to-hire."
            error={errors.reqType}
          >
            <Input
              id="reqType"
              name="reqType"
              defaultValue={values?.reqType ?? ""}
              placeholder="Contract / Full-time / C2H"
            />
          </Field>
          <Field
            label="Department"
            htmlFor="department"
            error={errors.department}
          >
            <Input
              id="department"
              name="department"
              defaultValue={values?.department ?? ""}
              placeholder="e.g. Engineering, Operations"
            />
          </Field>
          <Field
            label="Customer ref"
            htmlFor="atsId"
            hint="The client's own req ID, if any."
            error={errors.atsId}
          >
            <Input
              id="atsId"
              name="atsId"
              defaultValue={values?.atsId ?? ""}
              placeholder="e.g. R-12345"
            />
          </Field>
          <Field
            label="Projected start"
            htmlFor="startDate"
            error={errors.startDate}
          >
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={values?.startDate ?? ""}
            />
          </Field>
          <Field
            label="Projected end"
            htmlFor="endDate"
            error={errors.endDate}
          >
            <Input
              id="endDate"
              name="endDate"
              type="date"
              defaultValue={values?.endDate ?? ""}
            />
          </Field>
          <Field
            label="Duration"
            htmlFor="durationLabel"
            hint="Free-text fallback when dates are flexible."
            error={errors.durationLabel}
          >
            <Input
              id="durationLabel"
              name="durationLabel"
              defaultValue={values?.durationLabel ?? ""}
              placeholder="e.g. 6 months extendable"
            />
          </Field>
          <Field label="Work mode" htmlFor="workMode" error={errors.workMode}>
            <Select
              id="workMode"
              name="workMode"
              defaultValue={values?.workMode ?? ""}
            >
              <option value="">—</option>
              {WORK_MODES.map((m) => (
                <option key={m} value={m}>
                  {WORK_MODE_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority" htmlFor="priority" error={errors.priority}>
            <Select
              id="priority"
              name="priority"
              defaultValue={values?.priority ?? ""}
            >
              <option value="">—</option>
              {JOB_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {JOB_PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Target hire-by date"
            htmlFor="targetCloseDate"
            hint="When this req should be closed."
            error={errors.targetCloseDate}
          >
            <Input
              id="targetCloseDate"
              name="targetCloseDate"
              type="date"
              defaultValue={values?.targetCloseDate ?? ""}
            />
          </Field>
          <Field
            label="Posting URL"
            htmlFor="postingUrl"
            hint="Public job-board / careers page link."
            error={errors.postingUrl}
          >
            <Input
              id="postingUrl"
              name="postingUrl"
              type="url"
              defaultValue={values?.postingUrl ?? ""}
              placeholder="https://…"
            />
          </Field>
          <Field
            label="Work auth requirement"
            htmlFor="workAuthRequirement"
            hint="e.g. US Citizen only, No sponsorship."
            error={errors.workAuthRequirement}
          >
            <Input
              id="workAuthRequirement"
              name="workAuthRequirement"
              defaultValue={values?.workAuthRequirement ?? ""}
              placeholder="US Citizen / GC / No sponsorship"
            />
          </Field>
          <Field
            label="Skills"
            htmlFor="skills"
            hint="Separate skills with commas."
            error={errors.skills}
          >
            <Input
              id="skills"
              name="skills"
              defaultValue={values?.skills ?? ""}
              placeholder="e.g. React, TypeScript, AWS"
            />
          </Field>
        </div>
      </details>

      <Field label="Job description" htmlFor="description" error={errors.description}>
        <Textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={values?.description ?? ""}
        />
      </Field>

      <Field label="Notes" htmlFor="notes" error={errors.notes}>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={values?.notes ?? ""}
        />
      </Field>

      <div>
        <span className="block text-sm font-medium text-slate-700">
          Assigned recruiters
        </span>
        <p className="mt-0.5 text-xs text-slate-500">
          Optional — you can assign later from the job detail page.
        </p>
        {recruiters.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">
            No users yet — add recruiters under Settings.
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recruiters.map((r) => (
              <label
                key={r.id}
                className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  name="recruiterIds"
                  value={r.id}
                  defaultChecked={assigned.has(r.id)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-200"
                />
                <span>{optionLabel(r.fullName, r.isActive)}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Optional vendor-requirement section — create mode only, gated to
          admins / team leads. Fields are submitted only when the checkbox is
          ticked (the server reads `createRequirement`'s presence). */}
      {!values && canManageRequirements && (
        <details className="rounded-md border border-slate-200 bg-slate-50/50">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-slate-700">
            Also plan a vendor portal requirement (optional)
          </summary>
          <div className="space-y-4 border-t border-slate-200 p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                name="createRequirement"
                value="1"
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-200"
              />
              Create a vendor requirement for this job
            </label>
            <p className="text-xs text-slate-500">
              Pre-decide the commercial terms now. A recruiter moves it to a
              submission later (you can add a candidate then or by editing it).
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Recruiter" htmlFor="req_recruiterId">
                <Select id="req_recruiterId" name="req_recruiterId" defaultValue="">
                  <option value="">— Unassigned</option>
                  {recruiters.map((r) => (
                    <option key={r.id} value={r.id}>
                      {optionLabel(r.fullName, r.isActive)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Engagement" htmlFor="req_engagement">
                <Select id="req_engagement" name="req_engagement" defaultValue="">
                  <option value="">—</option>
                  {BENCH_ENGAGEMENTS.map((e) => (
                    <option key={e} value={e}>
                      {BENCH_ENGAGEMENT_LABEL[e]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Location" htmlFor="req_location" hint="Defaults to the job location if left blank.">
              <Input id="req_location" name="req_location" />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Pay rate" htmlFor="req_payRate">
                <Input id="req_payRate" name="req_payRate" type="number" min="0" step="0.01" inputMode="decimal" />
              </Field>
              <Field label="Bill rate" htmlFor="req_billRate">
                <Input id="req_billRate" name="req_billRate" type="number" min="0" step="0.01" inputMode="decimal" />
              </Field>
              <Field label="Candidate rate" htmlFor="req_candidateRate">
                <Input id="req_candidateRate" name="req_candidateRate" type="number" min="0" step="0.01" inputMode="decimal" />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Vendor recruiter name" htmlFor="req_vendorRecruiterName">
                <Input id="req_vendorRecruiterName" name="req_vendorRecruiterName" />
              </Field>
              <Field label="Team lead" htmlFor="req_teamLead" hint="Auto-filled from the recruiter's team lead if blank.">
                <Input id="req_teamLead" name="req_teamLead" />
              </Field>
            </div>
          </div>
        </details>
      )}

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
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
