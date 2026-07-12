import { z } from "zod";
import type { RefinementCtx } from "zod";
import {
  optionalText,
  optionalNonNegativeNumber,
  emptyToUndefined,
} from "./common";

// Forms-discipline (Wave 3, mirroring the Job form #86): most fields are
// required, and a few carry an explicit "N-A / Not disclosed / pending" escape —
// the form posts `<field>__na="1"` when marked unknown, which satisfies the
// requirement while storing null. `enumRequired` + `naFlag` build those rules.
const enumRequired = <T extends readonly [string, ...string[]]>(
  values: T,
  message: string,
) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(values, { message }),
  );

const naFlag = z.preprocess((v) => v === "1", z.boolean().default(false));

// Fields shared by the create + edit requirement forms. Company is NOT captured
// here (it derives from the linked candidate's currentCompany). The candidate is
// chosen by the recruiter at submission time, so it stays optional (carried as a
// hidden passthrough on edit — the VPR form no longer picks one).
const requirementBase = {
  candidateId: z.preprocess(emptyToUndefined, z.string().optional()),
  // Marketing recruiter — required, or an explicit "unassigned" N/A.
  recruiterId: z.preprocess(emptyToUndefined, z.string().optional()),
  recruiterIdNa: naFlag,
  location: z.string().trim().min(1, "Enter a location (or Remote)."),
  // All three rates — a value, or an explicit N/A ("Not disclosed" / "pending").
  payRate: optionalNonNegativeNumber,
  payRateNa: naFlag,
  billRate: optionalNonNegativeNumber,
  billRateNa: naFlag,
  clientRate: optionalNonNegativeNumber,
  clientRateNa: naFlag,
  engagement: enumRequired(["C2C", "W2"] as const, "Select C2C or W2."),
  vendorRecruiterName: z.string().trim().min(1, "Select who recruited this vendor."),
  jobDuties: optionalText,
  teamLead: z.string().trim().min(1, "Select a team lead."),
  submissionNotes: optionalText,
};

/** Each required-or-N/A field is satisfied by a value OR its explicit N/A flag. */
function refineRequired(
  val: {
    recruiterId?: string;
    recruiterIdNa: boolean;
    payRate?: number;
    payRateNa: boolean;
    billRate?: number;
    billRateNa: boolean;
    clientRate?: number;
    clientRateNa: boolean;
  },
  ctx: RefinementCtx,
) {
  if (!val.recruiterId && !val.recruiterIdNa)
    ctx.addIssue({ code: "custom", path: ["recruiterId"], message: "Pick a recruiter, or mark unassigned." });
  if (val.clientRate == null && !val.clientRateNa)
    ctx.addIssue({ code: "custom", path: ["clientRate"], message: "Enter a rate, or mark not disclosed." });
  if (val.billRate == null && !val.billRateNa)
    ctx.addIssue({ code: "custom", path: ["billRate"], message: "Enter a rate, or mark pending." });
  if (val.payRate == null && !val.payRateNa)
    ctx.addIssue({ code: "custom", path: ["payRate"], message: "Enter a rate, or mark pending." });
}

/** A new requirement — the job is required and fixed once chosen. */
export const requirementSchema = z
  .object({
    jobId: z.string().min(1, "Select a job."),
    ...requirementBase,
  })
  .superRefine(refineRequired);

/** Editing an OPEN requirement — the job stays fixed. */
export const requirementEditSchema = z
  .object({ ...requirementBase })
  .superRefine(refineRequired);

export type RequirementInput = z.infer<typeof requirementSchema>;
export type RequirementEditInput = z.infer<typeof requirementEditSchema>;
