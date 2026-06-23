// R4.2 — Placement input schemas. The `Placement` row itself is auto-created
// on JOINED (see placement-lifecycle.ts), so there is no "create" schema —
// only update/extend/end.

import { z } from "zod";
import {
  emptyToUndefined,
  optionalText,
  optionalEmail,
  optionalDateTime,
  optionalNonNegativeNumber,
} from "@/lib/validation/common";

const endReasonValues = [
  "COMPLETED",
  "TERMINATED_BY_CLIENT",
  "RESIGNED",
  "PERFORMANCE",
  "OTHER",
] as const;

/** Edit a placement's mutable fields. Rate edits are additionally gated in
 * the action layer (recruiter-of-record OR admin). */
export const placementUpdateSchema = z.object({
  id: z.string().min(1),
  // Bill / pay rates are validated as plain non-negative numbers; the action
  // layer checks permission before applying. Empty string → undefined → not
  // updated, so non-rate edits don't accidentally zero the rates.
  billRate: optionalNonNegativeNumber,
  payRate: optionalNonNegativeNumber,
  clientRate: optionalNonNegativeNumber,
  startDate: z.coerce.date(),
  endDate: optionalDateTime,
  clientPoNumber: optionalText,
  invoiceRef: optionalText,
  onsiteManagerName: optionalText,
  onsiteManagerEmail: optionalEmail,
  // Bench-Sales "Placements" sheet fields.
  organisation: optionalText,
  teamLead: optionalText,
  interviewDate: optionalDateTime,
  placementDate: optionalDateTime,
  remarks: optionalText,
});

export type PlacementUpdateInput = z.infer<typeof placementUpdateSchema>;

/** Append an extension. Action layer enforces startDate >= current placement
 * endDate (or last extension endDate). */
export const placementExtendSchema = z
  .object({
    id: z.string().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    newBillRate: optionalNonNegativeNumber,
    newPayRate: optionalNonNegativeNumber,
    note: optionalText,
  })
  .superRefine((value, ctx) => {
    if (value.endDate <= value.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Extension end date must be after its start date.",
      });
    }
  });

export type PlacementExtendInput = z.infer<typeof placementExtendSchema>;

/** End a placement (move out of ACTIVE/EXTENDED). Optional replacement
 * submission (same job) backfills the assignment. */
export const placementEndSchema = z.object({
  id: z.string().min(1),
  // ENDED vs TERMINATED is derived from the end reason in the action; this
  // schema only captures the reason + note + optional dates.
  endReason: z.enum(endReasonValues),
  endNote: optionalText,
  endDate: z.preprocess(emptyToUndefined, z.coerce.date()),
  replacementSubmissionId: z.preprocess(
    emptyToUndefined,
    z.string().optional(),
  ),
});

export type PlacementEndInput = z.infer<typeof placementEndSchema>;
