"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { DateField } from "@/components/ui/date-field";
import { FormSection } from "@/components/ui/form-section";
import { NullableField } from "@/components/ui/nullable-field";
import { updatePlacement } from "@/server/actions/placements";
import { EMPTY_FORM_STATE } from "@/lib/form-state";

export type PlacementEditData = {
  id: string;
  startDate: Date;
  endDate: Date | null;
  billRate: number;
  payRate: number;
  clientPoNumber: string | null;
  invoiceRef: string | null;
  onsiteManagerName: string | null;
  onsiteManagerEmail: string | null;
  organisation: string | null;
  teamLead: string | null;
  interviewDate: Date | null;
  placementDate: Date | null;
  remarks: string | null;
};

function toDateInput(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function PlacementEditButton({
  placement,
  canManageRates,
}: {
  placement: PlacementEditData;
  canManageRates: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Edit details
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit placement">
        {open && (
          <EditForm
            placement={placement}
            canManageRates={canManageRates}
            onDone={() => setOpen(false)}
          />
        )}
      </Dialog>
    </>
  );
}

function EditForm({
  placement,
  canManageRates,
  onDone,
}: {
  placement: PlacementEditData;
  canManageRates: boolean;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    updatePlacement,
    EMPTY_FORM_STATE,
  );
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  const errors = state.fieldErrors ?? {};

  // Controlled so the TBD toggle can clear + disable a field. This is always an
  // edit (the placement is auto-created on JOINED), so a field left blank on the
  // record opens pre-marked TBD — an explicit "not known yet", editable by
  // un-toggling — rather than forcing the editor to fill every gap.
  const [fields, setFields] = useState({
    startDate: toDateInput(placement.startDate),
    billRate: String(placement.billRate),
    payRate: String(placement.payRate),
    endDate: toDateInput(placement.endDate),
    endDateNa: placement.endDate == null,
    clientPoNumber: placement.clientPoNumber ?? "",
    clientPoNumberNa: !placement.clientPoNumber,
    invoiceRef: placement.invoiceRef ?? "",
    invoiceRefNa: !placement.invoiceRef,
    onsiteManagerName: placement.onsiteManagerName ?? "",
    onsiteManagerNameNa: !placement.onsiteManagerName,
    onsiteManagerEmail: placement.onsiteManagerEmail ?? "",
    onsiteManagerEmailNa: !placement.onsiteManagerEmail,
    organisation: placement.organisation ?? "",
    organisationNa: !placement.organisation,
    teamLead: placement.teamLead ?? "",
    teamLeadNa: !placement.teamLead,
    interviewDate: toDateInput(placement.interviewDate),
    interviewDateNa: placement.interviewDate == null,
    placementDate: toDateInput(placement.placementDate),
    placementDateNa: placement.placementDate == null,
    remarks: placement.remarks ?? "",
  });

  type Fields = typeof fields;
  const set =
    (name: keyof Fields) =>
    (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) =>
      setFields((f) => ({ ...f, [name]: e.target.value }));
  // DateField emits a value (not an event) — value-based setter for the pickers.
  const setDate = (name: keyof Fields) => (v: string) =>
    setFields((f) => ({ ...f, [name]: v }));
  // Toggling TBD on clears the paired value; off leaves it for re-entry.
  const naToggle =
    (field: keyof Fields, naField: keyof Fields) => (v: boolean) =>
      setFields((f) => ({ ...f, [naField]: v, ...(v ? { [field]: "" } : {}) }));

  const negativeWarn =
    canManageRates &&
    placement.billRate > 0 &&
    Number(fields.payRate) > Number(fields.billRate);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={placement.id} />

      <FormSection n={1} title="Dates">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor="startDate" required error={errors.startDate} hint="Always known — it's why the placement exists.">
            <DateField id="startDate" name="startDate" value={fields.startDate} onChange={setDate("startDate")} required />
          </Field>
          <NullableField label="End date" naLabel="TBD" htmlFor="endDate" name="endDate" na={fields.endDateNa} onToggleNa={naToggle("endDate", "endDateNa")} error={errors.endDate}>
            <DateField id="endDate" name="endDate" value={fields.endDate} onChange={setDate("endDate")} disabled={fields.endDateNa} />
          </NullableField>
          <NullableField label="Date of interview" naLabel="TBD" htmlFor="interviewDate" name="interviewDate" na={fields.interviewDateNa} onToggleNa={naToggle("interviewDate", "interviewDateNa")} error={errors.interviewDate}>
            <DateField id="interviewDate" name="interviewDate" value={fields.interviewDate} onChange={setDate("interviewDate")} disabled={fields.interviewDateNa} />
          </NullableField>
          <NullableField label="Date of placement" naLabel="TBD" htmlFor="placementDate" name="placementDate" na={fields.placementDateNa} onToggleNa={naToggle("placementDate", "placementDateNa")} error={errors.placementDate}>
            <DateField id="placementDate" name="placementDate" value={fields.placementDate} onChange={setDate("placementDate")} disabled={fields.placementDateNa} />
          </NullableField>
        </div>
      </FormSection>

      <FormSection n={2} title="Commercials">
        {canManageRates ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Bill rate" htmlFor="billRate" error={errors.billRate}>
                <Input id="billRate" name="billRate" type="number" step="0.01" min="0" value={fields.billRate} onChange={set("billRate")} />
              </Field>
              <Field label="Pay rate" htmlFor="payRate" error={errors.payRate}>
                <Input id="payRate" name="payRate" type="number" step="0.01" min="0" value={fields.payRate} onChange={set("payRate")} />
              </Field>
            </div>
            {negativeWarn && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Heads-up: pay rate is currently above bill rate — margin is negative.
              </p>
            )}
            <p className="text-xs text-slate-500">
              Blank keeps the current rate — a placement rate is never blanked to zero.
            </p>
          </>
        ) : (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Only admins or the submitting recruiter can edit rates.
          </p>
        )}
      </FormSection>

      <FormSection n={3} title="Client, delivery & remarks">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NullableField label="Client PO #" naLabel="TBD" htmlFor="clientPoNumber" name="clientPoNumber" na={fields.clientPoNumberNa} onToggleNa={naToggle("clientPoNumber", "clientPoNumberNa")} error={errors.clientPoNumber}>
            <Input id="clientPoNumber" name="clientPoNumber" value={fields.clientPoNumber} onChange={set("clientPoNumber")} disabled={fields.clientPoNumberNa} />
          </NullableField>
          <NullableField label="Invoice ref" naLabel="TBD" htmlFor="invoiceRef" name="invoiceRef" na={fields.invoiceRefNa} onToggleNa={naToggle("invoiceRef", "invoiceRefNa")} error={errors.invoiceRef}>
            <Input id="invoiceRef" name="invoiceRef" value={fields.invoiceRef} onChange={set("invoiceRef")} disabled={fields.invoiceRefNa} />
          </NullableField>
          <NullableField label="Onsite manager" naLabel="TBD" htmlFor="onsiteManagerName" name="onsiteManagerName" na={fields.onsiteManagerNameNa} onToggleNa={naToggle("onsiteManagerName", "onsiteManagerNameNa")} error={errors.onsiteManagerName}>
            <Input id="onsiteManagerName" name="onsiteManagerName" value={fields.onsiteManagerName} onChange={set("onsiteManagerName")} disabled={fields.onsiteManagerNameNa} />
          </NullableField>
          <NullableField label="Onsite manager email" naLabel="TBD" htmlFor="onsiteManagerEmail" name="onsiteManagerEmail" na={fields.onsiteManagerEmailNa} onToggleNa={naToggle("onsiteManagerEmail", "onsiteManagerEmailNa")} error={errors.onsiteManagerEmail}>
            <Input id="onsiteManagerEmail" name="onsiteManagerEmail" type="email" value={fields.onsiteManagerEmail} onChange={set("onsiteManagerEmail")} disabled={fields.onsiteManagerEmailNa} />
          </NullableField>
          <NullableField label="Organisation" naLabel="TBD" htmlFor="organisation" name="organisation" na={fields.organisationNa} onToggleNa={naToggle("organisation", "organisationNa")} error={errors.organisation}>
            <Input id="organisation" name="organisation" value={fields.organisation} onChange={set("organisation")} disabled={fields.organisationNa} />
          </NullableField>
          <NullableField label="Lead" naLabel="TBD" htmlFor="teamLead" name="teamLead" na={fields.teamLeadNa} onToggleNa={naToggle("teamLead", "teamLeadNa")} error={errors.teamLead}>
            <Input id="teamLead" name="teamLead" value={fields.teamLead} onChange={set("teamLead")} disabled={fields.teamLeadNa} />
          </NullableField>
        </div>
        <Field label="Remarks" htmlFor="remarks" error={errors.remarks} hint="Optional.">
          <Textarea id="remarks" name="remarks" rows={2} value={fields.remarks} onChange={set("remarks")} />
        </Field>
      </FormSection>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
