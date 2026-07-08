"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { Button } from "@/components/ui/button";
import {
  useUnsavedChanges,
  GuardedCancel,
} from "@/components/ui/unsaved-changes";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";
import {
  BENCH_PRIORITIES,
  BENCH_PRIORITY_LABEL,
  BENCH_MARKETING_STATUSES,
  BENCH_MARKETING_STATUS_LABEL,
} from "@/lib/labels";

export type BenchConsultantFormValues = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  currentLocation: string;
  workAuthorization: string;
  mVisa: string;
  aVisa: string;
  marketingExpYears: string;
  realTimeExpYears: string;
  technology: string;
  skills: string[];
  reference: string;
  company: string;
  projectType: string;
  leastRateC2C: string;
  callType: string;
  payrollType: string;
  relocation: boolean;
  marketingStartDate: string;
  marketingEmail: string;
  marketingPassword: string;
  marketingNumber: string;
  personalNumber: string;
  priority: string;
  marketingStatus: string;
  notes: string;
  isActive: boolean;
  recruiterId: string;
  candidateId: string;
};

type BenchAction = (prev: FormState, formData: FormData) => Promise<FormState>;
type Option = { id: string; fullName: string };

/** Sentinel value for the candidate picker's "➕ Create new candidate" action. */
const NEW_CAND = "__new__";

type Fields = Omit<
  BenchConsultantFormValues,
  "id" | "skills" | "relocation" | "isActive"
> & { skills: string };

function initialFields(v?: BenchConsultantFormValues): Fields {
  return {
    fullName: v?.fullName ?? "",
    email: v?.email ?? "",
    phone: v?.phone ?? "",
    currentLocation: v?.currentLocation ?? "",
    workAuthorization: v?.workAuthorization ?? "",
    mVisa: v?.mVisa ?? "",
    aVisa: v?.aVisa ?? "",
    marketingExpYears: v?.marketingExpYears ?? "",
    realTimeExpYears: v?.realTimeExpYears ?? "",
    technology: v?.technology ?? "",
    skills: v?.skills.join(", ") ?? "",
    reference: v?.reference ?? "",
    company: v?.company ?? "",
    projectType: v?.projectType ?? "",
    leastRateC2C: v?.leastRateC2C ?? "",
    callType: v?.callType ?? "",
    payrollType: v?.payrollType ?? "",
    marketingStartDate: v?.marketingStartDate ?? "",
    marketingEmail: v?.marketingEmail ?? "",
    marketingPassword: v?.marketingPassword ?? "",
    marketingNumber: v?.marketingNumber ?? "",
    personalNumber: v?.personalNumber ?? "",
    priority: v?.priority ?? "SECOND",
    marketingStatus: v?.marketingStatus ?? "ACTIVE",
    notes: v?.notes ?? "",
    recruiterId: v?.recruiterId ?? "",
    candidateId: v?.candidateId ?? "",
  };
}

export function BenchConsultantForm({
  action,
  values,
  submitLabel,
  recruiters,
  candidates,
  canEditCredentials,
}: {
  action: BenchAction;
  values?: BenchConsultantFormValues;
  submitLabel: string;
  recruiters: Option[];
  candidates: Option[];
  canEditCredentials: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const [fields, setFields] = useState<Fields>(() => initialFields(values));
  const [relocation, setRelocation] = useState(values?.relocation ?? false);
  const [isActive, setIsActive] = useState(values?.isActive ?? true);
  const [showMore, setShowMore] = useState(false);

  const set =
    (name: keyof Fields) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setFields((f) => ({ ...f, [name]: e.target.value }));

  const errors = state.fieldErrors ?? {};
  const cancelHref = values ? `/bench/${values.id}` : "/bench";

  // Unsaved-changes guard — any user input arms the leave prompt + Cancel confirm.
  const [dirty, setDirty] = useState(false);
  const markDirty = () => setDirty((d) => (d ? d : true));
  useUnsavedChanges(dirty);

  const isEdit = Boolean(values);
  const creatingNew = fields.candidateId === NEW_CAND;

  return (
    <form action={formAction} onInput={markDirty} className="space-y-6">
      {values && <input type="hidden" name="id" value={values.id} />}

      {/* ── Identity: every bench consultant IS a candidate ───────────
          Create mode → pick an existing candidate or create a new one.
          Edit mode → the linked candidate is fixed (shown read-only). */}
      <section className="space-y-4">
        {isEdit ? (
          <>
            <Field label="Candidate">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <span className="font-medium">{fields.fullName}</span>
                {fields.candidateId && (
                  <Link
                    href={`/candidates/${fields.candidateId}`}
                    className="text-indigo-600 hover:underline"
                  >
                    View candidate
                  </Link>
                )}
              </div>
            </Field>
            <input type="hidden" name="fullName" value={fields.fullName} />
            <input type="hidden" name="candidateId" value={fields.candidateId} />
          </>
        ) : (
          <>
            <Field
              label="Candidate"
              htmlFor="candidateId"
              required
              hint="Pick an existing candidate or create a new one — every bench consultant is also a candidate."
              error={errors.candidateId}
            >
              <SearchSelect
                id="candidateId"
                name="candidateId"
                value={fields.candidateId}
                onChange={(v) =>
                  setFields((f) =>
                    v === NEW_CAND
                      ? { ...f, candidateId: NEW_CAND, fullName: "" }
                      : {
                          ...f,
                          candidateId: v,
                          fullName:
                            candidates.find((c) => c.id === v)?.fullName ?? "",
                        },
                  )
                }
                placeholder="Search candidates…"
                options={candidates.map((c) => ({
                  value: c.id,
                  label: c.fullName,
                }))}
                actionOption={{ value: NEW_CAND, label: "➕ Create new candidate" }}
              />
            </Field>
            {creatingNew ? (
              <Field
                label="New candidate name"
                htmlFor="fullName"
                required
                hint="Also add an email or phone below — a new candidate needs a contact."
                error={errors.fullName}
              >
                <Input
                  id="fullName"
                  name="fullName"
                  value={fields.fullName}
                  onChange={set("fullName")}
                  required
                  placeholder="Full name"
                />
              </Field>
            ) : (
              fields.fullName && (
                <input type="hidden" name="fullName" value={fields.fullName} />
              )
            )}
          </>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Priority" htmlFor="priority" error={errors.priority}>
            <Select id="priority" name="priority" value={fields.priority} onChange={set("priority")}>
              {BENCH_PRIORITIES.map((p) => (
                <option key={p} value={p}>{BENCH_PRIORITY_LABEL[p]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Marketing status" htmlFor="marketingStatus" error={errors.marketingStatus}>
            <Select id="marketingStatus" name="marketingStatus" value={fields.marketingStatus} onChange={set("marketingStatus")}>
              {BENCH_MARKETING_STATUSES.map((s) => (
                <option key={s} value={s}>{BENCH_MARKETING_STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Marketing recruiter" htmlFor="recruiterId" error={errors.recruiterId}>
            <SearchSelect
              id="recruiterId"
              name="recruiterId"
              value={fields.recruiterId}
              onChange={(v) => setFields((f) => ({ ...f, recruiterId: v }))}
              placeholder="Search recruiters…"
              options={[
                { value: "", label: "— Unassigned —" },
                ...recruiters.map((r) => ({ value: r.id, label: r.fullName })),
              ]}
            />
          </Field>
          <Field label="Technology" htmlFor="technology" error={errors.technology}>
            <Input id="technology" name="technology" value={fields.technology} onChange={set("technology")} placeholder="e.g. Java / AWS" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Marketing email (contact)" htmlFor="email" error={errors.email}>
            <Input id="email" name="email" type="email" value={fields.email} onChange={set("email")} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={errors.phone}>
            <Input id="phone" name="phone" value={fields.phone} onChange={set("phone")} />
          </Field>
          <Field label="Current location" htmlFor="currentLocation" error={errors.currentLocation}>
            <Input id="currentLocation" name="currentLocation" value={fields.currentLocation} onChange={set("currentLocation")} />
          </Field>
          <Field label="Least rate on C2C" htmlFor="leastRateC2C" error={errors.leastRateC2C}>
            <Input id="leastRateC2C" name="leastRateC2C" type="number" min="0" step="0.01" value={fields.leastRateC2C} onChange={set("leastRateC2C")} placeholder="$/hr" />
          </Field>
        </div>
      </section>

      {/* ── Visa + experience ─────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="M Visa" htmlFor="mVisa" error={errors.mVisa}>
          <Input id="mVisa" name="mVisa" value={fields.mVisa} onChange={set("mVisa")} placeholder="e.g. H-1B" />
        </Field>
        <Field label="A Visa" htmlFor="aVisa" error={errors.aVisa}>
          <Input id="aVisa" name="aVisa" value={fields.aVisa} onChange={set("aVisa")} placeholder="e.g. GC-EAD" />
        </Field>
        <Field label="Marketing experience (years)" htmlFor="marketingExpYears" error={errors.marketingExpYears}>
          <Input id="marketingExpYears" name="marketingExpYears" type="number" min="0" step="0.1" value={fields.marketingExpYears} onChange={set("marketingExpYears")} />
        </Field>
        <Field label="Real-time experience (years)" htmlFor="realTimeExpYears" error={errors.realTimeExpYears}>
          <Input id="realTimeExpYears" name="realTimeExpYears" type="number" min="0" step="0.1" value={fields.realTimeExpYears} onChange={set("realTimeExpYears")} />
        </Field>
      </section>

      <Field label="Skills" htmlFor="skills" hint="Separate skills with commas." error={errors.skills}>
        <Input id="skills" name="skills" value={fields.skills} onChange={set("skills")} placeholder="Java, Spring Boot, AWS" />
      </Field>

      {/* ── More details (collapsible) ────────────────────────────── */}
      <div className="rounded-lg border border-slate-200">
        <button
          type="button"
          onClick={() => setShowMore((s) => !s)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700"
          aria-expanded={showMore}
        >
          More details
          <span className="text-slate-400">{showMore ? "−" : "+"}</span>
        </button>
        {showMore && (
          <div className="space-y-4 border-t border-slate-200 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Reference" htmlFor="reference" error={errors.reference}>
                <Input id="reference" name="reference" value={fields.reference} onChange={set("reference")} />
              </Field>
              <Field label="Company" htmlFor="company" error={errors.company}>
                <Input id="company" name="company" value={fields.company} onChange={set("company")} />
              </Field>
              <Field label="Project type" htmlFor="projectType" error={errors.projectType}>
                <Input id="projectType" name="projectType" value={fields.projectType} onChange={set("projectType")} placeholder="Contract / C2H / Full-time" />
              </Field>
              <Field label="Call type" htmlFor="callType" error={errors.callType}>
                <Input id="callType" name="callType" value={fields.callType} onChange={set("callType")} placeholder="C2C / W2 / Any" />
              </Field>
              <Field label="Payroll type" htmlFor="payrollType" error={errors.payrollType}>
                <Input id="payrollType" name="payrollType" value={fields.payrollType} onChange={set("payrollType")} placeholder="W2 / C2C / 1099" />
              </Field>
              <Field label="Marketing start date" htmlFor="marketingStartDate" error={errors.marketingStartDate}>
                <Input id="marketingStartDate" name="marketingStartDate" type="date" value={fields.marketingStartDate} onChange={set("marketingStartDate")} />
              </Field>
              <Field label="Work authorization (free-text)" htmlFor="workAuthorization" error={errors.workAuthorization}>
                <Input id="workAuthorization" name="workAuthorization" value={fields.workAuthorization} onChange={set("workAuthorization")} />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" name="relocation" checked={relocation} onChange={(e) => setRelocation(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-200" />
              Open to relocation
            </label>

            <Field label="Notes" htmlFor="notes" error={errors.notes}>
              <Textarea id="notes" name="notes" rows={3} value={fields.notes} onChange={set("notes")} />
            </Field>
          </div>
        )}
      </div>

      {/* ── Marketing credentials (admin only) ────────────────────── */}
      {canEditCredentials && (
        <section className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
          <div>
            <p className="text-sm font-medium text-slate-700">Marketing credentials</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Admin-only. Stored for portal access — shown on the detail page only, never on lists or exports.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Marketing email (login)" htmlFor="marketingEmail" error={errors.marketingEmail}>
              <Input id="marketingEmail" name="marketingEmail" type="email" value={fields.marketingEmail} onChange={set("marketingEmail")} />
            </Field>
            <Field label="Password" htmlFor="marketingPassword" error={errors.marketingPassword}>
              <Input id="marketingPassword" name="marketingPassword" value={fields.marketingPassword} onChange={set("marketingPassword")} />
            </Field>
            <Field label="Marketing number" htmlFor="marketingNumber" error={errors.marketingNumber}>
              <Input id="marketingNumber" name="marketingNumber" value={fields.marketingNumber} onChange={set("marketingNumber")} />
            </Field>
            <Field label="Personal number" htmlFor="personalNumber" error={errors.personalNumber}>
              <Input id="personalNumber" name="personalNumber" value={fields.personalNumber} onChange={set("personalNumber")} />
            </Field>
          </div>
        </section>
      )}

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" name="isActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-200" />
          Active on bench
        </label>
        <p className="mt-1 text-xs text-slate-500">
          Uncheck to retire a consultant who is no longer being marketed.
        </p>
      </div>

      {state.error || errors.form ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error ?? errors.form}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <GuardedCancel href={cancelHref} dirty={dirty} />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
