/**
 * Disaster-recovery restore from a JSON dump produced by
 * `src/server/exporters/build-backup-json.ts`.
 *
 *   npx tsx prisma/restore-from-backup.ts <backup.json>            # dry run
 *   npx tsx prisma/restore-from-backup.ts <backup.json> --confirm  # wipe + restore
 *
 * Caveats — read these before running:
 *
 * 1. **Destructive.** `--confirm` wipes every table in this database before
 *    inserting the backup rows. Run against the right DATABASE_URL or you
 *    will eat your prod data.
 * 2. **User passwords are not in the backup.** Every restored user gets a
 *    placeholder hash and `isActive: false`; an admin must trigger a password
 *    reset (or re-seed) before they can log in.
 * 3. **Insert order matters.** Tables are restored in a FK-safe order — do
 *    not edit this list without checking the schema.
 * 4. **Idempotency.** Re-running the restore on an already-restored DB will
 *    require `--confirm` again (the wipe step). Without `--confirm` the
 *    script prints the row counts it would insert and exits.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Fill in .env before running.");
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});

// Placeholder bcrypt hash for "restore-pending" — invalid by design so a
// reset is required before login. Admins should run `npm run db:seed` or
// trigger per-user resets after restore.
const PLACEHOLDER_PASSWORD_HASH = "$2a$10$restore.pending.no.password.set.yet.placeholder.hash";

// FK-safe insert order. Each entry is `[modelName, jsonTableKey]`.
const INSERT_ORDER: ReadonlyArray<[string, string]> = [
  ["user", "user"],
  ["sisterCompanySource", "sisterCompanySource"],
  ["jobPortal", "jobPortal"],
  ["client", "client"],
  ["vendor", "vendor"],
  ["contact", "contact"],
  ["job", "job"],
  ["jobAssignment", "jobAssignment"],
  ["candidate", "candidate"],
  ["candidateResume", "candidateResume"],
  ["candidateDocument", "candidateDocument"],
  ["submission", "submission"],
  ["placement", "placement"],
  ["placementExtension", "placementExtension"],
  ["interviewRound", "interviewRound"],
  // BenchConsultant needs user + candidate; VendorRequirement needs job +
  // candidate + submission. Note references benchConsultant, Activity
  // references both — so these sit after their parents, before note/activity.
  ["benchConsultant", "benchConsultant"],
  ["vendorRequirement", "vendorRequirement"],
  ["note", "note"],
  ["activity", "activity"],
];

// Wipe order is the reverse — children before parents so FK cascades don't fight us.
const WIPE_ORDER = [...INSERT_ORDER].reverse();

async function main() {
  const [, , inputPath, confirmFlag] = process.argv;
  if (!inputPath) {
    console.error("Usage: npx tsx prisma/restore-from-backup.ts <backup.json> [--confirm]");
    process.exit(1);
  }
  const confirmed = confirmFlag === "--confirm";

  const raw = readFileSync(inputPath, "utf-8");
  const backup = JSON.parse(raw) as {
    exportedAt: string;
    version: number;
    tables: Record<string, unknown[]>;
  };
  if (backup.version !== 1) {
    throw new Error(`Unsupported backup version: ${backup.version}`);
  }

  console.log(`Backup exported at: ${backup.exportedAt}`);
  console.log(`Database URL host : ${new URL(connectionString!).host}`);
  console.log("");
  console.log("Rows to restore:");
  for (const [, key] of INSERT_ORDER) {
    const rows = backup.tables[key] ?? [];
    console.log(`  ${key.padEnd(22)} ${rows.length}`);
  }

  if (!confirmed) {
    console.log("");
    console.log("Dry run — pass --confirm to actually wipe + restore.");
    return;
  }

  console.log("");
  console.log("Wiping existing data...");
  for (const [model] of WIPE_ORDER) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any)[model].deleteMany({});
  }

  console.log("Inserting backup rows...");
  for (const [model, key] of INSERT_ORDER) {
    const rows = (backup.tables[key] ?? []) as Record<string, unknown>[];
    if (rows.length === 0) continue;

    // Users: backfill the missing password hash so login is blocked until reset.
    const prepared =
      model === "user"
        ? rows.map((r) => ({
            ...r,
            passwordHash: PLACEHOLDER_PASSWORD_HASH,
            isActive: false,
          }))
        : rows;

    // createMany skips uniqueness conflicts cleanly and is far faster than per-row
    // inserts. We chunk to keep payloads under driver limits on large tables.
    const CHUNK = 500;
    for (let i = 0; i < prepared.length; i += CHUNK) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any)[model].createMany({
        data: prepared.slice(i, i + CHUNK),
        skipDuplicates: true,
      });
    }
    console.log(`  ${key.padEnd(22)} ${prepared.length} inserted`);
  }

  console.log("");
  console.log("Restore complete.");
  console.log("Note: every user has a placeholder password hash and isActive=false.");
  console.log("Trigger password resets (or re-run npm run db:seed for the admin) before going live.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
