import { z } from "zod";
import { optionalText, optionalNonNegativeNumber } from "./common";

export const JOB_STATUS_VALUES = [
  "OPEN",
  "ON_HOLD",
  "CLOSED",
  "FILLED",
  "CANCELLED",
] as const;

export const jobSchema = z.object({
  title: z.string().trim().min(1, "Job title is required.").max(200),
  clientId: z.string().min(1, "Select a client."),
  vendorId: z.string().min(1, "Select a vendor."),
  sisterCompanySourceId: z.string().min(1, "Select a sister company source."),
  status: z.enum(JOB_STATUS_VALUES),
  location: optionalText,
  vendorRate: optionalNonNegativeNumber,
  candidateRate: optionalNonNegativeNumber,
  description: optionalText,
  notes: optionalText,
  recruiterIds: z.array(z.string().min(1)).default([]),
});

export type JobInput = z.infer<typeof jobSchema>;
