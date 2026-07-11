import type { PrismaClient } from "@/generated/prisma/client";
import {
  PERMISSION_CATALOG,
  SYSTEM_ROLES,
  SYSTEM_ROLE_GRANTS,
} from "@/lib/permission-catalog";

/**
 * Seed the RBAC catalog + the three system roles and backfill `User.roleId`.
 * Idempotent and safe to re-run (dev seed, prod first-run, or after adding a
 * catalog key): permissions are upserted; a system role's grants are only
 * written when the role is first created, so later admin edits aren't clobbered;
 * users are backfilled only where `roleId` is still null.
 */
export async function seedRbac(db: PrismaClient): Promise<void> {
  // 1. Catalog — upsert every permission (label/category are code-owned).
  for (const p of PERMISSION_CATALOG) {
    await db.permission.upsert({
      where: { key: p.key },
      create: { key: p.key, label: p.label, category: p.category },
      update: { label: p.label, category: p.category },
    });
  }

  // 2. System roles — create with default grants if missing; never overwrite an
  //    existing role's permissions (admins may have edited them).
  for (const r of SYSTEM_ROLES) {
    const existing = await db.role.findUnique({
      where: { systemRole: r.role },
      select: { id: true },
    });
    if (existing) continue;
    await db.role.create({
      data: {
        name: r.name,
        label: r.label,
        description: r.description,
        isSystem: true,
        systemRole: r.role,
        permissions: {
          create: SYSTEM_ROLE_GRANTS[r.role].map((permissionKey) => ({
            permissionKey,
          })),
        },
      },
    });
  }

  // 3. Backfill: point each user at the system role matching its enum role,
  //    but only where no role has been assigned yet.
  for (const r of SYSTEM_ROLES) {
    const role = await db.role.findUnique({
      where: { systemRole: r.role },
      select: { id: true },
    });
    if (!role) continue;
    await db.user.updateMany({
      where: { role: r.role, roleId: null },
      data: { roleId: role.id },
    });
  }
}
