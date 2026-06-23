import { z } from "zod";
import {
  optionalText,
  optionalNonNegativeNumber,
  optionalPositiveInt,
  optionalDateTime,
} from "./common";
import { OTHER_SOURCE } from "@/lib/labels";

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

export const jobSchema = z
  .object({
    title: z.string().trim().min(1, "Job title is required.").max(200),
    clientId: z.string().min(1, "Select a client."),
    vendorId: z.string().min(1, "Select a vendor."),
    // Either a managed source FK, or the OTHER_SOURCE sentinel — in which case
    // `sourceOther` carries the free-text name (see the superRefine below).
    sisterCompanySourceId: z.string().default(""),
    sourceOther: optionalText,
    status: z.enum(JOB_STATUS_VALUES),
    location: optionalText,
    clientRate: optionalNonNegativeNumber,
    vendorRate: optionalNonNegativeNumber,
    candidateRate: optionalNonNegativeNumber,
    description: optionalText,
    notes: optionalText,
    recruiterIds: z.array(z.string().min(1)).default([]),
    // Optional planning fields — recruiters can leave them blank. iLabor
    // imports already populate the underlying columns; surfacing them on the
    // manual form means manual jobs reach parity with imported ones.
    positions: optionalPositiveInt,
    reqType: optionalText,
    department: optionalText,
    durationLabel: optionalText,
    atsId: optionalText,
    startDate: optionalDateTime,
    endDate: optionalDateTime,
    // §A2: LuminTrack-native planning fields. Enum strings come from a
    // <select>; the empty string means "not set" and is preprocessed away.
    workMode: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.enum(WORK_MODE_VALUES).optional(),
    ),
    priority: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.enum(JOB_PRIORITY_VALUES).optional(),
    ),
    targetCloseDate: optionalDateTime,
    postingUrl: optionalText,
    workAuthRequirement: optionalText,
    // Comma-separated free text on the form; split + trimmed below.
    skills: optionalText,
  })
  .superRefine((val, ctx) => {
    if (!val.sisterCompanySourceId) {
      ctx.addIssue({
        code: "custom",
        path: ["sisterCompanySourceId"],
        message: "Select a source.",
      });
    } else if (val.sisterCompanySourceId === OTHER_SOURCE && !val.sourceOther) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceOther"],
        message: "Enter the source name.",
      });
    }
  });

export type JobInput = z.infer<typeof jobSchema>;
