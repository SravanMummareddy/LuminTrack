import { z } from "zod";
import {
  optionalText,
  optionalUrl,
  optionalNonNegativeNumber,
  optionalDateTime,
  emptyToUndefined,
} from "./common";
import { STATUS_CHANGE_REASONS } from "@/lib/labels";

export const SUBMISSION_STATUS_VALUES = [
  "SUBMITTED",
  "RESUME_PICKED",
  "VENDOR_SCREENING_CALL",
  "CLIENT_INTERVIEW",
  "SELECTED",
  "REJECTED",
  "ON_HOLD",
  "OFFER_RELEASED",
  "JOINED",
] as const;

/**
 * Résumé fields shared by the create- and edit-submission forms. The résumé is
 * optional and provided one of three ways (`resumeChoice`): an existing library
 * résumé, a brand-new one entered inline, or none. FormData sends flat strings,
 * so the cross-field rules run in `superRefine` rather than a discriminated union.
 */
const resumeFields = {
  candidateRate: optionalNonNegativeNumber,
  submissionNotes: optionalText,
  resumeChoice: z.enum(["existing", "new", "none"]).catch("none"),
  candidateResumeId: z.preprocess(emptyToUndefined, z.string().optional()),
  newResumeLabel: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(120).optional(),
  ),
  newResumeLink: optionalUrl,
};

type ResumeFields = {
  resumeChoice: "existing" | "new" | "none";
  candidateResumeId?: string;
  newResumeLabel?: string;
  newResumeLink?: string;
};

function refineResumeChoice(d: ResumeFields, ctx: z.RefinementCtx) {
  if (d.resumeChoice === "existing" && !d.candidateResumeId)
    ctx.addIssue({
      code: "custom",
      path: ["candidateResumeId"],
      message: "Pick a resume.",
    });
  if (d.resumeChoice === "new") {
    if (!d.newResumeLabel)
      ctx.addIssue({
        code: "custom",
        path: ["newResumeLabel"],
        message: "Give the resume a label.",
      });
    if (!d.newResumeLink)
      ctx.addIssue({
        code: "custom",
        path: ["newResumeLink"],
        message: "Paste a Google Drive link.",
      });
  }
}

/** A new submission — candidate, job, and submitting recruiter are all fixed here. */
export const submissionSchema = z
  .object({
    candidateId: z.string().min(1, "Select a candidate."),
    jobId: z.string().min(1, "Missing job reference."),
    submittedById: z.string().min(1, "Select the submitting recruiter."),
    ...resumeFields,
  })
  .superRefine(refineResumeChoice);

export type SubmissionInput = z.infer<typeof submissionSchema>;

/**
 * Editing an existing submission. Candidate, job, and submitting recruiter are
 * fixed at creation, so only the submitted date, rate, résumé, and notes are
 * editable.
 */
export const submissionEditSchema = z
  .object({
    ...resumeFields,
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
