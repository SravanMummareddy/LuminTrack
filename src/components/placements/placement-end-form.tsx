"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/field";
import { DateField } from "@/components/ui/date-field";
import { endPlacement } from "@/server/actions/placements";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import {
  PLACEMENT_END_REASONS,
  PLACEMENT_END_REASON_LABEL,
} from "@/lib/labels";
import { formatSubmissionDisplayId } from "@/lib/format";

export type ReplacementOption = {
  id: string;
  seq: number;
  candidate: { fullName: string };
  status: string;
};

export function PlacementEndButton({
  placementId,
  replacements,
}: {
  placementId: string;
  replacements: ReplacementOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        End placement
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="End placement">
        {open && (
          <EndForm
            placementId={placementId}
            replacements={replacements}
            onDone={() => setOpen(false)}
          />
        )}
      </Dialog>
    </>
  );
}

function EndForm({
  placementId,
  replacements,
  onDone,
}: {
  placementId: string;
  replacements: ReplacementOption[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    endPlacement,
    EMPTY_FORM_STATE,
  );
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  const errors = state.fieldErrors ?? {};
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={placementId} />

      <Field
        label="End reason"
        htmlFor="endReason"
        required
        error={errors.endReason}
        hint="Completed = clean ending; everything else marks the placement as Terminated."
      >
        <Select id="endReason" name="endReason" required defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {PLACEMENT_END_REASONS.map((r) => (
            <option key={r} value={r}>
              {PLACEMENT_END_REASON_LABEL[r]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="End date"
        htmlFor="endDate"
        required
        error={errors.endDate}
      >
        <DateField id="endDate" name="endDate" defaultValue={today} required />
      </Field>

      <Field label="Notes" htmlFor="endNote" error={errors.endNote}>
        <Textarea
          id="endNote"
          name="endNote"
          rows={2}
          placeholder="Optional context for the close-out"
        />
      </Field>

      <Field
        label="Replacement submission (optional)"
        htmlFor="replacementSubmissionId"
        error={errors.replacementSubmissionId}
        hint="Pick another candidate already submitted to the same job."
      >
        <Select
          id="replacementSubmissionId"
          name="replacementSubmissionId"
          defaultValue=""
        >
          <option value="">None</option>
          {replacements.map((r) => (
            <option key={r.id} value={r.id}>
              {formatSubmissionDisplayId(r)} — {r.candidate.fullName} ({r.status})
            </option>
          ))}
        </Select>
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
          {pending ? "Ending…" : "End placement"}
        </Button>
      </div>
    </form>
  );
}
