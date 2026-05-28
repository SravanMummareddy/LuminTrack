"use client";

import { useActionState, useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { extendPlacement } from "@/server/actions/placements";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { formatDate } from "@/lib/format";

export type ExtensionItem = {
  id: string;
  startDate: Date;
  endDate: Date;
  note: string | null;
};

export function ExtensionHistory({
  placementId,
  extensions,
  currentEnd,
  canManageRates,
  canExtend,
}: {
  placementId: string;
  extensions: ExtensionItem[];
  currentEnd: Date | null;
  canManageRates: boolean;
  canExtend: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Extension history ({extensions.length})
        </h2>
        {canExtend && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <CalendarPlus className="h-4 w-4" />
            Extend
          </Button>
        )}
      </div>
      {extensions.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
          No extensions yet. The original placement term still applies.
        </p>
      ) : (
        <ul className="space-y-2">
          {extensions.map((ext) => (
            <li
              key={ext.id}
              className="rounded-md border border-slate-200 p-3"
            >
              <p className="text-sm font-medium text-slate-900">
                {formatDate(ext.startDate)} → {formatDate(ext.endDate)}
              </p>
              {ext.note && (
                <p className="mt-1 text-xs text-slate-600">{ext.note}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Extend placement"
      >
        {open && (
          <ExtendForm
            placementId={placementId}
            defaultStart={currentEnd}
            canManageRates={canManageRates}
            onDone={() => setOpen(false)}
          />
        )}
      </Dialog>
    </section>
  );
}

function ExtendForm({
  placementId,
  defaultStart,
  canManageRates,
  onDone,
}: {
  placementId: string;
  defaultStart: Date | null;
  canManageRates: boolean;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    extendPlacement,
    EMPTY_FORM_STATE,
  );
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const errors = state.fieldErrors ?? {};
  const startDefault = defaultStart ? defaultStart.toISOString().slice(0, 10) : "";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={placementId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Extension starts"
          htmlFor="startDate"
          required
          error={errors.startDate}
          hint="Must be on or after the current end date."
        >
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={startDefault}
            required
          />
        </Field>
        <Field
          label="Extension ends"
          htmlFor="endDate"
          required
          error={errors.endDate}
        >
          <Input id="endDate" name="endDate" type="date" required />
        </Field>
      </div>
      {canManageRates && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="New bill rate (optional)"
            htmlFor="newBillRate"
            error={errors.newBillRate}
            hint="Leave blank to keep the current rate."
          >
            <Input
              id="newBillRate"
              name="newBillRate"
              type="number"
              step="0.01"
              min="0"
            />
          </Field>
          <Field
            label="New pay rate (optional)"
            htmlFor="newPayRate"
            error={errors.newPayRate}
          >
            <Input
              id="newPayRate"
              name="newPayRate"
              type="number"
              step="0.01"
              min="0"
            />
          </Field>
        </div>
      )}
      <Field label="Note" htmlFor="note" error={errors.note}>
        <Textarea
          id="note"
          name="note"
          rows={2}
          placeholder="Optional context (e.g. client requested extension)"
        />
      </Field>
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
          {pending ? "Saving…" : "Extend"}
        </Button>
      </div>
    </form>
  );
}
