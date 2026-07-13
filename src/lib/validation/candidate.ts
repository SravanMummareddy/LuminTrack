import { z } from "zod";
import { optionalText, emptyToUndefined } from "./common";
import { CANDIDATE_STATUSES } from "@/lib/labels";

const CANDIDATE_STATUS_VALUES = CANDIDATE_STATUSES as unknown as readonly [
  (typeof CANDIDATE_STATUSES)[number],
  ...(typeof CANDIDATE_STATUSES)[number][],
];

const enumRequired = <T extends readonly [string, ...string[]]>(
  values: T,
  message: string,
) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(values, { message }),
  );

const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().optional());

const optionalExperience = z.preprocess(
  emptyToUndefined,
  z.coerce
    .number()
    .min(0, "Enter 0 or more.")
    .max(80, "That looks too high — enter years of experience.")
    .optional(),
);

// Forms-discipline (Wave 3): most candidate fields are required. A few are
// conditionally required (company + engagement type only when "Working now?"),
// enforced in the superRefine. Featured skills stay a subset of Skills.
export const candidateSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required.").max(80),
    lastName: z.string().trim().min(1, "Last name is required.").max(80),
    email: z
      .string()
      .trim()
      .min(1, "Email is required.")
      .pipe(z.email("Enter a valid email address.")),
    phone: z.string().trim().min(1, "Phone is required.").max(60),
    currentLocation: z.string().trim().min(1, "Current location is required."),
    workAuthorization: z.string().trim().min(1, "Work authorization is required."),
    totalExperienceYears: optionalExperience,
    realTimeExperienceYears: optionalExperience,
    technology: z.string().trim().min(1, "Technology is required."),
    currentCompany: optionalText,
    skills: z.array(z.string().trim().min(1)).min(1, "Add at least one skill.").max(60),
    featuredSkills: z.array(z.string().trim().min(1)).max(3).default([]),
    // Optional — many candidates are sourced without a LinkedIn on hand. Still
    // validated as a URL when provided.
    linkedinUrl: z.preprocess(emptyToUndefined, z.url("Enter a valid URL.").optional()),
    notes: optionalText,
    isActive: z.boolean(),
    status: z.enum(CANDIDATE_STATUS_VALUES).default("AVAILABLE"),
    tags: z.array(z.string().trim().min(1)).max(30).default([]),
    lastContactedAt: optionalDate,
    // Required for new/normal candidates, but legacy rows carry only free-text
    // `source` and no referrer — the superRefine exempts those so old records
    // stay editable. (Made optional here; the conditional check lives below.)
    referrerId: optionalText,
    // Legacy free-text source — kept, read-only, for rows that predate referrerId.
    source: optionalText,
    isWorking: z.boolean().default(false),
    workingType: optionalText,
    discipline: enumRequired(["IT", "NON_IT"] as const, "Select IT or Non-IT."),
  })
  .superRefine((d, ctx) => {
    if (!d.featuredSkills.every((s) => d.skills.includes(s)))
      ctx.addIssue({
        code: "custom",
        path: ["featuredSkills"],
        message: "Starred skills must come from the Skills list.",
      });
    if (d.totalExperienceYears == null)
      ctx.addIssue({
        code: "custom",
        path: ["totalExperienceYears"],
        message: "Total experience is required.",
      });
    // Reference is required for new/normal candidates. Legacy rows (free-text
    // `source`, no referrer) are exempt so they stay editable without forcing a
    // referrer onto a historical record.
    if (!d.referrerId && !d.source)
      ctx.addIssue({
        code: "custom",
        path: ["referrerId"],
        message: "Pick a reference, or add one.",
      });
    // Company + engagement type are required only while the candidate is working
    // (owner: "required, if not working → on-bench tag").
    if (d.isWorking) {
      if (!d.currentCompany)
        ctx.addIssue({
          code: "custom",
          path: ["currentCompany"],
          message: "Enter the current company, or turn off Working now.",
        });
      if (!d.workingType)
        ctx.addIssue({
          code: "custom",
          path: ["workingType"],
          message: "Enter the engagement type.",
        });
    }
  });

export type CandidateInput = z.infer<typeof candidateSchema>;
