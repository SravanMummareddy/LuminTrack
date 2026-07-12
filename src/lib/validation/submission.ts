import { z } from "zod";
import type { RefinementCtx } from "zod";
import {
  optionalText,
  optionalNonNegativeNumber,
  optionalDateTime,
  emptyToUndefined,
} from "./common";
import { STATUS_CHANGE_REASONS } from "@/lib/labels";

/** Posts "1" when the field is explicitly marked N/A — satisfies the requirement
 *  while the value stays blank (stored null). Mirrors validation/requirement.ts. */
const naFlag = z.preprocess((v) => v === "1", z.boolean().default(false));

export const SUBMISSION_STATUS_VALUES = [
  "SUBMITTED",
  "RESUME_PICKED",
  "VENDOR_SCREENING_CALL",
  "CLIENT_INTERVIEW",
  "SELECTED",
  "REJECTED",
  "ON_HOLD",
  "OFFER_RELEASED",
  "OFFER_ACCEPTED",
  "JOINED",
  "BACKED_OUT",
] as const;

/**
 * Résumé fields shared by the create- and edit-submission forms. The résumé is
 * optional: either an existing library résumé (`resumeChoice: "existing"` +
 * `candidateResumeId`) or none. New résumés are uploaded — inline or on the
 * candidate profile — before the submission is saved, so they arrive as an
 * existing pick, not as flat fields here.
 */
const resumeFields = {
  submissionNotes: optionalText,
  resumeChoice: z.enum(["existing", "none"]).catch("none"),
  candidateResumeId: z.preprocess(emptyToUndefined, z.string().optional()),
};

type ResumeFields = {
  resumeChoice: "existing" | "none";
  candidateResumeId?: string;
};

/** Bench-Sales fields shared by the create- and edit-submission forms. All
 *  optional — regular (non-bench) submissions leave them blank. */
const benchFields = {
  engagement: z.preprocess(
    emptyToUndefined,
    z.enum(["C2C", "W2"]).optional(),
  ),
  vendorRecruiterName: optionalText,
  jobDuties: optionalText,
  // The sheet's Pay Rate / Bill Rate pair + Team lead. clientRate = what the end
  // client releases (optional).
  payRate: optionalNonNegativeNumber,
  billRate: optionalNonNegativeNumber,
  clientRate: optionalNonNegativeNumber,
  teamLead: optionalText,
};

function refineResumeChoice(d: ResumeFields, ctx: z.RefinementCtx) {
  if (d.resumeChoice === "existing" && !d.candidateResumeId)
    ctx.addIssue({
      code: "custom",
      path: ["candidateResumeId"],
      message: "Pick a resume.",
    });
}

/**
 * Forms-discipline (Wave 3, PR-4): on a NEW submission the commercial terms are
 * each required OR explicitly N/A (`<field>__na="1"` → satisfies, stays null).
 * These override the optional `benchFields` above. The EDIT form keeps the
 * lenient `benchFields` so legacy blank-term submissions stay editable.
 */
const requiredTermsFields = {
  engagement: z.preprocess(emptyToUndefined, z.enum(["C2C", "W2"]).optional()),
  engagementNa: naFlag,
  vendorRecruiterName: optionalText,
  vendorRecruiterNameNa: naFlag,
  jobDuties: optionalText,
  payRate: optionalNonNegativeNumber,
  payRateNa: naFlag,
  billRate: optionalNonNegativeNumber,
  billRateNa: naFlag,
  clientRate: optionalNonNegativeNumber,
  clientRateNa: naFlag,
  teamLead: optionalText,
  teamLeadNa: naFlag,
};

type RequiredTerms = {
  engagement?: "C2C" | "W2";
  engagementNa: boolean;
  vendorRecruiterName?: string;
  vendorRecruiterNameNa: boolean;
  payRate?: number;
  payRateNa: boolean;
  billRate?: number;
  billRateNa: boolean;
  clientRate?: number;
  clientRateNa: boolean;
  teamLead?: string;
  teamLeadNa: boolean;
};

/** Each term is satisfied by a value OR its explicit N/A flag. */
function refineTerms(d: RequiredTerms, ctx: RefinementCtx) {
  if (!d.engagement && !d.engagementNa)
    ctx.addIssue({ code: "custom", path: ["engagement"], message: "Pick an engagement, or mark N/A." });
  if (!d.vendorRecruiterName && !d.vendorRecruiterNameNa)
    ctx.addIssue({ code: "custom", path: ["vendorRecruiterName"], message: "Name the vendor recruiter, or mark N/A." });
  if (d.payRate == null && !d.payRateNa)
    ctx.addIssue({ code: "custom", path: ["payRate"], message: "Enter a rate, or mark N/A." });
  if (d.billRate == null && !d.billRateNa)
    ctx.addIssue({ code: "custom", path: ["billRate"], message: "Enter a rate, or mark N/A." });
  if (d.clientRate == null && !d.clientRateNa)
    ctx.addIssue({ code: "custom", path: ["clientRate"], message: "Enter a rate, or mark not disclosed." });
  if (!d.teamLead && !d.teamLeadNa)
    ctx.addIssue({ code: "custom", path: ["teamLead"], message: "Pick a team lead, or mark N/A." });
}

/** A new submission — candidate, job, and submitting recruiter are all fixed here. */
export const submissionSchema = z
  .object({
    candidateId: z.string().min(1, "Select a candidate."),
    jobId: z.string().min(1, "Missing job reference."),
    submittedById: z.string().min(1, "Select the submitting recruiter."),
    ...resumeFields,
    ...requiredTermsFields,
  })
  .superRefine(refineResumeChoice)
  .superRefine(refineTerms);

export type SubmissionInput = z.infer<typeof submissionSchema>;

/**
 * Editing an existing submission. Candidate, job, and submitting recruiter are
 * fixed at creation, so only the submitted date, rate, résumé, and notes are
 * editable.
 */
export const submissionEditSchema = z
  .object({
    ...resumeFields,
    ...benchFields,
    // datetime-local string → Date; an empty/invalid value fails validation.
    submittedAt: z.coerce.date(),
    // Admin-only re-attribution of the submitting recruiter. Optional and
    // honored only for admins in the action; absent/empty leaves it unchanged.
    submittedById: z.preprocess(emptyToUndefined, z.string().optional()),
  })
  .superRefine(refineResumeChoice);

export type SubmissionEditInput = z.infer<typeof submissionEditSchema>;

/**
 * A submission status change with optional context: the real-world date/time
 * the event happened, a free-text note, and a preset reason category. All three
 * are optional — the action stays `void`-returning with no error UI.
 */
export const statusChangeSchema = z.object({
  id: z.string().min(1),
  status: z.enum(SUBMISSION_STATUS_VALUES),
  eventAt: optionalDateTime,
  note: optionalText,
  reason: z.preprocess(
    emptyToUndefined,
    z.enum(STATUS_CHANGE_REASONS).optional(),
  ),
  // §C2: captured only when moving to OFFER_ACCEPTED / JOINED. Action ignores
  // them for any other target status.
  expectedJoinDate: optionalDateTime,
  actualJoinDate: optionalDateTime,
});

export type StatusChangeInput = z.infer<typeof statusChangeSchema>;
