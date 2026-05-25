"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Button, buttonClass } from "@/components/ui/button";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";

export type CandidateFormValues = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  currentLocation: string;
  workAuthorization: string;
  totalExperienceYears: string;
  currentCompany: string;
  skills: string[];
  linkedinUrl: string;
  notes: string;
  isActive: boolean;
};

type CandidateAction = (prev: FormState, formData: FormData) => Promise<FormState>;

type Fields = {
  fullName: string;
  email: string;
  phone: string;
  currentLocation: string;
  workAuthorization: string;
  totalExperienceYears: string;
  currentCompany: string;
  skills: string;
  linkedinUrl: string;
  notes: string;
};

function initialFields(values?: CandidateFormValues): Fields {
  if (!values) {
    return {
      fullName: "",
      email: "",
      phone: "",
      currentLocation: "",
      workAuthorization: "",
      totalExperienceYears: "",
      currentCompany: "",
      skills: "",
      linkedinUrl: "",
      notes: "",
    };
  }
  return {
    fullName: values.fullName,
    email: values.email,
    phone: values.phone,
    currentLocation: values.currentLocation,
    workAuthorization: values.workAuthorization,
    totalExperienceYears: values.totalExperienceYears,
    currentCompany: values.currentCompany,
    skills: values.skills.join(", "),
    linkedinUrl: values.linkedinUrl,
    notes: values.notes,
  };
}

export function CandidateForm({
  action,
  values,
  submitLabel,
}: {
  action: CandidateAction;
  values?: CandidateFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  // Inputs are controlled — React 19 resets uncontrolled <form action> fields
  // after every submit, which would wipe entries on a validation or duplicate
  // warning. Controlled state survives those non-redirect returns.
  const [fields, setFields] = useState<Fields>(() => initialFields(values));
  // New candidates default to Active; an existing one keeps its saved status.
  const [isActive, setIsActive] = useState(values?.isActive ?? true);
  const set =
    (name: keyof Fields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setFields((f) => ({ ...f, [name]: e.target.value }));

  const errors = state.fieldErrors ?? {};
  const cancelHref = values ? `/candidates/${values.id}` : "/candidates";

  return (
    <form action={formAction} className="space-y-5">
      {values && <input type="hidden" name="id" value={values.id} />}

      <Field label="Full name" htmlFor="fullName" required error={errors.fullName}>
        <Input
          id="fullName"
          name="fullName"
          value={fields.fullName}
          onChange={set("fullName")}
          required
        />
      </Field>

      <div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input
              id="email"
              name="email"
              type="email"
              value={fields.email}
              onChange={set("email")}
            />
          </Field>
          <Field label="Phone" htmlFor="phone" error={errors.phone}>
            <Input
              id="phone"
              name="phone"
              value={fields.phone}
              onChange={set("phone")}
            />
          </Field>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Enter at least an email address or a phone number.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Current location"
          htmlFor="currentLocation"
          error={errors.currentLocation}
        >
          <Input
            id="currentLocation"
            name="currentLocation"
            value={fields.currentLocation}
            onChange={set("currentLocation")}
          />
        </Field>
        <Field
          label="Work authorization"
          htmlFor="workAuthorization"
          error={errors.workAuthorization}
        >
          <Input
            id="workAuthorization"
            name="workAuthorization"
            value={fields.workAuthorization}
            onChange={set("workAuthorization")}
            placeholder="e.g. US Citizen, H-1B, Green Card"
          />
        </Field>
        <Field
          label="Total experience (years)"
          htmlFor="totalExperienceYears"
          error={errors.totalExperienceYears}
        >
          <Input
            id="totalExperienceYears"
            name="totalExperienceYears"
            type="number"
            min="0"
            step="0.1"
            value={fields.totalExperienceYears}
            onChange={set("totalExperienceYears")}
          />
        </Field>
        <Field
          label="Current company"
          htmlFor="currentCompany"
          error={errors.currentCompany}
        >
          <Input
            id="currentCompany"
            name="currentCompany"
            value={fields.currentCompany}
            onChange={set("currentCompany")}
          />
        </Field>
      </div>

      <Field
        label="Skills"
        htmlFor="skills"
        hint="Separate skills with commas."
        error={errors.skills}
      >
        <Input
          id="skills"
          name="skills"
          value={fields.skills}
          onChange={set("skills")}
          placeholder="Java, Spring Boot, AWS"
        />
      </Field>

      <Field
        label="LinkedIn URL"
        htmlFor="linkedinUrl"
        hint="Résumés are managed on the candidate's page after saving."
        error={errors.linkedinUrl}
      >
        <Input
          id="linkedinUrl"
          name="linkedinUrl"
          type="url"
          value={fields.linkedinUrl}
          onChange={set("linkedinUrl")}
          placeholder="https://linkedin.com/in/…"
        />
      </Field>

      <Field label="Notes" htmlFor="notes" error={errors.notes}>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          value={fields.notes}
          onChange={set("notes")}
        />
      </Field>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-200"
          />
          Active candidate
        </label>
        <p className="mt-1 text-xs text-slate-500">
          Uncheck to retire a candidate who is no longer available — their past
          submissions are kept.
        </p>
      </div>

      {/* Once the user has been warned, this flag tells the action to skip the
          duplicate check on the next submit. */}
      {state.needsConfirm && <input type="hidden" name="confirmed" value="true" />}

      {state.needsConfirm ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {state.error}
        </div>
      ) : state.error || errors.form ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error ?? errors.form}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <Link href={cancelHref} className={buttonClass("secondary")}>
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : state.needsConfirm ? "Save anyway" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
