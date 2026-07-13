/**
 * Clean-slate seed for a REAL pilot — wipes the target database and provisions
 * exactly one organization, its RBAC roles, and one platform-admin login. Loads
 * NO business data: recruiters and their jobs/candidates/submissions all come
 * from real use (the admin creates recruiter accounts via Settings → Users).
 *
 * This is the "real org, no demo data" path that plain `seed.ts` lacks (it never
 * seeds RBAC roles, so the Add-User dropdown is empty). Run once against prod
 * before handing the app to real users.
 *
 *   set -a; . ./.env.neon-prod.bak; set +a
 *   SEED_ADMIN_EMAIL=you@company.com SEED_ADMIN_PASSWORD='a-strong-password' \
 *   SEED_ADMIN_NAME='Your Name' CONFIRM_CLEAN=yes \
 *   npx tsx prisma/seed-prod-clean.ts
 *
 * DESTRUCTIVE: it deletes every row in every table. The guards below refuse to
 * run without CONFIRM_CLEAN=yes and a real (>=10 char) admin password, and print
 * the target DB host first so you never wipe the wrong database.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { seedRbac } from "../src/server/rbac-seed";
import {
  DEFAULT_ORG_ID,
  DEFAULT_ORG_NAME,
  DEFAULT_ORG_SLUG,
} from "../src/lib/default-org";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL / DATABASE_URL is not set. Source the target env first.");
}

// ── Guardrails (this wipes everything) ────────────────────────────────────────
const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "";
const adminName = process.env.SEED_ADMIN_NAME ?? "LuminTrack Admin";

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (process.env.CONFIRM_CLEAN !== "yes")
  fail("Refusing to run without CONFIRM_CLEAN=yes (this DELETES ALL DATA).");
if (!adminEmail || !adminEmail.includes("@"))
  fail("Set SEED_ADMIN_EMAIL to the real admin login email.");
if (adminPassword.length < 10)
  fail("Set SEED_ADMIN_PASSWORD to a real password (>= 10 chars). No weak default for prod.");

// Show which database is about to be wiped — the last defence against pointing
// this at the wrong env. Host only; never print credentials.
const dbHost = (() => {
  try {
    return new URL(connectionString).host;
  } catch {
    return "(unparseable)";
  }
})();

const baseDb = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  console.log(`\nTarget DB host: ${dbHost}`);
  console.log(`Admin login:    ${adminEmail}`);
  console.log("Wiping ALL data and provisioning a clean org…\n");

  // FK-safe wipe order (children before parents) — identical to seed-demo.ts.
  await baseDb.activity.deleteMany();
  await baseDb.note.deleteMany();
  await baseDb.vendorRequirement.deleteMany();
  await baseDb.placementExtension.deleteMany();
  await baseDb.placement.deleteMany();
  await baseDb.interviewRound.deleteMany();
  await baseDb.supportProvider.deleteMany();
  await baseDb.benchConsultant.deleteMany();
  await baseDb.submission.deleteMany();
  await baseDb.candidateDocument.deleteMany();
  await baseDb.candidateResume.deleteMany();
  await baseDb.jobAssignment.deleteMany();
  await baseDb.job.deleteMany();
  await baseDb.candidate.deleteMany();
  await baseDb.contact.deleteMany();
  await baseDb.vendor.deleteMany();
  await baseDb.client.deleteMany();
  await baseDb.sisterCompanySource.deleteMany();
  await baseDb.referrer.deleteMany();
  await baseDb.lookupOption.deleteMany();
  await baseDb.customGlossaryTerm.deleteMany();
  await baseDb.glossaryNote.deleteMany();
  await baseDb.team.deleteMany();
  await baseDb.rolePermission.deleteMany();
  await baseDb.role.deleteMany();
  await baseDb.permission.deleteMany();
  await baseDb.user.deleteMany();
  await baseDb.organization.deleteMany();

  // One organization (the tenant boundary).
  await baseDb.organization.create({
    data: { id: DEFAULT_ORG_ID, name: DEFAULT_ORG_NAME, slug: DEFAULT_ORG_SLUG },
  });

  // One platform-admin. role MANAGER so seedRbac maps it to the Manager role.
  await baseDb.user.create({
    data: {
      organizationId: DEFAULT_ORG_ID,
      email: adminEmail,
      fullName: adminName,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "MANAGER",
      isPlatformAdmin: true,
    },
  });

  // RBAC catalog + system roles (Manager / Team Lead / Recruiter) + backfill the
  // admin's roleId from its enum role. This is what makes the Add-User form's
  // role dropdown non-empty so real recruiters can be created through the UI.
  await seedRbac(baseDb, DEFAULT_ORG_ID);

  console.log("✓ Clean provisioning complete.");
  console.log(`  Organization: ${DEFAULT_ORG_NAME} (${DEFAULT_ORG_ID})`);
  console.log(`  Admin login:  ${adminEmail} / (SEED_ADMIN_PASSWORD)`);
  console.log("  Next: log in and create recruiters via Settings → Users.\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => baseDb.$disconnect());
