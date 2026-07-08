import { gzipSync } from "node:zlib";
import { put, list, del } from "@vercel/blob";
import { buildBackupJson } from "@/server/exporters/build-backup-json";
import {
  backupKeys,
  keysToPrune,
  KEEP_DAILY,
  KEEP_MONTHLY,
} from "@/lib/backup-schedule";

export { backupKeys, keysToPrune, KEEP_DAILY, KEEP_MONTHLY };

/**
 * Scheduled database backup engine.
 *
 * A backup is the same restore-grade JSON dump the manual export produces
 * (`buildBackupJson`), gzipped and written to a storage "sink" under stable,
 * date-based keys:
 *
 *   backups/daily/YYYY-MM-DD.json.gz     (kept: last KEEP_DAILY)
 *   backups/monthly/YYYY-MM.json.gz      (kept: last KEEP_MONTHLY; written on the 1st)
 *
 * Restore with `prisma/restore-from-backup.ts` (it transparently gunzips a
 * `.json.gz`). The engine is storage-agnostic: it targets a {@link BackupSink},
 * so swapping Vercel Blob for Google Drive later is a sink change, not a rewrite.
 */

/** A place backups are written to and pruned from. */
export interface BackupSink {
  /** Human name for the summary/logs. */
  readonly name: string;
  /** Write bytes at `key`, overwriting any existing object at that key. */
  put(key: string, bytes: Buffer): Promise<void>;
  /** List objects under `prefix`, newest-first is NOT required. */
  list(prefix: string): Promise<{ key: string; ref: string }[]>;
  /** Delete the object identified by `ref` (an opaque handle from `list`). */
  delete(ref: string): Promise<void>;
}

// ── Vercel Blob sink (the default; Drive-ready alternative slots in here) ────

const blobSink: BackupSink = {
  name: "vercel-blob",
  async put(key, bytes) {
    await put(key, bytes, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/gzip",
    });
  },
  async list(prefix) {
    const { blobs } = await list({ prefix });
    return blobs.map((b) => ({ key: b.pathname, ref: b.url }));
  },
  async delete(ref) {
    await del(ref);
  },
};

/**
 * Select the backup destination. Today it's always Vercel Blob; when Google
 * Drive service-account creds are configured (GOOGLE_DRIVE_* env), a Drive sink
 * would be returned here instead — the rest of the engine is unchanged.
 */
export function getBackupSink(): BackupSink {
  // if (process.env.GOOGLE_DRIVE_SA_KEY && process.env.GOOGLE_DRIVE_FOLDER_ID)
  //   return driveSink;  // TODO: implement when creds are provisioned
  return blobSink;
}

export type BackupSummary = {
  sink: string;
  dailyKey: string;
  monthlyKey: string | null;
  sizeBytes: number;
  prunedDaily: string[];
  prunedMonthly: string[];
};

/**
 * Build a snapshot, write it under today's daily key (and the monthly key on the
 * 1st), then prune old snapshots past the retention window. `now` is injectable
 * for tests; defaults to the wall clock.
 */
export async function runScheduledBackup(
  now: Date = new Date(),
  sink: BackupSink = getBackupSink(),
): Promise<BackupSummary> {
  const backup = await buildBackupJson();
  const gz = gzipSync(Buffer.from(JSON.stringify(backup)));

  const { dailyKey, monthlyKey } = backupKeys(now);
  await sink.put(dailyKey, gz);
  if (monthlyKey) await sink.put(monthlyKey, gz);

  const prunedDaily = await prune(sink, "backups/daily/", KEEP_DAILY);
  const prunedMonthly = await prune(sink, "backups/monthly/", KEEP_MONTHLY);

  return {
    sink: sink.name,
    dailyKey,
    monthlyKey,
    sizeBytes: gz.length,
    prunedDaily,
    prunedMonthly,
  };
}

async function prune(sink: BackupSink, prefix: string, keep: number): Promise<string[]> {
  const existing = await sink.list(prefix);
  const doomed = keysToPrune(
    existing.map((e) => e.key),
    keep,
  );
  const doomedSet = new Set(doomed);
  await Promise.all(
    existing.filter((e) => doomedSet.has(e.key)).map((e) => sink.delete(e.ref)),
  );
  return doomed;
}
