import { prisma } from "@/server/db";

export type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionKeys: string[];
  userCount: number;
};

/** All roles for the Settings → Roles tab: system roles first, then custom. */
export async function listRoles(): Promise<RoleRow[]> {
  const roles = await prisma.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      isSystem: true,
      permissions: { select: { permissionKey: true } },
      _count: { select: { users: true } },
    },
  });
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    permissionKeys: r.permissions.map((p) => p.permissionKey),
    userCount: r._count.users,
  }));
}

export type RoleOption = { id: string; name: string; isManagerTier: boolean };

/** Roles for the user-form "Role" picker. `isManagerTier` flags roles that grant
 *  the manager tier, so only a user with grant-manager rights can assign them. */
export async function listRoleOptions(): Promise<RoleOption[]> {
  const roles = await prisma.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      permissions: { where: { permissionKey: "tier:manager" }, select: { permissionKey: true } },
    },
  });
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    isManagerTier: r.permissions.length > 0,
  }));
}
