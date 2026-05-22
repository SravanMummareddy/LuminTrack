import { z } from "zod";
import {
  optionalText,
  optionalEmail,
  optionalUrl,
  emptyToUndefined,
} from "./common";

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
    linkedinUrl: optionalUrl,
    notes: optionalText,
    isActive: z.boolean(),
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: "Enter at least an email address or a phone number.",
    path: ["email"],
  });

export type CandidateInput = z.infer<typeof candidateSchema>;
