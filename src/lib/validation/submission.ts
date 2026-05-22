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
 * A new submission. The résumé is optional and provided one of three ways
 * (`resumeChoice`): an existing library résumé, a brand-new one entered inline,
 * or none. FormData sends flat strings, so the cross-field rules run in a
 * `superRefine` rather than a discriminated union.
 */
export const submissionSchema = z
  .object({
    candidateId: z.string().min(1, "Select a candidate."),
    jobId: z.string().min(1, "Missing job reference."),
    submittedById: z.string().min(1, "Select the submitting recruiter."),
    candidateRate: optionalNonNegativeNumber,
    submissionNotes: optionalText,
    resumeChoice: z.enum(["existing", "new", "none"]).catch("none"),
    candidateResumeId: z.preprocess(emptyToUndefined, z.string().optional()),
    newResumeLabel: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(120).optional(),
    ),
    newResumeLink: optionalUrl,
  })
  .superRefine((d, ctx) => {
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
  });

export type SubmissionInput = z.infer<typeof submissionSchema>;
