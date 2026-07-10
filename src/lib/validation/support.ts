import { z } from "zod";
import { optionalText, optionalEmail } from "./common";

/** Parse a comma-separated skills string into a de-duped, trimmed list. */
export function parseSkills(raw: FormDataEntryValue | null): string[] {
  const text = typeof raw === "string" ? raw : "";
  return [
    ...new Set(
      text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

/** An external interview-support individual. Name only is required; the rest is
 *  contact + skills + reference so a recruiter can find and reach them. */
export const supportProviderSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  phone: optionalText,
  email: optionalEmail,
  skills: z.array(z.string().trim().min(1)).max(40),
  reference: optionalText,
  notes: optionalText,
  isActive: z.boolean(),
});

export type SupportProviderInput = z.infer<typeof supportProviderSchema>;
