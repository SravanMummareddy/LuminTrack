import { z } from "zod";
import {
  optionalText,
  optionalEmail,
  optionalUrl,
  emptyToUndefined,
} from "./common";
import { CANDIDATE_STATUSES } from "@/lib/labels";

const CANDIDATE_STATUS_VALUES = CANDIDATE_STATUSES as unknown as readonly [
  (typeof CANDIDATE_STATUSES)[number],
  ...(typeof CANDIDATE_STATUSES)[number][],
];

const optionalDate = z.preprocess(
  emptyToUndefined,
  z.coerce.date().optional(),
);

const optionalExperience = z.preprocess(
  emptyToUndefined,
  z.coerce
    .number()
    .min(0, "Enter 0 or more.")
    .max(80, "That looks too high — enter years of experience.")
    .optional(),
);

export const candidateSchema = z
  .object({
    fullName: z.string().trim().min(1, "Candidate name is required.").max(160),
    email: optionalEmail,
    phone: optionalText,
    currentLocation: optionalText,
    workAuthorization: optionalText,
    totalExperienceYears: optionalExperience,
    currentCompany: optionalText,
    skills: z.array(z.string().trim().min(1)).max(60).default([]),
    featuredSkills: z.array(z.string().trim().min(1)).max(3).default([]),
    linkedinUrl: optionalUrl,
    notes: optionalText,
    isActive: z.boolean(),
    status: z.enum(CANDIDATE_STATUS_VALUES).default("AVAILABLE"),
    tags: z.array(z.string().trim().min(1)).max(30).default([]),
    lastContactedAt: optionalDate,
    source: optionalText,
  })
  .refine((d) => Boolean(d.email || d.phone), {
    // Surface as a form-level error (no path) so it shows in the top-of-form
    // banner — pinning it to `email` falsely implied the email field itself
    // was the problem when in practice either field can satisfy the rule.
    message: "Enter at least an email address or a phone number.",
  })
  .refine((d) => d.featuredSkills.every((s) => d.skills.includes(s)), {
    message: "Starred skills must come from the Skills list.",
    path: ["featuredSkills"],
  });

export type CandidateInput = z.infer<typeof candidateSchema>;
