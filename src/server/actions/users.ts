"use server";

import { revalidatePath } from "next/cache";
import { prisma, isUniqueConstraintError } from "@/server/db";
import { requireUser } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { canManageUsers, hasFullAccess, roleLabel } from "@/lib/permissions";
import { logActivity } from "@/server/activity";
import {
  userCreateSchema,
  userUpdateSchema,
  changePasswordSchema,
  profileSchema,
} from "@/lib/validation/user";
import { toFieldErrors } from "@/lib/validation/common";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import type { FormState } from "@/lib/form-state";

export async function saveUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageUsers(actor))
    return { error: "Only managers and team leads can manage users." };

  const id = String(formData.get("id") ?? "").trim();
  const raw = {
    fullName: formData.get("fullName") ?? "",
    email: formData.get("email") ?? "",
    role: formData.get("role") ?? "RECRUITER",
    isActive: formData.get("isActive") != null,
    password: formData.get("password") ?? "",
  };
  const parsed = id
    ? userUpdateSchema.safeParse(raw)
    : userCreateSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  // Governance: only a Manager may grant the Manager role or edit an existing
  // Manager's account. Team leads can manage recruiters and team leads (and
  // grant the Team Lead role) but cannot escalate anyone — including
  // themselves — to Manager.
  const actorIsManager = actor.role === "MANAGER";
  if (!actorIsManager) {
    if (parsed.data.role === "MANAGER")
      return { error: "Only managers can grant the Manager role." };
    if (id) {
      const target = await prisma.user.findUnique({
        where: { id },
        select: { role: true },
      });
      if (target?.role === "MANAGER")
        return { error: "Only managers can edit a manager's account." };
    }
  }

  // A full-access user must not be able to lock themselves out of the app.
  if (id && id === actor.id) {
    if (!parsed.data.isActive)
      return { error: "You cannot deactivate your own account." };
    if (!hasFullAccess({ role: parsed.data.role }))
      return {
        error: "You cannot remove your own manager/team-lead role.",
      };
  }

  const fields = {
    fullName: parsed.data.fullName,
    email: parsed.data.email.toLowerCase(),
    role: parsed.data.role,
    isActive: parsed.data.isActive,
  };

  // Hash outside the transaction — bcrypt is CPU-bound and shouldn't hold the tx
  // open. `password` is required by userCreateSchema, so on create newHash is
  // always set.
  const passwordChanged = Boolean(parsed.data.password);
  const newHash = passwordChanged
    ? await hashPassword(parsed.data.password as string)
    : null;

  try {
    await prisma.$transaction(async (tx) => {
      if (id) {
        await tx.user.update({
          where: { id },
          data: newHash ? { ...fields, passwordHash: newHash } : fields,
        });
        await logActivity(tx, {
          entityType: "USER",
          action: "USER_UPDATED",
          description: `Updated user ${fields.email} · ${roleLabel(fields.role)}${
            passwordChanged ? " · password reset" : ""
          }`,
          performedById: actor.id,
        });
      } else {
        await tx.user.create({
          data: { ...fields, passwordHash: newHash as string },
        });
        await logActivity(tx, {
          entityType: "USER",
          action: "USER_CREATED",
          description: `Created user ${fields.email} · ${roleLabel(fields.role)}`,
          performedById: actor.id,
        });
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error))
      return { fieldErrors: { email: "A user with this email already exists." } };
    throw error;
  }

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Self-service password change. Any signed-in user can rotate their own
 * password: verify the current one, then set the new hash and log a
 * USER_PASSWORD_CHANGED audit row (performed by, and about, the same user).
 */
export async function changeOwnPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();

  // Throttle the current-password check so a hijacked session can't brute-force
  // it. 5 attempts / 15 min per user; cleared on a successful change below.
  const rlKey = `pwchange:${actor.id}`;
  const limit = rateLimit(rlKey, 5, 15 * 60 * 1000);
  if (!limit.ok) {
    const mins = Math.max(1, Math.ceil(limit.retryAfterMs / 60000));
    return {
      error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword") ?? "",
    newPassword: formData.get("newPassword") ?? "",
    confirmPassword: formData.get("confirmPassword") ?? "",
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  const ok = await verifyPassword(parsed.data.currentPassword, actor.passwordHash);
  if (!ok)
    return { fieldErrors: { currentPassword: "Current password is incorrect." } };

  const newHash = await hashPassword(parsed.data.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.id },
      data: { passwordHash: newHash },
    });
    await logActivity(tx, {
      entityType: "USER",
      action: "USER_PASSWORD_CHANGED",
      description: `${actor.fullName} changed their password`,
      performedById: actor.id,
    });
  });

  resetRateLimit(rlKey);
  return { ok: true, toast: { title: "Password updated" } };
}

/**
 * Self-service profile edit: any signed-in user can update their own name and
 * email. Role/active status stay admin-only (not accepted here). Logs
 * USER_UPDATED about themselves.
 */
export async function updateOwnProfile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName") ?? "",
    email: formData.get("email") ?? "",
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  const email = parsed.data.email.toLowerCase();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: actor.id },
        data: { fullName: parsed.data.fullName, email },
      });
      await logActivity(tx, {
        entityType: "USER",
        action: "USER_UPDATED",
        description: `Updated own profile (${email})`,
        performedById: actor.id,
      });
    });
  } catch (error) {
    if (isUniqueConstraintError(error))
      return { fieldErrors: { email: "A user with this email already exists." } };
    throw error;
  }

  revalidatePath("/settings");
  return { ok: true, toast: { title: "Profile updated" } };
}
