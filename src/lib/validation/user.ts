import { z } from "zod";
import { emptyToUndefined } from "./common";

const base = z.object({
  fullName: z.string().trim().min(1, "Full name is required.").max(120),
  email: z.email("Enter a valid email address."),
  role: z.enum(["MANAGER", "TEAM_LEAD", "RECRUITER"]),
  isActive: z.boolean(),
});

const password = z.string().min(8, "Password must be at least 8 characters.");

/** New users must be given a password. */
export const userCreateSchema = base.extend({ password });

/** Editing a user keeps the existing password unless a new one is entered. */
export const userUpdateSchema = base.extend({
  password: z.preprocess(emptyToUndefined, password.optional()),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
