/**
 * Disaster-recovery restore logic, shared by the CLI script
 * (`prisma/restore-from-backup.ts`) and the round-trip integration test.
 *
 * Pure logic operating on a passed PrismaClient — no session/adapter imports, so
 * the CLI (tsx) and the test (vitest against the test DB) can both use it.
 *
 * Handles the two structural hazards the flat v2 restore couldn't:
 *   1. Missing FK targets — organization/permission/role/rolePermission/referrer/
 *      team are inserted BEFORE the rows that reference them.
 *   2. Circular FKs — User.reportsToId → User (self) and Team.leadId → User, while
 *      User.teamId → Team. Teams insert with leadId null and users with
 *      reportsToId null (pass 1); a second pass sets them once every row exists.
 */
import type { PrismaClient } from "../../generated/prisma/client";

// Placeholder bcrypt hash for "restore-pending" — invalid by design so a reset
// is required before login. Admins trigger per-user resets after restore.
export const PLACEHOLDER_PASSWORD_HASH =
  "$2a$10$restore.pending.no.password.set.yet.placeholder.hash";

export type BackupData = {
  version: number;
  tables: Record<string, unknown[]>;
};

// FK-safe insert order. `[modelName, jsonTableKey]`. Parents before children;
// the tenancy tables (organization → permission → role → rolePermission →
// referrer → team → user) lead so every organizationId/roleId/referrerId/teamId
// FK resolves. Do not reorder without checking the schema's FK graph.
export const INSERT_ORDER: ReadonlyArray<[string, string]> = [
  ["organization", "organization"],
  ["permission", "permission"],
  ["role", "role"],
  ["rolePermission", "rolePermission"],
  ["referrer", "referrer"],
  // Team.leadId → User (nulled pass 1); Team must exist before User (User.teamId).
  ["team", "team"],
  // User.reportsToId → User self (nulled pass 1); org/role/team FKs resolve now.
  ["user", "user"],
  ["sisterCompanySource", "sisterCompanySource"],
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
  ["supportProvider", "supportProvider"],
  ["lookupOption", "lookupOption"],
  ["interviewRound", "interviewRound"],
  ["benchConsultant", "benchConsultant"],
  ["vendorRequirement", "vendorRequirement"],
  ["note", "note"],
  ["activity", "activity"],
  ["glossaryNote", "glossaryNote"],
  ["customGlossaryTerm", "customGlossaryTerm"],
];

// Wipe order is the reverse — children before parents so FK RESTRICT/Cascade
// deletes don't fight us.
const WIPE_ORDER = [...INSERT_ORDER].reverse();

const CHUNK = 500;

/** The minimal shape restoreBackup needs — every model exposes deleteMany /
 *  createMany / update. Kept structural so a test client works too. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PrismaClient | Record<string, any>;

/**
 * Wipes every table and reinserts the backup rows. DESTRUCTIVE — the caller is
 * responsible for confirming and for pointing at the right database. Users are
 * restored with a placeholder password hash + isActive:false (login blocked
 * until a reset).
 */
export async function restoreBackup(prisma: Db, backup: BackupData): Promise<void> {
  if (backup.version < 3) {
    throw new Error(
      `Backup version ${backup.version} predates the multi-tenancy fix (no ` +
        `organization/team/role rows) and cannot be restored. Only v3+ backups restore.`,
    );
  }

  // Wipe (children → parents).
  for (const [model] of WIPE_ORDER) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any)[model].deleteMany({});
  }

  // Pass 1: insert every table in FK-safe order, deferring the circular refs.
  for (const [model, key] of INSERT_ORDER) {
    const rows = (backup.tables[key] ?? []) as Record<string, unknown>[];
    if (rows.length === 0) continue;

    const prepared =
      model === "user"
        ? rows.map((r) => ({
            ...r,
            passwordHash: PLACEHOLDER_PASSWORD_HASH,
            isActive: false,
            reportsToId: null, // self-ref — set in pass 2
          }))
        : model === "team"
          ? rows.map((r) => ({ ...r, leadId: null })) // → User — set in pass 2
          : rows;

    for (let i = 0; i < prepared.length; i += CHUNK) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any)[model].createMany({
        data: prepared.slice(i, i + CHUNK),
        skipDuplicates: true,
      });
    }
  }

  // Pass 2: now that every user + team exists, wire up the deferred circular FKs.
  for (const u of (backup.tables.user ?? []) as Record<string, unknown>[]) {
    if (u.reportsToId) {
      await prisma.user.update({
        where: { id: u.id as string },
        data: { reportsToId: u.reportsToId as string },
      });
    }
  }
  for (const t of (backup.tables.team ?? []) as Record<string, unknown>[]) {
    if (t.leadId) {
      await prisma.team.update({
        where: { id: t.id as string },
        data: { leadId: t.leadId as string },
      });
    }
  }
}
