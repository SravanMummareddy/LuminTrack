import { z } from "zod";
import {
  optionalText,
  optionalDateTime,
  optionalUrl,
  emptyToUndefined,
} from "./common";
import { INTERVIEW_MODES, INTERVIEW_PLATFORMS } from "@/lib/labels";

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

export const interviewRoundSchema = z
  .object({
    submissionId: z.string().min(1, "Missing submission reference."),
    roundName: z.string().trim().min(1, "Round name is required.").max(120),
    interviewType: z.enum(INTERVIEW_TYPE_VALUES),
    result: z.enum(INTERVIEW_RESULT_VALUES),
    interviewerName: optionalText,
    // How the interview is held; `interviewPlatform` only applies to VIDEO.
    interviewMode: z.preprocess(
      emptyToUndefined,
      z.enum(INTERVIEW_MODES).optional(),
    ),
    interviewPlatform: z.preprocess(
      emptyToUndefined,
      z.enum(INTERVIEW_PLATFORMS).optional(),
    ),
    meetingLink: optionalUrl,
    scheduledAt: optionalDateTime,
    // §D5 — IANA timezone name (e.g. "America/New_York"). Free-text by design
    // so new zones don't need a code release; validated only by length here.
    scheduledTimezone: optionalText,
    // The sheet's "Support (Y/N)" — a checkbox. The action passes a real
    // boolean today, but don't use z.coerce.boolean(): it turns ANY non-empty
    // string (incl. "false", "off") into true, so a future hidden-input or
    // serialization change would silently record true. Accept only explicit
    // truthy checkbox values.
    supportNeeded: z.preprocess(
      (v) => v === true || v === "on" || v === "true",
      z.boolean(),
    ),
    // External support provider (optional FK) + how support was given (note).
    supportProviderId: z.preprocess(emptyToUndefined, z.string().optional()),
    supportMethod: optionalText,
    feedback: optionalText,
    notes: optionalText,
  })
  .superRefine((d, ctx) => {
    if (d.interviewPlatform && d.interviewMode !== "VIDEO") {
      ctx.addIssue({
        code: "custom",
        path: ["interviewPlatform"],
        message: "A platform applies to video interviews only.",
      });
    }
  });

export type InterviewRoundInput = z.infer<typeof interviewRoundSchema>;
