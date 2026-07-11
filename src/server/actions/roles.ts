"use server";

import { revalidatePath } from "next/cache";
import { prisma, isUniqueConstraintError } from "@/server/db";
import { requireUser } from "@/lib/session";
import { canManageRoles } from "@/lib/permissions";
import { logActivity } from "@/server/activity";
import { roleSchema } from "@/lib/validation/role";
import { toFieldErrors } from "@/lib/validation/common";
import type { FormState } from "@/lib/form-state";

const MANAGE_KEY = "role:manage";

/**
 * Create or edit a role. System roles keep their name (rename/delete blocked)
 * but their permissions stay editable. Guards against a lock-out: a save that
 * would leave no active user able to manage roles is rejected.
 */
export async function saveRole(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageRoles(actor))
    return { error: "You don't have permission to manage roles." };

  const id = String(formData.get("id") ?? "").trim();
  const parsed = roleSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    permissions: formData.getAll("permissions").map(String),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  const existing = id
    ? await prisma.role.findUnique({
        where: { id },
        select: {
          isSystem: true,
          name: true,
          permissions: { select: { permissionKey: true } },
        },
      })
    : null;
  if (id && !existing) return { error: "That role no longer exists." };

  // System roles can't be renamed; keep their existing name regardless of input.
  const name = existing?.isSystem ? existing.name : parsed.data.name;
  const nextPerms = parsed.data.permissions;

  // Lock-out guard: if this edit removes role-management, make sure someone else
  // still has it (via their assigned role). Only relevant when editing a role
  // that currently grants it and no longer will.
  const hadManage = existing?.permissions.some((p) => p.permissionKey === MANAGE_KEY);
  const keepsManage = nextPerms.includes(MANAGE_KEY);
  if (id && hadManage && !keepsManage) {
    const otherManagerRoleIds = (
      await prisma.role.findMany({
        where: { id: { not: id }, permissions: { some: { permissionKey: MANAGE_KEY } } },
        select: { id: true },
      })
    ).map((r) => r.id);
    const stillCovered = await prisma.user.count({
      where: { isActive: true, roleId: { in: otherManagerRoleIds } },
    });
    if (stillCovered === 0)
      return {
        error:
          "At least one role must keep “Manage roles & permissions” — otherwise no one could edit roles.",
      };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const role = id
        ? await tx.role.update({
            where: { id },
            data: { name, label: name, description: parsed.data.description ?? null },
          })
        : await tx.role.create({
            data: {
              name,
              label: name,
              description: parsed.data.description ?? null,
              isSystem: false,
            },
          });
      // Replace the permission set wholesale.
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (nextPerms.length)
        await tx.rolePermission.createMany({
          data: nextPerms.map((permissionKey) => ({ roleId: role.id, permissionKey })),
        });
      await logActivity(tx, {
        entityType: "USER",
        action: id ? "USER_UPDATED" : "USER_CREATED",
        description: `${id ? "Updated" : "Created"} role ${name} · ${nextPerms.length} permission${nextPerms.length === 1 ? "" : "s"}`,
        performedById: actor.id,
      });
    });
  } catch (error) {
    if (isUniqueConstraintError(error))
      return { fieldErrors: { name: "A role with this name already exists." } };
    throw error;
  }

  revalidatePath("/settings");
  return { ok: true };
}

/** Delete a custom role. System roles and roles with users assigned are blocked. */
export async function deleteRole(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireUser();
  if (!canManageRoles(actor))
    return { error: "You don't have permission to manage roles." };

  const id = String(formData.get("id") ?? "").trim();
  const role = await prisma.role.findUnique({
    where: { id },
    select: { name: true, isSystem: true, _count: { select: { users: true } } },
  });
  if (!role) return { error: "That role no longer exists." };
  if (role.isSystem) return { error: "System roles can't be deleted." };
  if (role._count.users > 0)
    return {
      error: `Reassign the ${role._count.users} user${role._count.users === 1 ? "" : "s"} on this role before deleting it.`,
    };

  await prisma.$transaction(async (tx) => {
    await tx.role.delete({ where: { id } });
    await logActivity(tx, {
      entityType: "USER",
      action: "USER_UPDATED",
      description: `Deleted role ${role.name}`,
      performedById: actor.id,
    });
  });

  revalidatePath("/settings");
  return { ok: true };
}
