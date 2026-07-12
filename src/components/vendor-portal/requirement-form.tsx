"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { LocationInput } from "@/components/ui/location-input";
import { NullableField } from "@/components/ui/nullable-field";
import { FormSection } from "@/components/ui/form-section";
import { Button } from "@/components/ui/button";
import {
  useUnsavedChanges,
  GuardedCancel,
} from "@/components/ui/unsaved-changes";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";
import { BENCH_ENGAGEMENTS, BENCH_ENGAGEMENT_LABEL } from "@/lib/labels";
import { quickAddUser } from "@/server/actions/users";

type Recruiter = { id: string; fullName: string; isActive: boolean };
type RoleOpt = { id: string; name: string; isManagerTier: boolean };
type RequirementAction = (
  prev: FormState,
  formData: FormData,
) => Promise<FormState>;

/** Sentinel value the people-pickers use to trigger the "add user" dialog. */
const ADD_USER = "__add_user__";
/** Rates + the marketing recruiter carry a "value or explicit N/A" rule. */
type NaKey = "recruiterId" | "clientRate" | "billRate" | "payRate";
/** Which people-picker opened the add-user dialog (drives what gets selected). */
type AddTarget = "vendorRecruiterName" | "teamLead" | "recruiterId";

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

const rateLabel = (v: number | null | undefined) =>
  v == null ? "—" : `$${v}/hr`;

/**
 * Create / edit a Vendor Portal Requirement — the planning record a team-lead or
 * admin fills in before a recruiter moves it to a submission. Forms-discipline
 * layout (Job form #86): a read-only "From the job" reference panel, then three
 * numbered card sections with required-or-N/A fields. The job is fixed; the
 * candidate is chosen by the recruiter at submission time (no picker here).
 * Controlled inputs so a validation error (the action returns without
 * redirecting) doesn't lose what was typed under React 19's post-action reset.
 */
export function RequirementForm({
  action,
  mode,
  requirementId,
  job,
  recruiters,
  teamLeads = [],
  roles = [],
  canAddUser = false,
  canGrantManager = false,
  recruiterLead = {},
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
    clientRate: number | null;
    billRate: number | null;
    description: string | null;
  };
  recruiters: Recruiter[];
  /** Team-lead / manager users for the "Team lead" picker (stores the name). */
  teamLeads?: { id: string; fullName: string }[];
  /** Assignable roles for the quick-add-user dialog. */
  roles?: RoleOpt[];
  /** May the viewer create users inline (managers/team leads)? */
  canAddUser?: boolean;
  /** May the viewer grant a manager-tier role (filters the dialog's role list)? */
  canGrantManager?: boolean;
  /** userId → their team's active-lead name, for the Team-lead auto-fill. */
  recruiterLead?: Record<string, string>;
  defaults?: Partial<Fields>;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const [fields, setFields] = useState<Fields>({
    ...EMPTY_FIELDS,
    ...defaults,
  });
  // Editing a legacy VPR whose value predates the required rule: default N/A on
  // for the empty ones so an unrelated edit isn't forced to fill them. On create
  // everything starts un-N/A (rates prefill from the job; the rest are picked).
  const emptyOnEdit = (k: keyof Fields) => mode === "edit" && !defaults?.[k];
  const [na, setNa] = useState<Record<NaKey, boolean>>({
    recruiterId: emptyOnEdit("recruiterId"),
    clientRate: emptyOnEdit("clientRate"),
    billRate: emptyOnEdit("billRate"),
    payRate: emptyOnEdit("payRate"),
  });

  // The people-picker option lists live in state so a quick-added user appears.
  const [userList, setUserList] = useState<Recruiter[]>(recruiters);
  const [leadNames, setLeadNames] = useState<string[]>(
    teamLeads.map((t) => t.fullName),
  );
  const [addUserFor, setAddUserFor] = useState<AddTarget | null>(null);
  // Team lead follows the picked marketing recruiter until it's set by hand —
  // restores the old "leave blank → derive from the recruiter" convenience while
  // keeping the field required + editable. A saved value starts as "manual".
  const [teamLeadAuto, setTeamLeadAuto] = useState(!defaults?.teamLead);

  function onRecruiterChange(v: string) {
    if (v === ADD_USER) return setAddUserFor("recruiterId");
    const lead = recruiterLead[v];
    const takeLead = !!lead && (teamLeadAuto || !fields.teamLead);
    setFields((f) => ({ ...f, recruiterId: v, ...(takeLead ? { teamLead: lead } : {}) }));
    if (takeLead) setTeamLeadAuto(true);
  }

  function onTeamLeadChange(v: string) {
    if (v === ADD_USER) return setAddUserFor("teamLead");
    setTeamLeadAuto(false); // a manual pick pins it — recruiter changes won't override
    setFields((f) => ({ ...f, teamLead: v }));
  }

  // Re-key the plain <Select>s after React 19's post-action <form> reset so they
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

  const toggleNa = (key: NaKey) => (v: boolean) => {
    markDirty();
    setNa((s) => ({ ...s, [key]: v }));
    if (v)
      setFields((f) => ({ ...f, [key]: "" })); // clearing keeps N/A === blank
  };

  // "Value or an option that isn't in the list yet" — keep a saved name pickable.
  const withSaved = (names: string[], saved: string) =>
    saved && !names.includes(saved) ? [saved, ...names] : names;
  const userNames = userList.map((u) => u.fullName);
  const vendorRecruiterOpts = withSaved(userNames, fields.vendorRecruiterName).map(
    (n) => ({ value: n, label: n }),
  );
  const teamLeadOpts = withSaved(leadNames, fields.teamLead).map((n) => ({
    value: n,
    label: n,
  }));
  const recruiterOpts = userList.map((r) => ({
    value: r.id,
    label: r.isActive ? r.fullName : `${r.fullName} (inactive)`,
  }));
  const addOpt = canAddUser
    ? { value: ADD_USER, label: "+ Add new user…" }
    : undefined;

  function onUserAdded(row: { id: string; fullName: string }) {
    setUserList((l) =>
      l.some((u) => u.id === row.id)
        ? l
        : [{ id: row.id, fullName: row.fullName, isActive: true }, ...l],
    );
    if (addUserFor === "vendorRecruiterName")
      setFields((f) => ({ ...f, vendorRecruiterName: row.fullName }));
    else if (addUserFor === "teamLead") {
      setLeadNames((l) => (l.includes(row.fullName) ? l : [row.fullName, ...l]));
      setTeamLeadAuto(false); // explicitly-added lead is a manual pick
      setFields((f) => ({ ...f, teamLead: row.fullName }));
    } else if (addUserFor === "recruiterId") {
      setNa((s) => ({ ...s, recruiterId: false }));
      setFields((f) => ({ ...f, recruiterId: row.id }));
    }
    setAddUserFor(null);
    markDirty();
  }

  const rateField = (
    key: "clientRate" | "billRate" | "payRate",
    label: string,
    naLabel: string,
    hint: string,
  ) => (
    <NullableField
      label={label}
      htmlFor={key}
      name={key}
      naLabel={naLabel}
      na={na[key]}
      onToggleNa={toggleNa(key)}
      error={errors[key]}
      hint={hint}
    >
      <Input
        id={key}
        name={key}
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={na[key] ? "" : fields[key]}
        onChange={set(key)}
        disabled={na[key]}
      />
    </NullableField>
  );

  return (
    <>
      <form action={formAction} onInput={markDirty} className="space-y-5">
        {mode === "create" ? (
          <input type="hidden" name="jobId" value={job.id} />
        ) : (
          <input type="hidden" name="id" value={requirementId ?? ""} />
        )}
        {/* Candidate is chosen at submission time — carry any existing value so
            editing a requirement doesn't wipe it. */}
        <input type="hidden" name="candidateId" value={fields.candidateId} />

        {/* From the job — read-only reference. */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3">
          <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-indigo-700">
            From the job · {job.title}
            <span className="font-mono text-[11px] font-medium text-indigo-500">
              {job.displayId}
            </span>
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-[11px] uppercase text-indigo-500">Client</dt>
              <dd className="text-slate-800">{job.clientName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase text-indigo-500">Location</dt>
              <dd className="text-slate-800">{job.location ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase text-indigo-500">Client rate</dt>
              <dd className="text-slate-800">{rateLabel(job.clientRate)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase text-indigo-500">Bill rate</dt>
              <dd className="text-slate-800">{rateLabel(job.billRate)}</dd>
            </div>
            {job.description && (
              <div className="col-span-2 sm:col-span-4">
                <dt className="text-[11px] uppercase text-indigo-500">Description</dt>
                <dd className="line-clamp-2 text-slate-700">{job.description}</dd>
              </div>
            )}
          </dl>
          <p className="mt-2 text-[11px] text-indigo-500">
            Read-only reference — the fields below start prefilled from these and
            stay editable.
          </p>
        </div>

        <FormSection n={1} title="Requirement & terms">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Location"
              htmlFor="location"
              required
              error={errors.location}
              hint="Prefilled from the job — edit if this requirement differs."
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
              required
              error={errors.engagement}
              hint="C2C or W2."
            >
              <Select
                key={`engagement-${selectSyncKey}`}
                id="engagement"
                name="engagement"
                value={fields.engagement}
                onChange={set("engagement")}
              >
                <option value="">— Select —</option>
                {BENCH_ENGAGEMENTS.map((e) => (
                  <option key={e} value={e}>
                    {BENCH_ENGAGEMENT_LABEL[e]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Vendor recruiter"
              htmlFor="vendorRecruiterName"
              required
              error={errors.vendorRecruiterName}
              hint="Who recruited this vendor — pick a user, or add one."
            >
              <SearchSelect
                id="vendorRecruiterName"
                name="vendorRecruiterName"
                value={fields.vendorRecruiterName}
                onChange={(v) =>
                  v === ADD_USER
                    ? setAddUserFor("vendorRecruiterName")
                    : setFields((f) => ({ ...f, vendorRecruiterName: v }))
                }
                placeholder="Search users…"
                options={vendorRecruiterOpts}
                actionOption={addOpt}
              />
            </Field>
            <Field
              label="Team lead"
              htmlFor="teamLead"
              required
              error={errors.teamLead}
              hint="Owns this requirement."
            >
              <SearchSelect
                id="teamLead"
                name="teamLead"
                value={fields.teamLead}
                onChange={onTeamLeadChange}
                placeholder="Search team leads…"
                options={teamLeadOpts}
                actionOption={addOpt}
              />
            </Field>
          </div>

          <NullableField
            label="Marketing recruiter"
            htmlFor="recruiterId"
            name="recruiterId"
            naLabel="Unassigned"
            na={na.recruiterId}
            onToggleNa={toggleNa("recruiterId")}
            error={errors.recruiterId}
            hint="Who will market / submit this requirement."
          >
            {na.recruiterId ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400">
                Unassigned
              </div>
            ) : (
              <SearchSelect
                id="recruiterId"
                name="recruiterId"
                value={fields.recruiterId}
                onChange={onRecruiterChange}
                placeholder="Search recruiters…"
                options={recruiterOpts}
                actionOption={addOpt}
              />
            )}
          </NullableField>
        </FormSection>

        <FormSection n={2} title="Rates">
          <p className="text-xs text-slate-500">
            Client ≥ Bill ≥ Pay. Prefilled from the job where known.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {rateField(
              "clientRate",
              "Client rate",
              "Not disclosed",
              "$/hr the end client releases.",
            )}
            {rateField(
              "billRate",
              "Bill rate",
              "Pending",
              "$/hr the vendor releases to us.",
            )}
            {rateField("payRate", "Pay rate", "Pending", "$/hr to the consultant.")}
          </div>
        </FormSection>

        <FormSection n={3} title="Duties & notes">
          <Field
            label="Job duties"
            htmlFor="jobDuties"
            error={errors.jobDuties}
            hint="Prefilled from the job description — edit if needed."
          >
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
            hint="Optional — carried into the submission when this requirement is moved forward."
          >
            <Textarea
              id="submissionNotes"
              name="submissionNotes"
              rows={3}
              value={fields.submissionNotes}
              onChange={set("submissionNotes")}
            />
          </Field>
        </FormSection>

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

      {addUserFor && (
        <QuickAddUserDialog
          roles={canGrantManager ? roles : roles.filter((r) => !r.isManagerTier)}
          onClose={() => setAddUserFor(null)}
          onAdded={onUserAdded}
        />
      )}
    </>
  );
}

// ── Quick-add user dialog ─────────────────────────────────────────────────────
function QuickAddUserDialog({
  roles,
  onClose,
  onAdded,
}: {
  roles: RoleOpt[];
  onClose: () => void;
  onAdded: (row: { id: string; fullName: string }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await quickAddUser(fd);
      if (res.ok) onAdded({ id: res.id, fullName: res.fullName });
      else setError(res.error);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-16"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-bold text-slate-800">New user</h3>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <form action={submit} className="space-y-3 px-5 py-4">
          <Field label="Full name" htmlFor="qa-name" required>
            <Input id="qa-name" name="fullName" required autoFocus placeholder="Jordan Blake" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Email" htmlFor="qa-email" required>
              <Input id="qa-email" name="email" type="email" required placeholder="name@company.com" />
            </Field>
            <Field label="Role" htmlFor="qa-role" required>
              <Select id="qa-role" name="roleId" defaultValue="">
                <option value="">— Select —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {error && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <p className="text-xs text-slate-500">
            Creates a real account. A temporary password is generated — set the real
            one in Settings before they sign in.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add user"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
