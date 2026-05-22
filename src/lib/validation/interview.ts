import { z } from "zod";
import { optionalText, optionalDateTime } from "./common";

export const INTERVIEW_TYPE_VALUES = [
  "VENDOR_SCREENING",
  "CLIENT_INTERVIEW",
  "MANAGER_ROUND",
  "HR_ROUND",
  "FINAL_ROUND",
  "OTHER",
] as const;

export const INTERVIEW_RESULT_VALUES = [
  "WAITING",
  "NEED_ANOTHER_ROUND",
  "SELECTED",
  "REJECTED",
  "ON_HOLD",
  "COMPLETED",
] as const;

export const interviewRoundSchema = z.object({
  submissionId: z.string().min(1, "Missing submission reference."),
  roundName: z.string().trim().min(1, "Round name is required.").max(120),
  interviewType: z.enum(INTERVIEW_TYPE_VALUES),
  result: z.enum(INTERVIEW_RESULT_VALUES),
  interviewerName: optionalText,
  scheduledAt: optionalDateTime,
  feedback: optionalText,
  notes: optionalText,
});

export type InterviewRoundInput = z.infer<typeof interviewRoundSchema>;
