import { z } from "zod";
import { optionalText, optionalEmail } from "./common";

/** Sister companies and vendors share the same shape (name + contact details). */
export const contactOrgSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  contactPerson: optionalText,
  email: optionalEmail,
  phone: optionalText,
  notes: optionalText,
  isActive: z.boolean(),
});

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  location: optionalText,
  notes: optionalText,
  isActive: z.boolean(),
});

export type ContactOrgInput = z.infer<typeof contactOrgSchema>;
export type ClientInput = z.infer<typeof clientSchema>;
