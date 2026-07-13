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
  // Wave 4: a scheduled interview/screening that did not take place.
  "NO_SHOW",
  "CANCELLED",
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

    // Wave 4 (strict): the fields that mean "an interview is actually set up" —
    // mode, interviewer, date/time — are HARD-required (no N/A escape), so a
    // recruiter can't slip an empty round past the pipeline's advance gate. A
    // video call additionally needs its platform + join link. The rest stay
    // required-or-N/A (they don't exist until the interview happens): feedback,
    // time zone, and the support pair.
    const hard = (blank: boolean, path: string, message: string) => {
      if (blank) ctx.addIssue({ code: "custom", path: [path], message });
    };
    const req = (
      blank: boolean,
      na: boolean,
      path: string,
      message: string,
    ) => {
      if (blank && !na) ctx.addIssue({ code: "custom", path: [path], message });
    };
    hard(!d.interviewMode, "interviewMode", "Pick how the interview is held.");
    // Model B: the interviewer is often unknown when booking → required-or-TBD.
    req(!d.interviewerName, d.interviewerNameNa, "interviewerName", "Enter who is interviewing, or mark TBD.");
    hard(d.scheduledAt == null, "scheduledAt", "Set the interview date & time.");
    req(!d.scheduledTimezone, d.scheduledTimezoneNa, "scheduledTimezone", "Enter a time zone, or mark N/A.");
    // Feedback only matters once the interview has happened (a non-Waiting
    // result). A still-scheduled round (Waiting) needs none.
    if (d.result !== "WAITING")
      req(!d.feedback, d.feedbackNa, "feedback", "Enter feedback, or mark N/A.");

    // A video call must carry its platform + a join link (no N/A escape).
    if (d.interviewMode === "VIDEO") {
      hard(!d.interviewPlatform, "interviewPlatform", "Pick the video platform.");
      hard(!d.meetingLink, "meetingLink", "Add the join link for the video call.");
    }

    // Conditional-required: the support pair only when support was used.
    if (d.supportNeeded) {
      req(!d.supportProviderId, d.supportProviderIdNa, "supportProviderId", "Pick a provider, or mark N/A.");
      req(!d.supportMethod, d.supportMethodNa, "supportMethod", "Describe the method, or mark N/A.");
    }
  });

export type InterviewRoundInput = z.infer<typeof interviewRoundSchema>;
