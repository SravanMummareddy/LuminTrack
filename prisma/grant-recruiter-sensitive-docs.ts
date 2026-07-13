import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * One-time, idempotent data grant: give every org's Recruiter system role the
 * `document:view_sensitive` + `document:manage_sensitive` permissions (owner
 * decision 2026-07-13 — recruiters attach/see identity + work-auth docs for
 * their own candidates, which makes the work-auth-expiry submit gate usable for
 * them). New/reseeded orgs already get these from the updated RECRUITER_GRANTS
 * catalog; existing orgs (dev + the prod pilot) were seeded before the change
 * and need this backfill, because `can()` reads the assigned role's DB
 * permissions.
 *
 * The two keys move together on purpose: manage without view lets a recruiter
 * upload a doc they then can't see in the list or open via /api/documents/[id].
 *
 * Safe to re-run — upserts on RolePermission's (roleId, permissionKey) id.
 * Run against dev (active .env), then prod on owner go-ahead:
 *   set -a; . ./.env.neon-prod.bak; set +a; npx tsx prisma/grant-recruiter-sensitive-docs.ts
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set.");

const KEYS = ["document:view_sensitive", "document:manage_sensitive"] as const;

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});

async function main() {
  const recruiterRoles = await prisma.role.findMany({
    where: { systemRole: "RECRUITER" },
    select: { id: true, organizationId: true },
  });

  for (const role of recruiterRoles) {
    for (const permissionKey of KEYS) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionKey: { roleId: role.id, permissionKey } },
        create: { roleId: role.id, organizationId: role.organizationId, permissionKey },
        update: {},
      });
    }
  }
  console.log(
    `Ensured ${KEYS.join(" + ")} on ${recruiterRoles.length} Recruiter role(s).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
