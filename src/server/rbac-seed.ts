import type { PrismaClient } from "@/generated/prisma/client";
import {
  PERMISSION_CATALOG,
  SYSTEM_ROLES,
  SYSTEM_ROLE_GRANTS,
} from "@/lib/permission-catalog";

/**
 * Provision the RBAC catalog + the three system roles FOR ONE ORGANIZATION and
 * backfill that org's `User.roleId`. Called with the UNSCOPED base client plus an
 * explicit `orgId` (from the migration default org, the dev seed, or the
 * create-organization action) — it stamps every role/permission with `orgId`.
 * The Permission catalog itself is global (cross-tenant) and upserted once.
 *
 * Idempotent and safe to re-run: permissions are upserted; a system role's grants
 * are only written when the role is first created for that org, so later admin
 * edits aren't clobbered; users are backfilled only where `roleId` is still null.
 */
export async function seedRbac(db: PrismaClient, orgId: string): Promise<void> {
  // 1. Catalog — global; upsert every permission (label/category are code-owned).
  for (const p of PERMISSION_CATALOG) {
    await db.permission.upsert({
      where: { key: p.key },
      create: { key: p.key, label: p.label, category: p.category },
      update: { label: p.label, category: p.category },
    });
  }

  // 2. System roles — one trio per org. Create with default grants if missing;
  //    never overwrite an existing role's permissions (admins may have edited).
  for (const r of SYSTEM_ROLES) {
    const existing = await db.role.findUnique({
      where: { organizationId_systemRole: { organizationId: orgId, systemRole: r.role } },
      select: { id: true },
    });
    if (existing) continue;
    await db.role.create({
      data: {
        organizationId: orgId,
        name: r.name,
        label: r.label,
        description: r.description,
        isSystem: true,
        systemRole: r.role,
        permissions: {
          // Nested creates aren't stamped by the scope extension (and this uses
          // the base client anyway), so set organizationId explicitly.
          create: SYSTEM_ROLE_GRANTS[r.role].map((permissionKey) => ({
            organizationId: orgId,
            permissionKey,
          })),
        },
      },
    });
  }

  // 3. Backfill: point each of this org's users at the system role matching its
  //    enum role, but only where no role has been assigned yet.
  for (const r of SYSTEM_ROLES) {
    const role = await db.role.findUnique({
      where: { organizationId_systemRole: { organizationId: orgId, systemRole: r.role } },
      select: { id: true },
    });
    if (!role) continue;
    await db.user.updateMany({
      where: { organizationId: orgId, role: r.role, roleId: null },
      data: { roleId: role.id },
    });
  }
}
