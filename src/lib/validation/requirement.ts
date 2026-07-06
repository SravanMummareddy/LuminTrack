import { z } from "zod";
import {
  optionalText,
  optionalNonNegativeNumber,
  emptyToUndefined,
} from "./common";

// Fields shared by the create + edit requirement forms. Everything except the
// job is optional — a requirement is a planning record that can start sparse
// and be filled in (or completed at convert time). Company is NOT captured here
// (it derives from the linked candidate's currentCompany).
const requirementBase = {
  candidateId: z.preprocess(emptyToUndefined, z.string().optional()),
  recruiterId: z.preprocess(emptyToUndefined, z.string().optional()),
  location: optionalText,
  payRate: optionalNonNegativeNumber,
  billRate: optionalNonNegativeNumber,
  candidateRate: optionalNonNegativeNumber,
  clientRate: optionalNonNegativeNumber,
  engagement: z.preprocess(emptyToUndefined, z.enum(["C2C", "W2"]).optional()),
  vendorRecruiterName: optionalText,
  jobDuties: optionalText,
  teamLead: optionalText,
  submissionNotes: optionalText,
};

/** A new requirement — the job is required and fixed once chosen. */
export const requirementSchema = z.object({
  jobId: z.string().min(1, "Select a job."),
  ...requirementBase,
});

/** Editing an OPEN requirement — the job stays fixed. */
export const requirementEditSchema = z.object({ ...requirementBase });

export type RequirementInput = z.infer<typeof requirementSchema>;
export type RequirementEditInput = z.infer<typeof requirementEditSchema>;
