import { z } from "zod";
import {
  optionalText,
  optionalUrl,
  optionalNonNegativeNumber,
  emptyToUndefined,
} from "./common";

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
 * fixed at creation, so only the rate, résumé, and notes are editable.
 */
export const submissionEditSchema = z
  .object(resumeFields)
  .superRefine(refineResumeChoice);

export type SubmissionEditInput = z.infer<typeof submissionEditSchema>;
