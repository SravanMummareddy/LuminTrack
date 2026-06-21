import { z } from "zod";
import {
  optionalText,
  optionalEmail,
  optionalNonNegativeNumber,
  emptyToUndefined,
} from "./common";
import { BENCH_PRIORITIES, BENCH_MARKETING_STATUSES } from "@/lib/labels";

const PRIORITY_VALUES = BENCH_PRIORITIES as unknown as readonly [
  (typeof BENCH_PRIORITIES)[number],
  ...(typeof BENCH_PRIORITIES)[number][],
];
const MARKETING_STATUS_VALUES = BENCH_MARKETING_STATUSES as unknown as readonly [
  (typeof BENCH_MARKETING_STATUSES)[number],
  ...(typeof BENCH_MARKETING_STATUSES)[number][],
];

const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().optional());

const optionalExperience = z.preprocess(
  emptyToUndefined,
  z.coerce
    .number()
    .min(0, "Enter 0 or more.")
    .max(80, "That looks too high — enter years of experience.")
    .optional(),
);

export const benchConsultantSchema = z.object({
  fullName: z.string().trim().min(1, "Consultant name is required.").max(160),
  email: optionalEmail,
  phone: optionalText,
  currentLocation: optionalText,
  workAuthorization: optionalText,
  mVisa: optionalText,
  aVisa: optionalText,
  marketingExpYears: optionalExperience,
  realTimeExpYears: optionalExperience,
  technology: optionalText,
  skills: z.array(z.string().trim().min(1)).max(60).default([]),
  reference: optionalText,
  company: optionalText,
  projectType: optionalText,
  leastRateC2C: optionalNonNegativeNumber,
  callType: optionalText,
  payrollType: optionalText,
  relocation: z.boolean().default(false),
  marketingStartDate: optionalDate,
  // Marketing credentials — gated on the read path (canViewBenchCredentials).
  marketingEmail: optionalEmail,
  marketingPassword: optionalText,
  marketingNumber: optionalText,
  personalNumber: optionalText,
  priority: z.enum(PRIORITY_VALUES).default("SECOND"),
  marketingStatus: z.enum(MARKETING_STATUS_VALUES).default("ACTIVE"),
  notes: optionalText,
  isActive: z.boolean().default(true),
  // Optional FKs (cuid strings) — empty becomes undefined.
  recruiterId: optionalText,
  candidateId: optionalText,
});

export type BenchConsultantInput = z.infer<typeof benchConsultantSchema>;
