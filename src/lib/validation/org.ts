import { z } from "zod";
import { optionalText, optionalEmail } from "./common";

/** Sources and vendors share the same shape (name + contact details). The
 *  vendor form additionally posts `recruitedBy` (our owning team member, a
 *  type-or-pick string); sources omit it, so it's optional here. */
export const contactOrgSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  contactPerson: optionalText,
  email: optionalEmail,
  phone: optionalText,
  location: optionalText,
  notes: optionalText,
  recruitedBy: optionalText,
  isActive: z.boolean(),
});

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  contactPerson: optionalText,
  email: optionalEmail,
  phone: optionalText,
  location: optionalText,
  notes: optionalText,
  isActive: z.boolean(),
});

/** A named team + its optional lead (a team-lead user; "" → no lead). */
export const teamSchema = z.object({
  name: z.string().trim().min(1, "Team name is required.").max(120),
  leadId: optionalText,
});

/** A referrer in the reusable directory (source rework) — a person who refers
 *  jobs to us. `company` replaces the contact-person field. */
export const referrerSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  email: optionalEmail,
  phone: optionalText,
  company: optionalText,
  notes: optionalText,
  isActive: z.boolean(),
});

export type ContactOrgInput = z.infer<typeof contactOrgSchema>;
export type ClientInput = z.infer<typeof clientSchema>;
export type TeamInput = z.infer<typeof teamSchema>;
export type ReferrerInput = z.infer<typeof referrerSchema>;
