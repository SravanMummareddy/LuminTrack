"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { Button, buttonClass } from "@/components/ui/button";
import { JOB_STATUSES, JOB_STATUS_LABEL, OTHER_SOURCE } from "@/lib/labels";
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
}: {
  action: JobAction;
  clients: Option[];
  vendors: Option[];
  sources: Option[];
  recruiters: Recruiter[];
  values?: JobFormValues;
  submitLabel: string;
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
          error={errors.sisterCompanySourceId}
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

      {isOtherSource && (
        <Field
          label="Source name"
          htmlFor="sourceOther"
          required
          error={errors.sourceOther}
        >
          <Input
            id="sourceOther"
            name="sourceOther"
            defaultValue={values?.sourceOther ?? ""}
            placeholder="e.g. LinkedIn, referral, direct application"
          />
        </Field>
      )}

      <Field label="Location" htmlFor="location" error={errors.location}>
        <Input
          id="location"
          name="location"
          defaultValue={values?.location ?? ""}
          placeholder="e.g. Remote, New York, NY"
        />
      </Field>

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
