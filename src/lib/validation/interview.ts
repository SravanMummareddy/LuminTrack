import { z } from "zod";
import {
  optionalText,
  optionalDateTime,
  optionalUrl,
  emptyToUndefined,
} from "./common";
import { INTERVIEW_MODES, INTERVIEW_PLATFORMS } from "@/lib/labels";

/** Posts "1" when the field is explicitly marked N/A — satisfies the requirement
 *  while the value stays blank (stored null). Mirrors validation/submission.ts. */
const naFlag = z.preprocess((v) => v === "1", z.boolean().default(false));

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
    interviewerNameNa: naFlag,
    // How the interview is held; `interviewPlatform` only applies to VIDEO.
    interviewMode: z.preprocess(
      emptyToUndefined,
      z.enum(INTERVIEW_MODES).optional(),
    ),
    interviewModeNa: naFlag,
    interviewPlatform: z.preprocess(
      emptyToUndefined,
      z.enum(INTERVIEW_PLATFORMS).optional(),
    ),
    interviewPlatformNa: naFlag,
    meetingLink: optionalUrl,
    meetingLinkNa: naFlag,
    scheduledAt: optionalDateTime,
    scheduledAtNa: naFlag,
    // §D5 — IANA timezone name (e.g. "America/New_York"). Free-text by design
    // so new zones don't need a code release; validated only by length here.
    scheduledTimezone: optionalText,
    scheduledTimezoneNa: naFlag,
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
    supportProviderIdNa: naFlag,
    supportMethod: optionalText,
    supportMethodNa: naFlag,
    feedback: optionalText,
    feedbackNa: naFlag,
    // Notes stays optional (owner, 2026-07-12) — every other field is
    // required-or-N/A; feedback already forces a conscious blank.
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

    // Forms-discipline (Wave 3, PR-5): required-or-N/A everywhere except the
    // hard-required identity/outcome (roundName/interviewType/result) + notes.
    const req = (
      blank: boolean,
      na: boolean,
      path: string,
      message: string,
    ) => {
      if (blank && !na) ctx.addIssue({ code: "custom", path: [path], message });
    };
    req(!d.interviewMode, d.interviewModeNa, "interviewMode", "Pick a mode, or mark N/A.");
    req(!d.interviewerName, d.interviewerNameNa, "interviewerName", "Enter the interviewer, or mark N/A.");
    req(!d.meetingLink, d.meetingLinkNa, "meetingLink", "Enter a link, or mark N/A.");
    req(d.scheduledAt == null, d.scheduledAtNa, "scheduledAt", "Set a date/time, or mark N/A.");
    req(!d.scheduledTimezone, d.scheduledTimezoneNa, "scheduledTimezone", "Enter a time zone, or mark N/A.");
    req(!d.feedback, d.feedbackNa, "feedback", "Enter feedback, or mark N/A.");

    // Conditional-required: video platform only when the mode is a video call.
    if (d.interviewMode === "VIDEO")
      req(!d.interviewPlatform, d.interviewPlatformNa, "interviewPlatform", "Pick a platform, or mark N/A.");

    // Conditional-required: the support pair only when support was used.
    if (d.supportNeeded) {
      req(!d.supportProviderId, d.supportProviderIdNa, "supportProviderId", "Pick a provider, or mark N/A.");
      req(!d.supportMethod, d.supportMethodNa, "supportMethod", "Describe the method, or mark N/A.");
    }
  });

export type InterviewRoundInput = z.infer<typeof interviewRoundSchema>;
