"use client";

import { useActionState, useState } from "react";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { LocationInput } from "@/components/ui/location-input";
import { SearchSelect } from "@/components/ui/search-select";
import { Button } from "@/components/ui/button";
import {
  useUnsavedChanges,
  GuardedCancel,
} from "@/components/ui/unsaved-changes";
import {
  JOB_STATUSES,
  JOB_STATUS_LABEL,
  OTHER_SOURCE,
  NEW_ORG_ENTITY,
  WORK_MODES,
  WORK_MODE_LABEL,
  JOB_PRIORITIES,
  JOB_PRIORITY_LABEL,
  DISCIPLINES,
  DISCIPLINE_LABEL,
} from "@/lib/labels";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";

type Option = { id: string; name: string; isActive: boolean };

export type JobFormValues = {
  id: string;
  title: string;
  clientId: string;
  vendorId: string;
  sisterCompanySourceId: string;
  sourceOther: string;
  status: string;
  location: string;
  clientRate: string;
  vendorRate: string;
  description: string;
  notes: string;
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
  discipline: string;
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
  values,
  submitLabel,
  canCreateOrgEntities = false,
  canManageRatesAndAssignment = true,
}: {
  action: JobAction;
  clients: Option[];
  vendors: Option[];
  sources: Option[];
  values?: JobFormValues;
  submitLabel: string;
  /** Allow adding a new client/vendor inline (managers/team leads only). */
  canCreateOrgEntities?: boolean;
  /** Show the commercial rate fields. Recruiters may edit basic job details but
   *  not rates — those are hidden for them (and the server enforces the same). */
  canManageRatesAndAssignment?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const errors = state.fieldErrors ?? {};
  const cancelHref = values ? `/jobs/${values.id}` : "/jobs";

  // Unsaved-changes guard — any user input arms the leave prompt + Cancel confirm.
  const [dirty, setDirty] = useState(false);
  const markDirty = () => setDirty((d) => (d ? d : true));
  useUnsavedChanges(dirty);

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

  // Client / Vendor are controlled so picking "+ Add new…" can reveal a name
  // box inline (resolved to a created-or-reused record by the action).
  const [clientValue, setClientValue] = useState(values?.clientId ?? "");
  const [vendorValue, setVendorValue] = useState(values?.vendorId ?? "");
  const isNewClient = clientValue === NEW_ORG_ENTITY;
  const isNewVendor = vendorValue === NEW_ORG_ENTITY;

  return (
    <form action={formAction} onInput={markDirty} className="space-y-5">
      {values && <input type="hidden" name="id" value={values.id} />}

      <Field label="Job title" htmlFor="title" required error={errors.title}>
        <Input id="title" name="title" defaultValue={values?.title ?? ""} required />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Client"
          htmlFor="clientId"
          required
          error={errors.clientId}
          hint="The end company where the consultant will work."
        >
          <SearchSelect
            id="clientId"
            name="clientId"
            value={clientValue}
            onChange={setClientValue}
            placeholder="Select or type a client…"
            options={clients.map((c) => ({
              value: c.id,
              label: optionLabel(c.name, c.isActive),
            }))}
            actionOption={
              canCreateOrgEntities
                ? { value: NEW_ORG_ENTITY, label: "+ Add new client…" }
                : undefined
            }
          />
          {isNewClient && (
            <Input
              name="newClientName"
              placeholder="Type the new client name"
              className="mt-2"
              autoFocus
            />
          )}
        </Field>

        <Field
          label="Vendor"
          htmlFor="vendorId"
          required
          error={errors.vendorId}
          hint="The staffing vendor we work through (e.g. Randstad)."
        >
          <SearchSelect
            id="vendorId"
            name="vendorId"
            value={vendorValue}
            onChange={setVendorValue}
            placeholder="Select or type a vendor…"
            options={vendors.map((v) => ({
              value: v.id,
              label: optionLabel(v.name, v.isActive),
            }))}
            actionOption={
              canCreateOrgEntities
                ? { value: NEW_ORG_ENTITY, label: "+ Add new vendor…" }
                : undefined
            }
          />
          {isNewVendor && (
            <Input
              name="newVendorName"
              placeholder="Type the new vendor name"
              className="mt-2"
              autoFocus
            />
          )}
        </Field>

        <Field
          label="Source"
          htmlFor="sisterCompanySourceId"
          required
          error={errors.sisterCompanySourceId ?? errors.sourceOther}
          hint="Where this job came from — a job board, referral, or contact."
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

        <Field label="Status" htmlFor="status" required error={errors.status}>
          <Select
            id="status"
            name="status"
            defaultValue={values?.status ?? "OPEN"}
            required
          >
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {JOB_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Discipline" htmlFor="discipline" error={errors.discipline}>
          <Select
            id="discipline"
            name="discipline"
            defaultValue={values?.discipline ?? ""}
          >
            <option value="">—</option>
            {DISCIPLINES.map((d) => (
              <option key={d} value={d}>
                {DISCIPLINE_LABEL[d]}
              </option>
            ))}
          </Select>
        </Field>

        {canManageRatesAndAssignment && (
          <Field
            label="Client rate"
            htmlFor="clientRate"
            error={errors.clientRate}
            hint="$/hr the end client releases. Bill & pay rates are set later on the vendor requirement."
          >
            <Input
              id="clientRate"
              name="clientRate"
              type="number"
              min="0"
              step="0.01"
              defaultValue={values?.clientRate ?? ""}
            />
          </Field>
        )}
      </div>

      <Field label="Location" htmlFor="location" error={errors.location}>
        <LocationInput
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
          Fill what you have — every field is optional.
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
          {canManageRatesAndAssignment && (
            <Field
              label="Vendor rate"
              htmlFor="vendorRate"
              error={errors.vendorRate}
              hint="$/hr the vendor releases to us. Usually set on the requirement instead."
            >
              <Input
                id="vendorRate"
                name="vendorRate"
                type="number"
                min="0"
                step="0.01"
                defaultValue={values?.vendorRate ?? ""}
              />
            </Field>
          )}
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

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <GuardedCancel href={cancelHref} dirty={dirty} />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
