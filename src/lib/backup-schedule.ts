/**
 * Pure scheduling/retention helpers for the backup engine (see
 * `src/server/backup.ts`). Kept free of DB/Blob imports so they're unit-testable
 * in the no-database suite.
 *
 * Keys embed a sortable date so a lexical sort is chronological:
 *   backups/daily/YYYY-MM-DD.json.gz
 *   backups/monthly/YYYY-MM.json.gz
 */

export const KEEP_DAILY = 30;
export const KEEP_MONTHLY = 12;

/** The daily key, and — on the first of the month (UTC) — the monthly key too. */
export function backupKeys(now: Date): { dailyKey: string; monthlyKey: string | null } {
  const iso = now.toISOString();
  const day = iso.slice(0, 10); // YYYY-MM-DD
  const month = iso.slice(0, 7); // YYYY-MM
  return {
    dailyKey: `backups/daily/${day}.json.gz`,
    monthlyKey: now.getUTCDate() === 1 ? `backups/monthly/${month}.json.gz` : null,
  };
}

/**
 * Given all keys under a prefix, return the ones to delete to keep only the
 * newest `keep`. Lexical sort = chronological thanks to the date-in-key format.
 */
export function keysToPrune(keys: string[], keep: number): string[] {
  const sorted = [...keys].sort(); // ascending → oldest first
  return sorted.slice(0, Math.max(0, sorted.length - keep));
}
