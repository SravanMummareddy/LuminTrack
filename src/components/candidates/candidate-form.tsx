"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Star, Plus, X } from "lucide-react";
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
  featuredSkills: string[];
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
  // Featured (starred) skills — ≤3, must be a subset of the parsed skills.
  // Kept in component state so the chip row reacts to skill edits live.
  const [featured, setFeatured] = useState<string[]>(values?.featuredSkills ?? []);
  const parsedSkills = useMemo(
    () =>
      Array.from(
        new Set(
          fields.skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ),
    [fields.skills],
  );
  // Prune any starred skill that's no longer in the parsed list.
  useEffect(() => {
    setFeatured((prev) => prev.filter((s) => parsedSkills.includes(s)));
  }, [parsedSkills]);
  function toggleFeatured(skill: string) {
    setFeatured((prev) =>
      prev.includes(skill)
        ? prev.filter((s) => s !== skill)
        : prev.length >= 3
          ? prev
          : [...prev, skill],
    );
  }
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

      {parsedSkills.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-slate-700">
              Featured skills
            </p>
            <span className="text-xs tabular-nums text-slate-500">
              {featured.length} / 3 picked
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Pick up to 3 — these show first on the candidate list. Optional.
          </p>

          {featured.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {featured.map((s) => (
                <span
                  key={s}
                  title={s}
                  className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 py-1 pl-2 pr-1 text-xs font-medium text-amber-900"
                >
                  <Star className="h-3 w-3 shrink-0 fill-amber-500 text-amber-500" aria-hidden />
                  <span className="truncate">{s}</span>
                  <button
                    type="button"
                    onClick={() => toggleFeatured(s)}
                    aria-label={`Remove ${s}`}
                    className="rounded p-0.5 text-amber-700 hover:bg-amber-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {parsedSkills.some((s) => !featured.includes(s)) && (
            <>
              <div className="mt-3 flex items-center gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {featured.length === 0 ? "Tap to feature" : "More skills"}
                </p>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {parsedSkills
                  .filter((s) => !featured.includes(s))
                  .map((s) => {
                    const disabled = featured.length >= 3;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleFeatured(s)}
                        disabled={disabled}
                        title={s}
                        className={
                          "inline-flex max-w-[14rem] items-center gap-1 rounded-md border px-2 py-1 text-xs transition " +
                          (disabled
                            ? "cursor-not-allowed border-slate-200 bg-white text-slate-400"
                            : "border-slate-300 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900")
                        }
                      >
                        <Plus className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{s}</span>
                      </button>
                    );
                  })}
              </div>
            </>
          )}

          {errors.featuredSkills && (
            <p className="mt-2 text-xs text-red-600">{errors.featuredSkills}</p>
          )}
          {featured.map((s) => (
            <input key={s} type="hidden" name="featuredSkills" value={s} />
          ))}
        </div>
      )}

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
