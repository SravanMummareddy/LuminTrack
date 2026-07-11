import { z } from "zod";
import { emptyToUndefined } from "./common";
import { passwordIssues } from "@/lib/password-policy";

const base = z.object({
  fullName: z.string().trim().min(1, "Full name is required.").max(120),
  email: z.email("Enter a valid email address."),
  role: z.enum(["MANAGER", "TEAM_LEAD", "RECRUITER"]),
  isActive: z.boolean(),
  // Org placement — both optional ("" → undefined → the action nulls them).
  teamId: z.preprocess(emptyToUndefined, z.string().optional()),
  reportsToId: z.preprocess(emptyToUndefined, z.string().optional()),
});

// Strength policy lives in @/lib/password-policy (shared with the live
// checklist UI). superRefine surfaces each unmet rule as its own issue so the
// form can list exactly what's missing.
const password = z.string().superRefine((value, ctx) => {
  for (const issue of passwordIssues(value)) {
    ctx.addIssue({ code: "custom", message: `Password needs: ${issue}` });
  }
});

/** New users must be given a password. */
export const userCreateSchema = base.extend({ password });

/** Editing a user keeps the existing password unless a new one is entered. */
export const userUpdateSchema = base.extend({
  password: z.preprocess(emptyToUndefined, password.optional()),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

/** Self-service profile edit — a user changing their own name/email. Role and
 *  active status are deliberately not editable here (admin-only). */
export const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required.").max(120),
  email: z.email("Enter a valid email address."),
});
export type ProfileInput = z.infer<typeof profileSchema>;

/** Self-service password change — verify the current password, then set a new
 *  one (must meet the shared password policy, differ from current, be confirmed). */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: password,
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New passwords don't match.",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "New password must be different from your current one.",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
