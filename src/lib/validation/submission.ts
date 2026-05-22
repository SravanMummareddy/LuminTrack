import { z } from "zod";
import { optionalText, optionalUrl, optionalNonNegativeNumber } from "./common";

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

export const submissionSchema = z.object({
  candidateId: z.string().min(1, "Select a candidate."),
  jobId: z.string().min(1, "Missing job reference."),
  submittedById: z.string().min(1, "Select the submitting recruiter."),
  candidateRate: optionalNonNegativeNumber,
  resumeDriveLink: optionalUrl,
  submissionNotes: optionalText,
});

export type SubmissionInput = z.infer<typeof submissionSchema>;
