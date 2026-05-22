import { z } from "zod";

/** A saved résumé in a candidate's library — label + a Google Drive link. */
export const candidateResumeSchema = z.object({
  candidateId: z.string().min(1, "Missing candidate reference."),
  label: z.string().trim().min(1, "Give this resume a label.").max(120),
  driveLink: z.url("Enter a valid Google Drive link."),
});

export type CandidateResumeInput = z.infer<typeof candidateResumeSchema>;
