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
 * 3. **Only v3+ backups restore.** v1/v2 dumps predate the multi-tenancy schema
 *    and lack the organization/team/role rows now required by FKs — they cannot
 *    be restored (they were unrestorable when written).
 * 4. **Idempotency.** Re-running the restore on an already-restored DB will
 *    require `--confirm` again (the wipe step).
 *
 * The FK-safe insert order + circular-FK handling live in
 * `src/server/exporters/restore-backup.ts` (shared with the round-trip test).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  restoreBackup,
  INSERT_ORDER,
  type BackupData,
} from "../src/server/exporters/restore-backup";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Fill in .env before running.");
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});

async function main() {
  const [, , inputPath, confirmFlag] = process.argv;
  if (!inputPath) {
    console.error("Usage: npx tsx prisma/restore-from-backup.ts <backup.json> [--confirm]");
    process.exit(1);
  }
  const confirmed = confirmFlag === "--confirm";

  // Scheduled backups are stored gzipped (`*.json.gz`); a manual export is plain
  // JSON. Detect the gzip magic bytes (0x1f 0x8b) and inflate transparently.
  const bytes = readFileSync(inputPath);
  const isGzip = bytes.length > 1 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const raw = (isGzip ? gunzipSync(bytes) : bytes).toString("utf-8");
  const backup = JSON.parse(raw) as { exportedAt: string } & BackupData;

  console.log(`Backup exported at: ${backup.exportedAt}`);
  console.log(`Backup version    : ${backup.version}`);
  console.log(`Database URL host : ${new URL(connectionString!).host}`);
  console.log("");
  console.log("Rows to restore:");
  for (const [, key] of INSERT_ORDER) {
    const rows = backup.tables[key] ?? [];
    console.log(`  ${key.padEnd(22)} ${rows.length}`);
  }

  if (backup.version < 3) {
    console.log("");
    console.error(
      "This backup is v" +
        backup.version +
        " — pre-multi-tenancy and not restorable (no organization/team/role rows).",
    );
    process.exit(1);
  }

  if (!confirmed) {
    console.log("");
    console.log("Dry run — pass --confirm to actually wipe + restore.");
    return;
  }

  console.log("");
  console.log("Wiping existing data + inserting backup rows...");
  await restoreBackup(prisma, backup);

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
