import { describe, it, expect } from "vitest";
import {
  backupKeys,
  keysToPrune,
  KEEP_DAILY,
  KEEP_MONTHLY,
} from "@/lib/backup-schedule";

describe("backup keys", () => {
  it("builds a daily key from the UTC date", () => {
    const { dailyKey } = backupKeys(new Date("2026-07-08T02:00:00Z"));
    expect(dailyKey).toBe("backups/daily/2026-07-08.json.gz");
  });

  it("adds a monthly key only on the first of the month", () => {
    expect(backupKeys(new Date("2026-07-08T02:00:00Z")).monthlyKey).toBeNull();
    expect(backupKeys(new Date("2026-07-01T02:00:00Z")).monthlyKey).toBe(
      "backups/monthly/2026-07.json.gz",
    );
  });
});

describe("keysToPrune", () => {
  it("keeps the newest N and returns the rest (oldest) to delete", () => {
    const keys = [
      "backups/daily/2026-07-01.json.gz",
      "backups/daily/2026-07-03.json.gz",
      "backups/daily/2026-07-02.json.gz",
    ];
    expect(keysToPrune(keys, 2)).toEqual(["backups/daily/2026-07-01.json.gz"]);
  });

  it("prunes nothing when under the limit", () => {
    expect(keysToPrune(["a", "b"], 30)).toEqual([]);
    expect(keysToPrune([], KEEP_DAILY)).toEqual([]);
  });

  it("sorts chronologically via the sortable date in the key", () => {
    const keys = Array.from(
      { length: 35 },
      (_, i) => `backups/daily/2026-06-${String(i + 1).padStart(2, "0")}.json.gz`,
    );
    const pruned = keysToPrune(keys, KEEP_DAILY);
    expect(pruned).toHaveLength(35 - KEEP_DAILY);
    // The five oldest (June 1–5) are the ones dropped.
    expect(pruned[0]).toBe("backups/daily/2026-06-01.json.gz");
    expect(pruned).not.toContain("backups/daily/2026-06-06.json.gz");
  });

  it("monthly retention keeps a year", () => {
    expect(KEEP_MONTHLY).toBe(12);
  });
});
