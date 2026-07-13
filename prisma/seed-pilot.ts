/**
 * Pilot seed — wipes the target database and provisions ONE real org with its
 * real people: super-admins, one team lead, and their recruiters. Loads NO
 * business data (jobs/candidates/submissions come from real use). This is the
 * clean-slate handover seed for the LuminTrack pilot.
 *
 * Roster comes from `prisma/pilot-users.local.json` (gitignored — real emails
 * are PII). Each person gets a unique strong temp password; the script prints an
 * email→password table ONCE at the end. The owner distributes them out-of-band;
 * users change theirs via admin reset (Settings → Users).
 *
 *   set -a; . ./.env.neon-prod.bak; set +a           # (or dev .env for a rehearsal)
 *   CONFIRM_CLEAN=yes npx tsx prisma/seed-pilot.ts
 *
 * DESTRUCTIVE: deletes every row in every table. Guards refuse to run without
 * CONFIRM_CLEAN=yes and print the target DB host first.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import bcrypt from "bcryptjs";
import { seedRbac } from "../src/server/rbac-seed";
import { DEFAULT_ORG_ID } from "../src/lib/default-org";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// ── Roster ────────────────────────────────────────────────────────────────────
type Role = "MANAGER" | "TEAM_LEAD" | "RECRUITER";
type Roster = {
  org: { id: string; name: string; slug: string };
  team: { key: string; name: string; leadEmail: string };
  superAdmins: { fullName: string; email: string }[];
  users: {
    fullName: string;
    email: string;
    role: Role;
    teamKey: string;
    leadsTeam?: string;
  }[];
  passwords?: { credentials?: Record<string, string> };
};

const rosterPath = path.join(__dirname, "pilot-users.local.json");
let roster: Roster;
try {
  roster = JSON.parse(readFileSync(rosterPath, "utf8"));
} catch {
  fail(`Could not read the roster at ${rosterPath}. It is gitignored — create it first.`);
}

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL / DATABASE_URL is not set. Source the target env first.");
}

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (process.env.CONFIRM_CLEAN !== "yes")
  fail("Refusing to run without CONFIRM_CLEAN=yes (this DELETES ALL DATA).");

const dbHost = (() => {
  try {
    return new URL(connectionString).host;
  } catch {
    return "(unparseable)";
  }
})();

// Temp password: the locked value from the roster (so dev and prod mint the SAME
// credentials the owner forwards once), else a generated `Lumin@NNNN` — 10 chars
// with all 4 character classes, so it passes the strength policy. Admin resets it
// after first login. `used` guards generated collisions across the ~9 people.
const locked = roster.passwords?.credentials ?? {};
const used = new Set<string>(Object.values(locked));
function tempPassword(email: string): string {
  const fixed = locked[email];
  if (fixed) return fixed;
  for (;;) {
    const n = (randomBytes(2).readUInt16BE(0) % 10000).toString().padStart(4, "0");
    const pw = `Lumin@${n}`;
    if (!used.has(pw)) {
      used.add(pw);
      return pw;
    }
  }
}

const baseDb = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  console.log(`\nTarget DB host: ${dbHost}`);
  console.log(`Org:            ${roster.org.name} (${roster.org.slug})`);
  console.log(
    `People:         ${roster.superAdmins.length} super-admin(s) + ${roster.users.length} team member(s)`,
  );
  console.log("Wiping ALL data and provisioning the pilot org…\n");

  // FK-safe wipe order (children before parents) — identical to seed-prod-clean.ts.
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

  // One organization. Keep DEFAULT_ORG_ID (the migration/backfill sentinel) but
  // use the roster's real name + slug. Nothing at runtime keys off the name/slug
  // constants — only the id (organizations.ts) — so overriding these is safe.
  await baseDb.organization.create({
    data: { id: DEFAULT_ORG_ID, name: roster.org.name, slug: roster.org.slug },
  });

  // Collect the temp passwords to print once at the end.
  const creds: { name: string; email: string; role: string; password: string }[] = [];

  async function createUser(opts: {
    fullName: string;
    email: string;
    role: Role;
    isPlatformAdmin?: boolean;
    teamId?: string | null;
    reportsToId?: string | null;
  }): Promise<{ id: string; email: string }> {
    const email = opts.email.trim().toLowerCase();
    const password = tempPassword(email);
    const user = await baseDb.user.create({
      data: {
        organizationId: DEFAULT_ORG_ID,
        email,
        fullName: opts.fullName,
        passwordHash: await bcrypt.hash(password, 10),
        role: opts.role,
        isPlatformAdmin: opts.isPlatformAdmin ?? false,
        teamId: opts.teamId ?? null,
        reportsToId: opts.reportsToId ?? null,
      },
      select: { id: true, email: true },
    });
    creds.push({
      name: opts.fullName,
      email,
      role: opts.isPlatformAdmin ? `${opts.role} · super-admin` : opts.role,
      password,
    });
    return user;
  }

  // 1. Super-admins (managers, above teams → no teamId, report to no one).
  for (const sa of roster.superAdmins) {
    await createUser({
      fullName: sa.fullName,
      email: sa.email,
      role: "MANAGER",
      isPlatformAdmin: true,
    });
  }
  // A manager to anchor the reporting chain (the first super-admin).
  const anchorManager = await baseDb.user.findFirst({
    where: { organizationId: DEFAULT_ORG_ID, isPlatformAdmin: true },
    orderBy: { seq: "asc" },
    select: { id: true },
  });

  // 2. The team lead first (recruiters report to them; the team's leadId points here).
  const leadRow = roster.users.find((u) => u.role === "TEAM_LEAD");
  if (!leadRow) fail("Roster has no TEAM_LEAD — the pilot needs one team lead.");
  const lead = await createUser({
    fullName: leadRow.fullName,
    email: leadRow.email,
    role: "TEAM_LEAD",
    reportsToId: anchorManager?.id ?? null,
  });

  // 3. The team (lead set now; members' teamId set as we create them).
  const team = await baseDb.team.create({
    data: { organizationId: DEFAULT_ORG_ID, name: roster.team.name, leadId: lead.id },
    select: { id: true },
  });
  // The lead is also a member of their own team (so team-scoped queries include
  // the lead's own work).
  await baseDb.user.update({ where: { id: lead.id }, data: { teamId: team.id } });

  // 4. Recruiters — members of the team, reporting to the lead.
  for (const u of roster.users) {
    if (u.role !== "RECRUITER") continue;
    await createUser({
      fullName: u.fullName,
      email: u.email,
      role: "RECRUITER",
      teamId: team.id,
      reportsToId: lead.id,
    });
  }

  // 5. RBAC catalog + system roles + backfill each user's roleId from its enum
  //    role. Recruiters get RECRUITER_GRANTS (which now includes sensitive-doc
  //    view/manage), so no separate backfill is needed for the pilot.
  await seedRbac(baseDb, DEFAULT_ORG_ID);

  // ── Report ────────────────────────────────────────────────────────────────
  console.log("✓ Pilot provisioning complete.\n");
  console.log(`  Organization: ${roster.org.name} (${DEFAULT_ORG_ID})`);
  console.log(`  Team:         ${roster.team.name} — led by ${lead.email}\n`);
  console.log("  TEMP LOGINS (distribute out-of-band; users reset via admin):\n");
  const pad = Math.max(...creds.map((c) => c.email.length));
  for (const c of creds) {
    console.log(`    ${c.email.padEnd(pad)}   ${c.password}   [${c.role}]  ${c.name}`);
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => baseDb.$disconnect());
