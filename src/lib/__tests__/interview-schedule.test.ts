import { describe, it, expect } from "vitest";
import type { InterviewResult } from "@/generated/prisma/enums";
import {
  scheduleBucketOf,
  bucketInterviews,
  isConcluded,
} from "@/lib/interview-schedule";

// A fixed reference "now": noon UTC on Wed 2026-07-15.
const NOW = new Date("2026-07-15T12:00:00Z");
const at = (iso: string, result: InterviewResult = "WAITING") => ({
  scheduledAt: new Date(iso),
  result,
});

describe("scheduleBucketOf", () => {
  it("a still-waiting past round is awaiting outcome", () => {
    expect(scheduleBucketOf(at("2026-07-10T09:00:00Z"), NOW)).toBe("awaiting");
  });

  it("a waiting round earlier the same UTC day is today, not awaiting", () => {
    expect(scheduleBucketOf(at("2026-07-15T08:00:00Z"), NOW)).toBe("today");
  });

  it("a waiting round later this week is 'week'", () => {
    expect(scheduleBucketOf(at("2026-07-18T10:00:00Z"), NOW)).toBe("week");
  });

  it("a waiting round beyond 7 days is upcoming", () => {
    expect(scheduleBucketOf(at("2026-07-30T10:00:00Z"), NOW)).toBe("upcoming");
  });

  it("any concluded result is completed regardless of date", () => {
    for (const r of [
      "SELECTED",
      "REJECTED",
      "COMPLETED",
      "NEED_ANOTHER_ROUND",
      "ON_HOLD",
    ] as InterviewResult[]) {
      // Even a future date lands in completed once the round is concluded.
      expect(scheduleBucketOf(at("2026-08-01T10:00:00Z", r), NOW)).toBe(
        "completed",
      );
    }
  });
});

describe("isConcluded", () => {
  it("WAITING is the only non-concluded result", () => {
    expect(isConcluded("WAITING")).toBe(false);
    expect(isConcluded("SELECTED")).toBe(true);
    expect(isConcluded("COMPLETED")).toBe(true);
  });

  it("NO_SHOW and CANCELLED are concluded (didn't-happen outcomes)", () => {
    // The pipeline treats these as resolved (only WAITING blocks an advance),
    // so the schedule view must too — else a no-showed past round nags forever.
    expect(isConcluded("NO_SHOW")).toBe(true);
    expect(isConcluded("CANCELLED")).toBe(true);
    // And a past-dated NO_SHOW round lands in Completed, not Awaiting.
    expect(scheduleBucketOf(at("2026-07-10T09:00:00Z", "NO_SHOW"), NOW)).toBe(
      "completed",
    );
  });
});

describe("bucketInterviews", () => {
  it("returns all five buckets in render order", () => {
    expect(bucketInterviews([], NOW).map((b) => b.key)).toEqual([
      "awaiting",
      "today",
      "week",
      "upcoming",
      "completed",
    ]);
  });

  it("sorts future buckets soonest-first and past/settled most-recent-first", () => {
    const rows = [
      at("2026-07-20T10:00:00Z"), // upcoming (later)
      at("2026-07-16T10:00:00Z"), // week (sooner)
      at("2026-07-05T10:00:00Z"), // awaiting (older)
      at("2026-07-12T10:00:00Z"), // awaiting (newer)
    ];
    const b = bucketInterviews(rows, NOW);
    const awaiting = b.find((x) => x.key === "awaiting")!;
    // Most-recent past first.
    expect(awaiting.items.map((i) => i.scheduledAt.toISOString())).toEqual([
      "2026-07-12T10:00:00.000Z",
      "2026-07-05T10:00:00.000Z",
    ]);
  });

  it("routes each row to exactly one bucket", () => {
    const rows = [
      at("2026-07-10T09:00:00Z"), // awaiting
      at("2026-07-15T08:00:00Z"), // today
      at("2026-07-18T10:00:00Z"), // week
      at("2026-07-30T10:00:00Z"), // upcoming
      at("2026-07-01T10:00:00Z", "REJECTED"), // completed
    ];
    const counts = Object.fromEntries(
      bucketInterviews(rows, NOW).map((b) => [b.key, b.items.length]),
    );
    expect(counts).toEqual({
      awaiting: 1,
      today: 1,
      week: 1,
      upcoming: 1,
      completed: 1,
    });
  });
});
