import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * One-time, idempotent data grant: give every org's Recruiter system role the
 * `requirement:manage` permission (owner decision 2026-07-13 — recruiters may
 * create/edit VendorPortalRequirements). New/reseeded orgs already get it from
 * the updated RECRUITER_GRANTS catalog; existing orgs (dev + the prod pilot)
 * were seeded before the change and need this backfill, because `can()` reads
 * the assigned role's DB permissions.
 *
 * Safe to re-run — upserts on RolePermission's (roleId, permissionKey) id.
 * Run against dev (active .env), then prod on owner go-ahead:
 *   set -a; . ./.env.neon-prod.bak; set +a; npx tsx prisma/grant-recruiter-requirement.ts
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set.");

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});

async function main() {
  const recruiterRoles = await prisma.role.findMany({
    where: { systemRole: "RECRUITER" },
    select: { id: true, organizationId: true },
  });

  let granted = 0;
  for (const role of recruiterRoles) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionKey: {
          roleId: role.id,
          permissionKey: "requirement:manage",
        },
      },
      create: {
        roleId: role.id,
        organizationId: role.organizationId,
        permissionKey: "requirement:manage",
      },
      update: {},
    });
    granted++;
  }
  console.log(
    `Ensured requirement:manage on ${granted} Recruiter role(s) across ${recruiterRoles.length} org(s).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
