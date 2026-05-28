"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
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
  const negativeWarn =
    canManageRates &&
    placement.billRate > 0 &&
    placement.payRate > placement.billRate;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={placement.id} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Start date"
          htmlFor="startDate"
          required
          error={errors.startDate}
        >
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={toDateInput(placement.startDate)}
            required
          />
        </Field>
        <Field label="End date" htmlFor="endDate" error={errors.endDate}>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={toDateInput(placement.endDate)}
          />
        </Field>
      </div>

      {canManageRates ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Bill rate" htmlFor="billRate" error={errors.billRate}>
            <Input
              id="billRate"
              name="billRate"
              type="number"
              step="0.01"
              min="0"
              defaultValue={placement.billRate}
            />
          </Field>
          <Field label="Pay rate" htmlFor="payRate" error={errors.payRate}>
            <Input
              id="payRate"
              name="payRate"
              type="number"
              step="0.01"
              min="0"
              defaultValue={placement.payRate}
            />
          </Field>
          {negativeWarn && (
            <p className="sm:col-span-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Heads-up: pay rate is currently above bill rate — margin is negative.
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Only admins or the submitting recruiter can edit rates.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Client PO #" htmlFor="clientPoNumber" error={errors.clientPoNumber}>
          <Input
            id="clientPoNumber"
            name="clientPoNumber"
            defaultValue={placement.clientPoNumber ?? ""}
          />
        </Field>
        <Field label="Invoice ref" htmlFor="invoiceRef" error={errors.invoiceRef}>
          <Input
            id="invoiceRef"
            name="invoiceRef"
            defaultValue={placement.invoiceRef ?? ""}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Onsite manager"
          htmlFor="onsiteManagerName"
          error={errors.onsiteManagerName}
        >
          <Input
            id="onsiteManagerName"
            name="onsiteManagerName"
            defaultValue={placement.onsiteManagerName ?? ""}
          />
        </Field>
        <Field
          label="Onsite manager email"
          htmlFor="onsiteManagerEmail"
          error={errors.onsiteManagerEmail}
        >
          <Input
            id="onsiteManagerEmail"
            name="onsiteManagerEmail"
            type="email"
            defaultValue={placement.onsiteManagerEmail ?? ""}
          />
        </Field>
      </div>

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
