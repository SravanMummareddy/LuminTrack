"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { DateField } from "@/components/ui/date-field";
import { LocationInput } from "@/components/ui/location-input";
import { SuggestInput } from "@/components/ui/suggest-input";
import { VISA_OPTIONS } from "@/lib/visa-options";
import { SearchSelect } from "@/components/ui/search-select";
import { FormSection } from "@/components/ui/form-section";
import { NullableField, NaToggle } from "@/components/ui/nullable-field";
import { Button } from "@/components/ui/button";
import {
  useUnsavedChanges,
  GuardedCancel,
  GuardedLink,
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
  relocationCities: string;
  marketingStartDate: string;
  marketingEmail: string;
  marketingPassword: string;
  marketingNumber: string;
  priority: string;
  marketingStatus: string;
  notes: string;
  isActive: boolean;
  recruiterId: string;
  candidateId: string;
};

/** The candidate picker's options carry the fields the bench prefills. */
export type BenchCandidateOption = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  currentLocation: string;
  workAuthorization: string;
  skills: string[];
  technology: string;
  currentCompany: string;
  reference: string;
  realTimeExpYears: string;
  /** Already actively on the bench — shown greyed + non-selectable in the picker. */
  onBench?: boolean;
};

type BenchAction = (prev: FormState, formData: FormData) => Promise<FormState>;
type Recruiter = { id: string; fullName: string };

const NEW_CAND = "__new__";

type Fields = {
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
  skills: string;
  reference: string;
  company: string;
  projectType: string;
  leastRateC2C: string;
  callType: string;
  payrollType: string;
  relocationMode: string;
  relocationCities: string;
  marketingStartDate: string;
  marketingEmail: string;
  marketingPassword: string;
  marketingNumber: string;
  priority: string;
  marketingStatus: string;
  notes: string;
  recruiterId: string;
  candidateId: string;
};

/** Derive the 3-way relocation mode from the stored boolean + cities (also
 *  salvages the old inverted data where cities lived with relocation=false). */
function toRelocationMode(v?: BenchConsultantFormValues): string {
  if (!v) return "";
  if (v.relocationCities) return "SPECIFIC";
  return v.relocation ? "ANYWHERE" : "NO";
}

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
    relocationMode: toRelocationMode(v),
    relocationCities: v?.relocationCities ?? "",
    marketingStartDate: v?.marketingStartDate ?? "",
    marketingEmail: v?.marketingEmail ?? "",
    marketingPassword: v?.marketingPassword ?? "",
    marketingNumber: v?.marketingNumber ?? "",
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
  linkedCandidate,
  canEditCredentials,
  callTypeOptions = [],
  payrollTypeOptions = [],
  projectTypeOptions = [],
}: {
  action: BenchAction;
  values?: BenchConsultantFormValues;
  submitLabel: string;
  recruiters: Recruiter[];
  candidates: BenchCandidateOption[];
  /** The linked candidate's live values, for the read-only panel (edit mode). */
  linkedCandidate?: BenchCandidateOption;
  canEditCredentials: boolean;
  callTypeOptions?: string[];
  payrollTypeOptions?: string[];
  projectTypeOptions?: string[];
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const [fields, setFields] = useState<Fields>(() => initialFields(values));
  // React 19 post-action reset snaps controlled <select>s — remount them on each
  // response so priority / status / relocation re-sync.
  const [selectSyncKey, setSelectSyncKey] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectSyncKey((k) => k + 1);
  }, [state]);

  const [aVisaNa, setAVisaNa] = useState(
    values ? !values.aVisa : false,
  );
  const [leastRateNa, setLeastRateNa] = useState(
    values ? !values.leastRateC2C : false,
  );
  const [credsNa, setCredsNa] = useState(
    // Fresh add → default to "not set up yet": a portal login usually doesn't
    // exist yet when someone is first put on the bench, so don't force it.
    values ? !(values.marketingEmail || values.marketingPassword || values.marketingNumber) : true,
  );

  const set =
    (name: keyof Fields) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setFields((f) => ({ ...f, [name]: e.target.value }));

  const parsedSkills = useMemo(
    () =>
      Array.from(
        new Set(fields.skills.split(",").map((s) => s.trim()).filter(Boolean)),
      ),
    [fields.skills],
  );
  function rememberTechInSkills(value: string) {
    const tech = value.trim();
    if (!tech) return;
    setFields((f) => {
      const skills = f.skills.split(",").map((s) => s.trim()).filter(Boolean);
      if (skills.some((s) => s.toLowerCase() === tech.toLowerCase())) return f;
      return { ...f, skills: [...skills, tech].join(", ") };
    });
  }

  const errors = state.fieldErrors ?? {};
  const cancelHref = values ? `/bench/${values.id}` : "/bench";

  const [dirty, setDirty] = useState(false);
  const markDirty = () => setDirty((d) => (d ? d : true));
  useUnsavedChanges(dirty);

  const isEdit = Boolean(values);
  const creatingNew = fields.candidateId === NEW_CAND;

  // Picking an existing candidate prefills the marketing snapshot from them.
  function onCandidatePick(v: string) {
    markDirty();
    if (v === NEW_CAND) {
      setFields((f) => ({ ...f, candidateId: NEW_CAND, fullName: "" }));
      return;
    }
    const c = candidates.find((x) => x.id === v);
    setFields((f) => ({
      ...f,
      candidateId: v,
      fullName: c?.fullName ?? "",
      // `||` (not `??`): a candidate with a blank email/phone/etc. must fall back
      // to what the user already typed, not overwrite it with "" (?? only catches
      // null/undefined, so an empty-string candidate field would clobber input).
      email: c?.email || f.email,
      phone: c?.phone || f.phone,
      currentLocation: c?.currentLocation || f.currentLocation,
      workAuthorization: c?.workAuthorization || f.workAuthorization,
      skills: c && c.skills.length ? c.skills.join(", ") : f.skills,
      technology: c?.technology || f.technology,
      company: c?.currentCompany || f.company,
      reference: c?.reference || f.reference,
      realTimeExpYears: c?.realTimeExpYears || f.realTimeExpYears,
    }));
  }

  const panel = isEdit
    ? linkedCandidate
    : candidates.find((c) => c.id === fields.candidateId);

  return (
    <form action={formAction} onInput={markDirty} className="space-y-5">
      {values && <input type="hidden" name="id" value={values.id} />}

      {/* ── 1. Consultant ───────────────────────────────────────────── */}
      <FormSection n={1} title="Consultant">
        {isEdit ? (
          <>
            <Field label="Candidate">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <span className="font-medium">{fields.fullName}</span>
                {fields.candidateId && (
                  <GuardedLink href={`/candidates/${fields.candidateId}`} dirty={dirty}>
                    View candidate
                  </GuardedLink>
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
              hint="Pick an existing candidate (their details prefill below) or create a new one."
              error={errors.candidateId}
            >
              <SearchSelect
                id="candidateId"
                name="candidateId"
                value={fields.candidateId}
                onChange={onCandidatePick}
                placeholder="Search candidates…"
                options={candidates.map((c) => ({
                  value: c.id,
                  label: c.fullName,
                  // Already-benched candidates can't be re-added — grey them out
                  // instead of letting the user fill the whole form then error.
                  disabled: c.onBench,
                  hint: c.onBench ? "already on the bench" : undefined,
                }))}
                actionOption={{ value: NEW_CAND, label: "➕ Create new candidate" }}
              />
            </Field>
            {creatingNew ? (
              <Field
                label="New candidate name"
                htmlFor="fullName"
                required
                hint="Also add an email + phone below — a new candidate needs a contact."
                error={errors.fullName}
              >
                <Input id="fullName" name="fullName" value={fields.fullName} onChange={set("fullName")} required placeholder="Full name" />
              </Field>
            ) : (
              fields.fullName && <input type="hidden" name="fullName" value={fields.fullName} />
            )}
          </>
        )}

        {panel && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
              From the candidate · {panel.fullName}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
              <div><dt className="text-[11px] uppercase text-indigo-500">Email</dt><dd className="truncate text-slate-800">{panel.email || "—"}</dd></div>
              <div><dt className="text-[11px] uppercase text-indigo-500">Phone</dt><dd className="text-slate-800">{panel.phone || "—"}</dd></div>
              <div><dt className="text-[11px] uppercase text-indigo-500">Location</dt><dd className="text-slate-800">{panel.currentLocation || "—"}</dd></div>
              <div><dt className="text-[11px] uppercase text-indigo-500">Company</dt><dd className="text-slate-800">{panel.currentCompany || "—"}</dd></div>
              <div><dt className="text-[11px] uppercase text-indigo-500">Work auth</dt><dd className="text-slate-800">{panel.workAuthorization || "—"}</dd></div>
              <div><dt className="text-[11px] uppercase text-indigo-500">Reference</dt><dd className="text-slate-800">{panel.reference || "—"}</dd></div>
            </dl>
            <p className="mt-2 text-[11px] text-indigo-500">
              The marketing snapshot below starts prefilled from these and stays editable.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Contact email" htmlFor="email" required error={errors.email}>
            <Input id="email" name="email" type="email" value={fields.email} onChange={set("email")} />
          </Field>
          <Field label="Phone" htmlFor="phone" required error={errors.phone}>
            <Input id="phone" name="phone" value={fields.phone} onChange={set("phone")} />
          </Field>
          <Field label="Current location" htmlFor="currentLocation" required error={errors.currentLocation}>
            <LocationInput id="currentLocation" name="currentLocation" value={fields.currentLocation} onChange={set("currentLocation")} placeholder="e.g. Memphis, TN" />
          </Field>
          <Field label="Marketing recruiter" htmlFor="recruiterId" error={errors.recruiterId} hint="Optional.">
            <SearchSelect
              id="recruiterId"
              name="recruiterId"
              value={fields.recruiterId}
              onChange={(v) => setFields((f) => ({ ...f, recruiterId: v }))}
              placeholder="Search recruiters…"
              options={[{ value: "", label: "— Unassigned —" }, ...recruiters.map((r) => ({ value: r.id, label: r.fullName }))]}
            />
          </Field>
          <Field label="Company" htmlFor="company" required error={errors.company}>
            <Input id="company" name="company" value={fields.company} onChange={set("company")} />
          </Field>
          <Field label="Reference" htmlFor="reference" required error={errors.reference}>
            <Input id="reference" name="reference" value={fields.reference} onChange={set("reference")} />
          </Field>
        </div>
        <Field label="Skills" htmlFor="skills" required hint="Separate skills with commas." error={errors.skills}>
          <Input id="skills" name="skills" value={fields.skills} onChange={set("skills")} placeholder="Java, Spring Boot, AWS" />
        </Field>
      </FormSection>

      {/* ── 2. Marketing profile ────────────────────────────────────── */}
      <FormSection n={2} title="Marketing profile">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Marketing status" htmlFor="marketingStatus" required error={errors.marketingStatus}>
            <Select key={`marketingStatus-${selectSyncKey}`} id="marketingStatus" name="marketingStatus" value={fields.marketingStatus} onChange={set("marketingStatus")}>
              {BENCH_MARKETING_STATUSES.map((s) => (<option key={s} value={s}>{BENCH_MARKETING_STATUS_LABEL[s]}</option>))}
            </Select>
          </Field>
          <Field label="Priority" htmlFor="priority" required error={errors.priority}>
            <Select key={`priority-${selectSyncKey}`} id="priority" name="priority" value={fields.priority} onChange={set("priority")}>
              {BENCH_PRIORITIES.map((p) => (<option key={p} value={p}>{BENCH_PRIORITY_LABEL[p]}</option>))}
            </Select>
          </Field>
          <Field label="Marketing experience (years)" htmlFor="marketingExpYears" required error={errors.marketingExpYears}>
            <Input id="marketingExpYears" name="marketingExpYears" type="number" min="0" step="0.1" value={fields.marketingExpYears} onChange={set("marketingExpYears")} />
          </Field>
          <Field label="Real-time experience (years)" htmlFor="realTimeExpYears" hint="Actual hands-on years (optional)." error={errors.realTimeExpYears}>
            <Input id="realTimeExpYears" name="realTimeExpYears" type="number" min="0" step="0.1" value={fields.realTimeExpYears} onChange={set("realTimeExpYears")} />
          </Field>
          <Field label="Technology" htmlFor="technology" hint="Primary focus tech — candidate-owned; a new one is added to Skills." error={errors.technology}>
            <SuggestInput id="technology" name="technology" value={fields.technology} suggestions={parsedSkills} onChange={set("technology")} onCommit={rememberTechInSkills} placeholder="e.g. Java" />
          </Field>
          <Field label="Marketing start date" htmlFor="marketingStartDate" hint="Optional." error={errors.marketingStartDate}>
            <DateField id="marketingStartDate" name="marketingStartDate" value={fields.marketingStartDate} onChange={(v) => setFields((f) => ({ ...f, marketingStartDate: v }))} />
          </Field>
          <Field label="Project type" htmlFor="projectType" required hint="Nature / duration of the engagement." error={errors.projectType}>
            <SuggestInput id="projectType" name="projectType" value={fields.projectType} suggestions={projectTypeOptions} onChange={set("projectType")} placeholder="Contract / Contract-to-Hire / Full-time" />
          </Field>
          <Field label="Call type" htmlFor="callType" required hint="Engagement types you'll take calls for." error={errors.callType}>
            <SuggestInput id="callType" name="callType" value={fields.callType} suggestions={callTypeOptions} onChange={set("callType")} placeholder="C2C / W2 / Any" />
          </Field>
          <Field label="Payroll type" htmlFor="payrollType" required error={errors.payrollType}>
            <SuggestInput id="payrollType" name="payrollType" value={fields.payrollType} suggestions={payrollTypeOptions} onChange={set("payrollType")} placeholder="W2 / C2C / 1099" />
          </Field>
        </div>
      </FormSection>

      {/* ── 3. Rates & work authorization ───────────────────────────── */}
      <FormSection n={3} title="Rates & work authorization">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NullableField label="Least rate on C2C" htmlFor="leastRateC2C" name="leastRateC2C" naLabel="Negotiable" na={leastRateNa} onToggleNa={(v) => { markDirty(); setLeastRateNa(v); if (v) setFields((f) => ({ ...f, leastRateC2C: "" })); }} error={errors.leastRateC2C} hint="$/hr floor.">
            <Input id="leastRateC2C" name="leastRateC2C" type="number" min="0" step="0.01" value={leastRateNa ? "" : fields.leastRateC2C} onChange={set("leastRateC2C")} disabled={leastRateNa} placeholder="$/hr" />
          </NullableField>
          <Field label="Work authorization" htmlFor="workAuthorization" required hint="Actual status (from the candidate)." error={errors.workAuthorization}>
            <SuggestInput id="workAuthorization" name="workAuthorization" value={fields.workAuthorization} options={VISA_OPTIONS} maxResults={VISA_OPTIONS.length} onChange={set("workAuthorization")} placeholder="e.g. Green Card" />
          </Field>
          <Field label="M Visa" htmlFor="mVisa" required hint="Marketing visa — what you market them as." error={errors.mVisa}>
            <SuggestInput id="mVisa" name="mVisa" value={fields.mVisa} options={VISA_OPTIONS} maxResults={VISA_OPTIONS.length} onChange={set("mVisa")} placeholder="e.g. H-1B" />
          </Field>
          <NullableField label="A Visa" htmlFor="aVisa" name="aVisa" naLabel="N/A" na={aVisaNa} onToggleNa={(v) => { markDirty(); setAVisaNa(v); if (v) setFields((f) => ({ ...f, aVisa: "" })); }} error={errors.aVisa} hint="Additional / secondary visa.">
            {aVisaNa ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400">N/A</div>
            ) : (
              <SuggestInput id="aVisa" name="aVisa" value={fields.aVisa} options={VISA_OPTIONS} maxResults={VISA_OPTIONS.length} onChange={set("aVisa")} placeholder="e.g. GC-EAD" />
            )}
          </NullableField>
        </div>
      </FormSection>

      {/* ── 4. Relocation ───────────────────────────────────────────── */}
      <FormSection n={4} title="Relocation">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Open to relocation?" htmlFor="relocationMode" required error={errors.relocationMode}>
            <Select key={`reloc-${selectSyncKey}`} id="relocationMode" name="relocationMode" value={fields.relocationMode} onChange={set("relocationMode")}>
              <option value="">— Select —</option>
              <option value="ANYWHERE">Yes — anywhere</option>
              <option value="SPECIFIC">Yes — specific cities</option>
              <option value="NO">No</option>
            </Select>
          </Field>
          {fields.relocationMode === "SPECIFIC" && (
            <Field label="Specific cities" htmlFor="relocationCities" required error={errors.relocationCities}>
              <Input id="relocationCities" name="relocationCities" value={fields.relocationCities} onChange={set("relocationCities")} placeholder="e.g. Dallas, Austin, Remote" />
            </Field>
          )}
        </div>
      </FormSection>

      {/* ── 5. Credentials & notes ──────────────────────────────────── */}
      <FormSection n={5} title="Credentials & notes">
        {canEditCredentials && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-700">Marketing credentials</p>
                <p className="mt-0.5 text-xs text-slate-500">Portal login — shown on the detail page only, never on lists or exports.</p>
              </div>
              <NaToggle label="Not set up yet" checked={credsNa} onChange={(v) => { markDirty(); setCredsNa(v); }} />
            </div>
            {credsNa && <input type="hidden" name="credentials__na" value="1" />}
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Marketing email (login)" htmlFor="marketingEmail" required={!credsNa} error={errors.marketingEmail}>
                <Input id="marketingEmail" name="marketingEmail" type="email" value={credsNa ? "" : fields.marketingEmail} onChange={set("marketingEmail")} disabled={credsNa} />
              </Field>
              <Field label="Password" htmlFor="marketingPassword" required={!credsNa} error={errors.marketingPassword}>
                <Input id="marketingPassword" name="marketingPassword" value={credsNa ? "" : fields.marketingPassword} onChange={set("marketingPassword")} disabled={credsNa} />
              </Field>
              <Field label="Marketing number" htmlFor="marketingNumber" required={!credsNa} error={errors.marketingNumber}>
                <Input id="marketingNumber" name="marketingNumber" value={credsNa ? "" : fields.marketingNumber} onChange={set("marketingNumber")} disabled={credsNa} />
              </Field>
            </div>
          </div>
        )}
        <Field label="Notes" htmlFor="notes" error={errors.notes} hint="Optional.">
          <Textarea id="notes" name="notes" rows={3} value={fields.notes} onChange={set("notes")} />
        </Field>
      </FormSection>

      <p className="text-xs text-slate-500">
        Use <span className="font-medium">Marketing status</span> to control the bench:{" "}
        <span className="font-medium">On bench</span> / <span className="font-medium">Paused</span> are
        being marketed; <span className="font-medium">Placed</span> / <span className="font-medium">Off bench</span> are not.
      </p>

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
