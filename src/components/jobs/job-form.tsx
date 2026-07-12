"use client";

import { useActionState, useState, useTransition } from "react";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { LocationInput } from "@/components/ui/location-input";
import { SearchSelect } from "@/components/ui/search-select";
import { SuggestInput } from "@/components/ui/suggest-input";
import { Button } from "@/components/ui/button";
import { NullableField } from "@/components/ui/nullable-field";
import {
  useUnsavedChanges,
  GuardedCancel,
} from "@/components/ui/unsaved-changes";
import { jobDuration } from "@/lib/format";
import {
  JOB_STATUSES,
  JOB_STATUS_LABEL,
  WORK_MODES,
  WORK_MODE_LABEL,
  JOB_PRIORITIES,
  JOB_PRIORITY_LABEL,
  DISCIPLINES,
  DISCIPLINE_LABEL,
} from "@/lib/labels";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";
import {
  quickAddClient,
  quickAddVendor,
  quickAddReferrer,
} from "@/server/actions/org-quick-add";

type Option = { id: string; name: string; isActive: boolean };
type QuickKind = "client" | "vendor" | "referrer";
const ADD = "__add__";

const SOURCE_TYPES = [
  { value: "JOB_BOARD", label: "Job board" },
  { value: "REFERRAL", label: "Referral" },
  { value: "SISTER_COMPANY", label: "Sister company" },
  { value: "OTHER", label: "Other" },
] as const;

export type JobFormValues = {
  id: string;
  title: string;
  clientId: string;
  vendorId: string;
  sourceType: string;
  jobBoard: string;
  referrerId: string;
  sisterCompanySourceId: string;
  sourceOther: string;
  status: string;
  location: string;
  clientRate: string;
  vendorRate: string;
  description: string;
  notes: string;
  positions: string;
  /** YYYY-MM-DD or "" — bound to <input type="date">. */
  startDate: string;
  startDateEstimated: boolean;
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

const optionLabel = (name: string, isActive: boolean) =>
  isActive ? name : `${name} (inactive)`;

function SectionHeading({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="grid h-5 w-5 place-items-center rounded bg-indigo-50 text-[11px] font-bold text-indigo-600">
        {n}
      </span>
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h2>
    </div>
  );
}

export function JobForm({
  action,
  clients,
  vendors,
  sources,
  referrers,
  jobBoards,
  values,
  submitLabel,
  canQuickAdd = true,
  canManageRatesAndAssignment = true,
}: {
  action: JobAction;
  clients: Option[];
  vendors: Option[];
  sources: Option[];
  referrers: Option[];
  /** Seeded + learned job-board names for the source picker's datalist. */
  jobBoards: string[];
  values?: JobFormValues;
  submitLabel: string;
  /** Allow adding a new client/vendor/referrer inline (any signed-in user). */
  canQuickAdd?: boolean;
  /** Show the commercial rate fields (managers/team leads only). */
  canManageRatesAndAssignment?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const errors = state.fieldErrors ?? {};
  const editing = !!values;
  const cancelHref = values ? `/jobs/${values.id}` : "/jobs";

  const [dirty, setDirty] = useState(false);
  const markDirty = () => setDirty((d) => (d ? d : true));
  useUnsavedChanges(dirty);

  // Anchors (controlled so quick-add can append + select).
  const [clientList, setClientList] = useState(clients);
  const [vendorList, setVendorList] = useState(vendors);
  const [referrerList, setReferrerList] = useState(referrers);
  const [clientValue, setClientValue] = useState(values?.clientId ?? "");
  const [vendorValue, setVendorValue] = useState(values?.vendorId ?? "");
  const [referrerValue, setReferrerValue] = useState(values?.referrerId ?? "");

  const [sourceType, setSourceType] = useState(values?.sourceType || "JOB_BOARD");

  // Dates (controlled → live-derived duration + estimated tag).
  const [startDate, setStartDate] = useState(values?.startDate ?? "");
  const [startEstimated, setStartEstimated] = useState(
    values?.startDateEstimated ?? false,
  );
  const [endDate, setEndDate] = useState(values?.endDate ?? "");
  const duration = jobDuration(startDate || null, endDate || null, startEstimated);

  // Job description word count + short nudge.
  const [description, setDescription] = useState(values?.description ?? "");
  const words = description.trim() ? description.trim().split(/\s+/).length : 0;

  // Required-with-N/A escape flags. On edit, a blank value defaults to N/A so the
  // recruiter isn't forced to re-answer (the DB stores null for both).
  const [na, setNa] = useState({
    targetCloseDate: editing ? !values!.targetCloseDate : false,
    workAuthRequirement: editing ? !values!.workAuthRequirement : false,
    vendorRate: editing ? !values!.vendorRate : false,
    clientRate: editing ? !values!.clientRate : false,
  });
  const toggleNa = (k: keyof typeof na) => (v: boolean) => {
    markDirty();
    setNa((s) => ({ ...s, [k]: v }));
  };

  // Quick-add dialog.
  const [dialog, setDialog] = useState<QuickKind | null>(null);

  function onQuickAdded(kind: QuickKind, row: { id: string; name: string }) {
    const opt = { id: row.id, name: row.name, isActive: true };
    if (kind === "client") {
      setClientList((l) => (l.some((o) => o.id === opt.id) ? l : [opt, ...l]));
      setClientValue(opt.id);
    } else if (kind === "vendor") {
      setVendorList((l) => (l.some((o) => o.id === opt.id) ? l : [opt, ...l]));
      setVendorValue(opt.id);
    } else {
      setReferrerList((l) => (l.some((o) => o.id === opt.id) ? l : [opt, ...l]));
      setReferrerValue(opt.id);
    }
    setDialog(null);
    markDirty();
  }

  const anchorOpts = (list: Option[]) =>
    list.map((o) => ({ value: o.id, label: optionLabel(o.name, o.isActive) }));
  const addOpt = (label: string) =>
    canQuickAdd ? { value: ADD, label } : undefined;

  return (
    <>
      <form action={formAction} onInput={markDirty} className="space-y-6">
        {values && <input type="hidden" name="id" value={values.id} />}
        <input type="hidden" name="sourceType" value={sourceType} />

        {/* ── 1. The role ─────────────────────────────────────────── */}
        <SectionHeading n={1} title="The role" />
        <Field label="Job title" htmlFor="title" required error={errors.title}>
          <Input id="title" name="title" defaultValue={values?.title ?? ""} required />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Client" htmlFor="clientId" required error={errors.clientId}>
            <SearchSelect
              id="clientId"
              name="clientId"
              value={clientValue}
              onChange={(v) => (v === ADD ? setDialog("client") : setClientValue(v))}
              placeholder="Select or type a client…"
              options={anchorOpts(clientList)}
              actionOption={addOpt("+ Add new client…")}
            />
          </Field>
          <Field label="Vendor" htmlFor="vendorId" required error={errors.vendorId}>
            <SearchSelect
              id="vendorId"
              name="vendorId"
              value={vendorValue}
              onChange={(v) => (v === ADD ? setDialog("vendor") : setVendorValue(v))}
              placeholder="Select or type a vendor…"
              options={anchorOpts(vendorList)}
              actionOption={addOpt("+ Add new vendor…")}
            />
          </Field>
          <Field label="Discipline" htmlFor="discipline" required error={errors.discipline}>
            <Select id="discipline" name="discipline" defaultValue={values?.discipline ?? ""} required>
              <option value="">Select…</option>
              {DISCIPLINES.map((d) => (
                <option key={d} value={d}>{DISCIPLINE_LABEL[d]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="status" required error={errors.status}>
            <Select id="status" name="status" defaultValue={values?.status ?? "OPEN"} required>
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>{JOB_STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Location" htmlFor="location" required error={errors.location}>
            <LocationInput
              id="location"
              name="location"
              defaultValue={values?.location ?? ""}
              placeholder="City, ST or Remote"
            />
          </Field>
          <Field label="Work mode" htmlFor="workMode" required error={errors.workMode}>
            <Select id="workMode" name="workMode" defaultValue={values?.workMode ?? ""} required>
              <option value="">Select…</option>
              {WORK_MODES.map((m) => (
                <option key={m} value={m}>{WORK_MODE_LABEL[m]}</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* ── 2. Where we found it ────────────────────────────────── */}
        <SectionHeading n={2} title="Where we found it" />
        <Field label="Source type" htmlFor="sourceType-seg" required error={errors.sourceType}>
          <div className="flex flex-wrap gap-2" id="sourceType-seg">
            {SOURCE_TYPES.map((t) => (
              <label
                key={t.value}
                className={`cursor-pointer select-none rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  sourceType === t.value
                    ? "border-indigo-500 bg-indigo-50 text-indigo-600"
                    : "border-slate-300 text-slate-600 hover:border-indigo-300"
                }`}
              >
                <input
                  type="radio"
                  name="sourceType-radio"
                  className="sr-only"
                  checked={sourceType === t.value}
                  onChange={() => {
                    markDirty();
                    setSourceType(t.value);
                  }}
                />
                {t.label}
              </label>
            ))}
          </div>
        </Field>

        {sourceType === "JOB_BOARD" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Job board" htmlFor="jobBoard" required error={errors.jobBoard} hint="Seeded with popular boards; type your own if it's not listed.">
              <SuggestInput
                id="jobBoard"
                name="jobBoard"
                defaultValue={values?.jobBoard ?? ""}
                suggestions={jobBoards}
                maxResults={jobBoards.length}
                placeholder="LinkedIn, Indeed, Dice…"
              />
            </Field>
            <Field label="Posting URL" htmlFor="postingUrl" required error={errors.postingUrl}>
              <Input id="postingUrl" name="postingUrl" type="url" defaultValue={values?.postingUrl ?? ""} placeholder="https://…" />
            </Field>
          </div>
        )}
        {sourceType === "REFERRAL" && (
          <Field label="Referrer" htmlFor="referrerId" required error={errors.referrerId} hint="From your reusable Referrers directory.">
            <SearchSelect
              id="referrerId"
              name="referrerId"
              value={referrerValue}
              onChange={(v) => (v === ADD ? setDialog("referrer") : setReferrerValue(v))}
              placeholder="Select a referrer…"
              options={anchorOpts(referrerList)}
              actionOption={addOpt("+ Add referrer…")}
            />
          </Field>
        )}
        {sourceType === "SISTER_COMPANY" && (
          <Field label="Sister company" htmlFor="sisterCompanySourceId" required error={errors.sisterCompanySourceId}>
            <Select id="sisterCompanySourceId" name="sisterCompanySourceId" defaultValue={values?.sisterCompanySourceId ?? ""} required>
              <option value="">Select…</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{optionLabel(s.name, s.isActive)}</option>
              ))}
            </Select>
          </Field>
        )}
        {sourceType === "OTHER" && (
          <Field label="Where from" htmlFor="sourceOther" required error={errors.sourceOther}>
            <Input id="sourceOther" name="sourceOther" defaultValue={values?.sourceOther ?? ""} placeholder="Describe the source" />
          </Field>
        )}

        {/* ── 3. Requirement details ──────────────────────────────── */}
        <SectionHeading n={3} title="Requirement details" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Positions" htmlFor="positions" required error={errors.positions}>
            <Input id="positions" name="positions" type="number" min="1" step="1" defaultValue={values?.positions || "1"} />
          </Field>
          <Field label="Priority" htmlFor="priority" required error={errors.priority}>
            <Select id="priority" name="priority" defaultValue={values?.priority ?? "MEDIUM"} required>
              <option value="">Select…</option>
              {JOB_PRIORITIES.map((p) => (
                <option key={p} value={p}>{JOB_PRIORITY_LABEL[p]}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="startDate" className="block text-sm font-medium text-slate-700">Projected start</label>
                <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" name="startDateEstimated" value="1" checked={startEstimated} onChange={(e) => { markDirty(); setStartEstimated(e.target.checked); }} className="h-3.5 w-3.5 accent-indigo-600" />
                  estimated
                </label>
              </div>
              <Input id="startDate" name="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              {errors.startDate && <p className="text-xs font-medium text-red-600">{errors.startDate}</p>}
            </div>
            <Field label="Projected end" htmlFor="endDate" error={errors.endDate}>
              <Input id="endDate" name="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Duration: <span className="font-medium text-slate-700">{duration}</span>
            {" · "}If the start is unknown, tick <b>estimated</b> — a confirmed date is required before the job can be Filled/Closed.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NullableField label="Target hire-by" htmlFor="targetCloseDate" name="targetCloseDate" na={na.targetCloseDate} onToggleNa={toggleNa("targetCloseDate")} error={errors.targetCloseDate}>
            <Input id="targetCloseDate" name="targetCloseDate" type="date" defaultValue={values?.targetCloseDate ?? ""} disabled={na.targetCloseDate} className={na.targetCloseDate ? "bg-slate-50" : ""} />
          </NullableField>
          <NullableField label="Work-auth requirement" htmlFor="workAuthRequirement" name="workAuthRequirement" na={na.workAuthRequirement} onToggleNa={toggleNa("workAuthRequirement")} error={errors.workAuthRequirement}>
            <Input id="workAuthRequirement" name="workAuthRequirement" defaultValue={values?.workAuthRequirement ?? ""} placeholder="e.g. USC / GC / H-1B ok" disabled={na.workAuthRequirement} className={na.workAuthRequirement ? "bg-slate-50" : ""} />
          </NullableField>
        </div>
        <Field label="Skills" htmlFor="skills" required error={errors.skills} hint="Separate skills with commas.">
          <Input id="skills" name="skills" defaultValue={values?.skills ?? ""} placeholder="e.g. React, TypeScript, AWS" />
        </Field>
        {canManageRatesAndAssignment && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NullableField label="Vendor rate" htmlFor="vendorRate" name="vendorRate" naLabel="Don't know" required={false} na={na.vendorRate} onToggleNa={toggleNa("vendorRate")} error={errors.vendorRate} hint="$/hr the vendor releases to us.">
              <Input id="vendorRate" name="vendorRate" type="number" min="0" step="0.01" defaultValue={values?.vendorRate ?? ""} disabled={na.vendorRate} className={na.vendorRate ? "bg-slate-50" : ""} />
            </NullableField>
            <NullableField label="Client rate" htmlFor="clientRate" name="clientRate" naLabel="Not disclosed" required={false} na={na.clientRate} onToggleNa={toggleNa("clientRate")} error={errors.clientRate} hint="$/hr the end client releases.">
              <Input id="clientRate" name="clientRate" type="number" min="0" step="0.01" defaultValue={values?.clientRate ?? ""} disabled={na.clientRate} className={na.clientRate ? "bg-slate-50" : ""} />
            </NullableField>
          </div>
        )}

        {/* ── 4. Description ──────────────────────────────────────── */}
        <SectionHeading n={4} title="Description" />
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="description" className="block text-sm font-medium text-slate-700">
              Job description<span className="ml-0.5 text-red-500">*</span>
            </label>
            <span className="text-xs text-slate-400">{words} word{words === 1 ? "" : "s"}</span>
          </div>
          <Textarea id="description" name="description" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Paste the full job description." />
          {words > 0 && words < 40 && !errors.description && (
            <p className="text-xs text-amber-600">Looks short — paste the full description for better matching.</p>
          )}
          {errors.description && <p className="text-xs font-medium text-red-600">{errors.description}</p>}
        </div>
        <Field label="Notes" htmlFor="notes" hint="The only optional field." error={errors.notes}>
          <Textarea id="notes" name="notes" rows={3} defaultValue={values?.notes ?? ""} />
        </Field>

        {state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <GuardedCancel href={cancelHref} dirty={dirty} />
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
        </div>
      </form>

      {dialog && (
        <QuickAddDialog kind={dialog} onClose={() => setDialog(null)} onAdded={(row) => onQuickAdded(dialog, row)} />
      )}
    </>
  );
}

// ── Quick-add dialog (client / vendor / referrer) ─────────────────────────────
function QuickAddDialog({
  kind,
  onClose,
  onAdded,
}: {
  kind: QuickKind;
  onClose: () => void;
  onAdded: (row: { id: string; name: string }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const title = kind === "client" ? "New client" : kind === "vendor" ? "New vendor" : "New referrer";
  const run = kind === "client" ? quickAddClient : kind === "vendor" ? quickAddVendor : quickAddReferrer;

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await run(fd);
      if (res.ok) onAdded({ id: res.id, name: res.name });
      else setError(res.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-16" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">✕</button>
        </div>
        <form action={submit} className="space-y-3 px-5 py-4">
          <Field label="Name" htmlFor="qa-name" required>
            <Input id="qa-name" name="name" required autoFocus placeholder={kind === "referrer" ? "Person's name" : "Company name"} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {kind !== "referrer" ? (
              <Field label="Contact person" htmlFor="qa-contact"><Input id="qa-contact" name="contactPerson" /></Field>
            ) : (
              <Field label="Company" htmlFor="qa-company"><Input id="qa-company" name="company" /></Field>
            )}
            <Field label="Email" htmlFor="qa-email"><Input id="qa-email" name="email" type="email" /></Field>
            <Field label="Phone" htmlFor="qa-phone"><Input id="qa-phone" name="phone" /></Field>
            {kind !== "referrer" && (
              <Field label="Location" htmlFor="qa-location"><Input id="qa-location" name="location" /></Field>
            )}
          </div>
          <Field label="Notes" htmlFor="qa-notes"><Textarea id="qa-notes" name="notes" rows={2} /></Field>
          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <p className="text-xs text-slate-500">Saved to Settings and tagged with who added it. Selected on this job.</p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Adding…" : `Add ${kind}`}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
