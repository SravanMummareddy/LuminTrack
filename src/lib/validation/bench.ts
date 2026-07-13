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

const enumRequired = <T extends readonly [string, ...string[]]>(
  values: T,
  message: string,
) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(values, { message }),
  );

const naFlag = z.preprocess((v) => v === "1", z.boolean().default(false));
const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().optional());
const optionalExperience = z.preprocess(
  emptyToUndefined,
  z.coerce
    .number()
    .min(0, "Enter 0 or more.")
    .max(80, "That looks too high — enter years of experience.")
    .optional(),
);

/** Open-to-relocation, presented as a 3-way (mapped to the boolean + cities). */
export const RELOCATION_MODES = ["ANYWHERE", "SPECIFIC", "NO"] as const;

// Forms-discipline (Wave 3). Most bench fields are required; the candidate-derived
// ones (email/phone/location/company/reference/skills/work-auth) prefill but are
// still required. A Visa + least-C2C-rate carry an N/A escape; marketing
// credentials are required-or-N/A only for users who can edit them (enforced in
// the action, which knows the permission).
export const benchConsultantSchema = z
  .object({
    fullName: z.string().trim().min(1, "Consultant name is required.").max(160),
    email: z
      .string()
      .trim()
      .min(1, "Email is required.")
      .pipe(z.email("Enter a valid email address.")),
    phone: z.string().trim().min(1, "Phone is required.").max(60),
    currentLocation: z.string().trim().min(1, "Current location is required."),
    workAuthorization: z.string().trim().min(1, "Work authorization is required."),
    mVisa: z.string().trim().min(1, "Marketing visa is required."),
    aVisa: optionalText,
    aVisaNa: naFlag,
    marketingExpYears: optionalExperience,
    realTimeExpYears: optionalExperience,
    technology: optionalText,
    skills: z.array(z.string().trim().min(1)).min(1, "Add at least one skill.").max(60),
    // Derived from the linked candidate (referrer/source), not user-entered here,
    // so it's optional — a candidate may have no reference on file.
    reference: optionalText,
    company: z.string().trim().min(1, "Company is required."),
    projectType: z.string().trim().min(1, "Project type is required."),
    leastRateC2C: optionalNonNegativeNumber,
    leastRateC2CNa: naFlag,
    callType: z.string().trim().min(1, "Call type is required."),
    payrollType: z.string().trim().min(1, "Payroll type is required."),
    relocationMode: enumRequired(RELOCATION_MODES, "Choose a relocation option."),
    relocationCities: optionalText,
    marketingStartDate: optionalDate,
    // Marketing credentials — required-or-N/A, enforced in the action only for
    // users who can edit them (the schema can't see the permission).
    marketingEmail: optionalEmail,
    marketingPassword: optionalText,
    marketingNumber: optionalText,
    credentialsNa: naFlag,
    priority: z.enum(PRIORITY_VALUES).default("SECOND"),
    marketingStatus: z.enum(MARKETING_STATUS_VALUES).default("ACTIVE"),
    notes: optionalText,
    isActive: z.boolean().default(true),
    // Optional FKs (cuid strings) — empty becomes undefined.
    recruiterId: optionalText,
    candidateId: optionalText,
  })
  .superRefine((d, ctx) => {
    if (d.marketingExpYears == null)
      ctx.addIssue({ code: "custom", path: ["marketingExpYears"], message: "Marketing experience is required." });
    if (!d.aVisa && !d.aVisaNa)
      ctx.addIssue({ code: "custom", path: ["aVisa"], message: "Enter a visa, or mark N/A." });
    if (d.leastRateC2C == null && !d.leastRateC2CNa)
      ctx.addIssue({ code: "custom", path: ["leastRateC2C"], message: "Enter a rate, or mark negotiable." });
    if (d.relocationMode === "SPECIFIC" && !d.relocationCities)
      ctx.addIssue({ code: "custom", path: ["relocationCities"], message: "List the cities, or pick Anywhere / No." });
  });

export type BenchConsultantInput = z.infer<typeof benchConsultantSchema>;
