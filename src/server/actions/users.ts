"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { isUniqueConstraintError } from "@/server/db";
import { getScopedPrisma, requireUser } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  canManageUsers,
  hasFullAccess,
  canGrantManagerRole,
} from "@/lib/permissions";
import { logActivity } from "@/server/activity";
import {
  userCreateSchema,
  userUpdateSchema,
  changePasswordSchema,
  profileSchema,
} from "@/lib/validation/user";
import { toFieldErrors } from "@/lib/validation/common";
import { deriveEnumTier } from "@/lib/permission-catalog";
import { reportsToCreatesCycle } from "@/server/queries/org-chart";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import type { FormState } from "@/lib/form-state";

export async function saveUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const db = await getScopedPrisma();
  const actor = await requireUser();
  if (!canManageUsers(actor))
    return { error: "Only managers and team leads can manage users." };

  const id = String(formData.get("id") ?? "").trim();
  const raw = {
    fullName: formData.get("fullName") ?? "",
    email: formData.get("email") ?? "",
    roleId: formData.get("roleId") ?? "",
    isActive: formData.get("isActive") != null,
    showInOrgChart: formData.get("showInOrgChart") != null,
    password: formData.get("password") ?? "",
    teamId: formData.get("teamId") ?? "",
    reportsToId: formData.get("reportsToId") ?? "",
  };
  const parsed = id
    ? userUpdateSchema.safeParse(raw)
    : userCreateSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  // Resolve the picked role → its permission keys → the legacy enum tier it maps
  // to (kept in sync for data-classification: PERFORMANCE_ROLES, badge tints…).
  const chosenRole = await db.role.findUnique({
    where: { id: parsed.data.roleId },
    select: { name: true, permissions: { select: { permissionKey: true } } },
  });
  if (!chosenRole) return { fieldErrors: { roleId: "Pick a valid role." } };
  const rolePerms = chosenRole.permissions.map((p) => p.permissionKey);
  const derivedRole = deriveEnumTier(rolePerms);

  // Governance: only someone with grant-manager rights may assign a manager-tier
  // role or edit an existing manager-tier user. Team leads can manage the rest
  // but can't escalate anyone — including themselves — into the manager tier.
  const actorCanGrantManager = canGrantManagerRole(actor);
  if (!actorCanGrantManager) {
    if (derivedRole === "MANAGER")
      return { error: "Only managers can assign a manager-tier role." };
    if (id) {
      const target = await db.user.findUnique({
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
    if (!hasFullAccess({ permissions: rolePerms }))
      return {
        error: "You cannot remove your own manager/team-lead role.",
      };
  }

  // Org placement. A user can't report to themselves. Convenience: if no
  // explicit "reports to" was picked but a team was, default the reporting line
  // to that team's lead so the org chart stays connected without double entry.
  const teamId = parsed.data.teamId ?? null;
  let reportsToId = parsed.data.reportsToId ?? null;
  if (id && reportsToId === id)
    return { error: "A user cannot report to themselves." };
  // Reject a reporting line that would create a cycle (report to your own
  // descendant) — that's what left prod with no apex and a flat chart.
  if (id && reportsToId) {
    const chain = await db.user.findMany({
      select: { id: true, reportsToId: true },
    });
    if (reportsToCreatesCycle(chain, id, reportsToId))
      return {
        error:
          "That reporting line creates a loop — the selected manager already reports (directly or indirectly) to this user.",
      };
  }
  if (!reportsToId && teamId) {
    const team = await db.team.findUnique({
      where: { id: teamId },
      select: { leadId: true },
    });
    // Don't point a team lead at themselves when they lead their own team.
    if (team?.leadId && team.leadId !== id) reportsToId = team.leadId;
  }

  const fields = {
    fullName: parsed.data.fullName,
    email: parsed.data.email.toLowerCase(),
    // `roleId` is the assignment; `role` is the enum tier it derives to.
    roleId: parsed.data.roleId,
    role: derivedRole,
    isActive: parsed.data.isActive,
    showInOrgChart: parsed.data.showInOrgChart,
    teamId,
    reportsToId,
  };

  // Hash outside the transaction — bcrypt is CPU-bound and shouldn't hold the tx
  // open. `password` is required by userCreateSchema, so on create newHash is
  // always set.
  const passwordChanged = Boolean(parsed.data.password);
  const newHash = passwordChanged
    ? await hashPassword(parsed.data.password as string)
    : null;

  try {
    await db.$transaction(async (tx) => {
      if (id) {
        await tx.user.update({
          where: { id },
          data: newHash ? { ...fields, passwordHash: newHash } : fields,
        });
        await logActivity(tx, {
          entityType: "USER",
          action: "USER_UPDATED",
          description: `Updated user ${fields.email} · ${chosenRole.name}${
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
          description: `Created user ${fields.email} · ${chosenRole.name}`,
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

export type QuickAddUserResult =
  | { ok: true; id: string; fullName: string }
  | { ok: false; error: string };

/**
 * Quick-add a user inline from a form's people-picker (e.g. the VPR form's
 * vendor-recruiter / team-lead dropdowns), mirroring the org-entity quick-adds.
 * Managers/team-leads only (`canManageUsers`); a manager-tier role additionally
 * needs grant-manager rights. The new account gets a random **temporary
 * password** — set the real one in Settings before they sign in. Distinct from
 * the full `saveUser` (no org placement / password entry here).
 */
export async function quickAddUser(fd: FormData): Promise<QuickAddUserResult> {
  const actor = await requireUser();
  if (!canManageUsers(actor))
    return { ok: false, error: "You don't have permission to add users." };

  const fullName = String(fd.get("fullName") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const roleId = String(fd.get("roleId") ?? "").trim();
  if (!fullName) return { ok: false, error: "Enter a name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { ok: false, error: "Enter a valid email." };
  if (!roleId) return { ok: false, error: "Pick a role." };

  const db = await getScopedPrisma();
  const role = await db.role.findUnique({
    where: { id: roleId },
    select: { name: true, permissions: { select: { permissionKey: true } } },
  });
  if (!role) return { ok: false, error: "Pick a valid role." };
  const derivedRole = deriveEnumTier(role.permissions.map((p) => p.permissionKey));
  if (derivedRole === "MANAGER" && !canGrantManagerRole(actor))
    return { ok: false, error: "Only managers can add a manager-tier user." };

  // Random temp password — the account can't be signed into until a manager
  // sets a real one in Settings. bcrypt hashing reused from saveUser.
  const passwordHash = await hashPassword(randomBytes(9).toString("base64url"));

  try {
    const created = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          fullName,
          email,
          roleId,
          role: derivedRole,
          isActive: true,
          showInOrgChart: true,
          passwordHash,
        },
        select: { id: true, fullName: true },
      });
      await logActivity(tx, {
        entityType: "USER",
        action: "USER_CREATED",
        description: `Quick-added user ${email} · ${role.name} (temporary password — set in Settings)`,
        performedById: actor.id,
      });
      return u;
    });
    revalidatePath("/settings");
    return { ok: true, ...created };
  } catch (error) {
    if (isUniqueConstraintError(error))
      return { ok: false, error: "A user with this email already exists." };
    throw error;
  }
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
  const db = await getScopedPrisma();
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
  await db.$transaction(async (tx) => {
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
  const db = await getScopedPrisma();
  const actor = await requireUser();
  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName") ?? "",
    email: formData.get("email") ?? "",
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  const email = parsed.data.email.toLowerCase();
  try {
    await db.$transaction(async (tx) => {
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

/** Wave 7 — the acting user toggles their own email preferences. Unchecked
 *  checkboxes are simply absent from the form data, so `=== "on"` reads them. */
export async function updateOwnNotifications(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const db = await getScopedPrisma();
  const actor = await requireUser();
  const notifyDigest = formData.get("notifyDigest") === "on";
  const notifyEvents = formData.get("notifyEvents") === "on";
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.id },
      data: { notifyDigest, notifyEvents },
    });
    await logActivity(tx, {
      entityType: "USER",
      action: "USER_UPDATED",
      description: `Updated email preferences (digest: ${notifyDigest ? "on" : "off"}, events: ${notifyEvents ? "on" : "off"})`,
      performedById: actor.id,
    });
  });
  revalidatePath("/settings");
  return { ok: true, toast: { title: "Preferences saved" } };
}
