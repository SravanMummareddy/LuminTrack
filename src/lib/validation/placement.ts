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

/** Posts "1" when the field is explicitly marked TBD ("not known yet") —
 *  satisfies the requirement while the value stays blank (stored null). */
const naFlag = z.preprocess((v) => v === "1", z.boolean().default(false));

/** Edit a placement's mutable fields. Rate edits are additionally gated in
 * the action layer (recruiter-of-record OR admin).
 *
 * Forms-discipline (Wave 3, PR-6): every nullable field is required-or-TBD —
 * a value OR an explicit `<field>__na="1"`. `startDate` stays hard-required
 * (non-nullable; the placement can't exist without it) and the rates stay
 * preserve-on-blank (non-nullable columns — a blank must never zero a live
 * rate), so neither gains a TBD toggle. */
export const placementUpdateSchema = z
  .object({
    id: z.string().min(1),
    // Bill / pay rates are validated as plain non-negative numbers; the action
    // layer checks permission before applying. Empty string → undefined → not
    // updated, so non-rate edits don't accidentally zero the rates.
    billRate: optionalNonNegativeNumber,
    payRate: optionalNonNegativeNumber,
    clientRate: optionalNonNegativeNumber,
    startDate: z.coerce.date(),
    endDate: optionalDateTime,
    endDateNa: naFlag,
    clientPoNumber: optionalText,
    clientPoNumberNa: naFlag,
    invoiceRef: optionalText,
    invoiceRefNa: naFlag,
    onsiteManagerName: optionalText,
    onsiteManagerNameNa: naFlag,
    onsiteManagerEmail: optionalEmail,
    onsiteManagerEmailNa: naFlag,
    // Bench-Sales "Placements" sheet fields.
    organisation: optionalText,
    organisationNa: naFlag,
    teamLead: optionalText,
    teamLeadNa: naFlag,
    interviewDate: optionalDateTime,
    interviewDateNa: naFlag,
    placementDate: optionalDateTime,
    placementDateNa: naFlag,
    // Remarks stays optional — the free-text catch-all.
    remarks: optionalText,
  })
  .superRefine((d, ctx) => {
    const req = (
      blank: boolean,
      na: boolean,
      path: string,
      message: string,
    ) => {
      if (blank && !na) ctx.addIssue({ code: "custom", path: [path], message });
    };
    req(d.endDate == null, d.endDateNa, "endDate", "Set an end date, or mark TBD.");
    req(!d.clientPoNumber, d.clientPoNumberNa, "clientPoNumber", "Enter a PO #, or mark TBD.");
    req(!d.invoiceRef, d.invoiceRefNa, "invoiceRef", "Enter an invoice ref, or mark TBD.");
    req(!d.onsiteManagerName, d.onsiteManagerNameNa, "onsiteManagerName", "Enter a manager, or mark TBD.");
    req(!d.onsiteManagerEmail, d.onsiteManagerEmailNa, "onsiteManagerEmail", "Enter an email, or mark TBD.");
    req(!d.organisation, d.organisationNa, "organisation", "Enter an organisation, or mark TBD.");
    req(!d.teamLead, d.teamLeadNa, "teamLead", "Enter a lead, or mark TBD.");
    req(d.interviewDate == null, d.interviewDateNa, "interviewDate", "Set a date, or mark TBD.");
    req(d.placementDate == null, d.placementDateNa, "placementDate", "Set a date, or mark TBD.");
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
