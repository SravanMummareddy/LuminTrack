import { z } from "zod";
import {
  optionalText,
  optionalNonNegativeNumber,
  optionalPositiveInt,
  optionalDateTime,
} from "./common";

export const JOB_STATUS_VALUES = [
  "OPEN",
  "ON_HOLD",
  "CLOSED",
  "FILLED",
  "CANCELLED",
] as const;

export const WORK_MODE_VALUES = ["REMOTE", "HYBRID", "ONSITE"] as const;
export const JOB_PRIORITY_VALUES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;
export const DISCIPLINE_VALUES = ["IT", "NON_IT"] as const;
export const JOB_SOURCE_TYPE_VALUES = [
  "JOB_BOARD",
  "REFERRAL",
  "SISTER_COMPANY",
  "OTHER",
] as const;

// Forms-discipline (Wave 3): most fields are required, and a few carry an
// explicit "N-A / Don't know" escape — the form posts `<field>__na="1"` when the
// recruiter consciously marks it unknown, which satisfies the requirement while
// storing null. `enumRequired` and `naOr` build those two rules.
const enumRequired = <T extends readonly [string, ...string[]]>(
  values: T,
  message: string,
) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(values, { message }),
  );

export const jobSchema = z
  .object({
    title: z.string().trim().min(1, "Job title is required.").max(200),
    clientId: z.string().min(1, "Select a client."),
    vendorId: z.string().min(1, "Select a vendor."),
    // Source rework: `sourceType` selects which detail field applies.
    sourceType: enumRequired(JOB_SOURCE_TYPE_VALUES, "Select a source type."),
    jobBoard: optionalText,
    referrerId: optionalText,
    sisterCompanySourceId: optionalText,
    sourceOther: optionalText,
    status: z.enum(JOB_STATUS_VALUES),
    location: z.string().trim().min(1, "Enter a location (or Remote)."),
    clientRate: optionalNonNegativeNumber,
    vendorRate: optionalNonNegativeNumber,
    description: z.string().trim().min(1, "A job description is required."),
    notes: optionalText,
    positions: optionalPositiveInt,
    startDate: optionalDateTime,
    startDateEstimated: z.preprocess(
      (v) => v === "1" || v === "true" || v === true,
      z.boolean().default(false),
    ),
    endDate: optionalDateTime,
    // D3/V-5: required received date — when the requirement actually arrived.
    // Defaults to today on the form; can't be in the future (checked below).
    receivedAt: z.coerce.date({ message: "Enter the date the requirement was received." }),
    // Required-by-default enums (empty string → a required error, not "not set").
    workMode: enumRequired(WORK_MODE_VALUES, "Select a work mode."),
    priority: enumRequired(JOB_PRIORITY_VALUES, "Select a priority."),
    discipline: enumRequired(DISCIPLINE_VALUES, "Select IT or Non-IT."),
    // Required-with-N/A fields + their escape flags.
    targetCloseDate: optionalDateTime,
    targetCloseDateNa: z.preprocess((v) => v === "1", z.boolean().default(false)),
    workAuthRequirement: optionalText,
    workAuthRequirementNa: z.preprocess((v) => v === "1", z.boolean().default(false)),
    postingUrl: optionalText,
    // Comma-separated free text on the form; split + trimmed below.
    skills: z.string().trim().min(1, "Add at least one skill."),
  })
  .superRefine((val, ctx) => {
    // Source-type-conditional required detail.
    if (val.sourceType === "JOB_BOARD") {
      // The board name identifies the source; the posting URL is optional
      // (not always on hand when logging the job).
      if (!val.jobBoard)
        ctx.addIssue({ code: "custom", path: ["jobBoard"], message: "Pick or type a job board." });
    } else if (val.sourceType === "REFERRAL" && !val.referrerId) {
      ctx.addIssue({ code: "custom", path: ["referrerId"], message: "Pick a referrer, or add one." });
    } else if (val.sourceType === "SISTER_COMPANY" && !val.sisterCompanySourceId) {
      ctx.addIssue({ code: "custom", path: ["sisterCompanySourceId"], message: "Choose a sister company." });
    } else if (val.sourceType === "OTHER" && !val.sourceOther) {
      ctx.addIssue({ code: "custom", path: ["sourceOther"], message: "Describe where it came from." });
    }
    // D3: a received date in the future is a typo, not a real intake date.
    if (
      val.receivedAt instanceof Date &&
      !Number.isNaN(val.receivedAt.getTime()) &&
      val.receivedAt.getTime() > Date.now()
    )
      ctx.addIssue({ code: "custom", path: ["receivedAt"], message: "Received date can't be in the future." });
    // A projected end before the projected start is a typo — it also renders a
    // blank "duration" with no explanation. Only checked when both are present.
    if (val.startDate && val.endDate && val.endDate < val.startDate)
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date can't be before the start date." });
    // Required-with-N/A: satisfied by a value OR the explicit N/A flag.
    if (!val.targetCloseDate && !val.targetCloseDateNa)
      ctx.addIssue({ code: "custom", path: ["targetCloseDate"], message: "Enter a date, or mark N/A." });
    if (!val.workAuthRequirement && !val.workAuthRequirementNa)
      ctx.addIssue({ code: "custom", path: ["workAuthRequirement"], message: "Fill this in, or mark N/A." });
  });

export type JobInput = z.infer<typeof jobSchema>;
