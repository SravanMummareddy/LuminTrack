import { describe, it, expect } from "vitest";
import { daysSince, agingBucket, currentStageDays } from "@/lib/analytics";

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

describe("daysSince", () => {
  it("counts whole days elapsed", () => {
    expect(daysSince(daysAgo(10))).toBe(10);
    expect(daysSince(daysAgo(0))).toBe(0);
  });

  it("clamps future dates to 0 (never negative)", () => {
    expect(daysSince(new Date(Date.now() + 5 * DAY))).toBe(0);
  });

  it("accepts an ISO string", () => {
    expect(daysSince(daysAgo(3).toISOString())).toBe(3);
  });
});

describe("agingBucket — boundaries are inclusive on the upper edge", () => {
  it("0–15", () => {
    expect(agingBucket(0)).toBe("0-15");
    expect(agingBucket(15)).toBe("0-15");
  });
  it("16–30", () => {
    expect(agingBucket(16)).toBe("16-30");
    expect(agingBucket(30)).toBe("16-30");
  });
  it("31–60", () => {
    expect(agingBucket(31)).toBe("31-60");
    expect(agingBucket(60)).toBe("31-60");
  });
  it("60+", () => {
    expect(agingBucket(61)).toBe("60+");
    expect(agingBucket(9999)).toBe("60+");
  });
});

describe("currentStageDays", () => {
  it("with no transitions, measures from submittedAt", () => {
    expect(currentStageDays(daysAgo(12), [])).toBe(12);
  });

  it("measures from the LATEST transition, not the first", () => {
    const transitions = [
      { eventAt: null, createdAt: daysAgo(10) },
      { eventAt: null, createdAt: daysAgo(3) }, // most recent stage entry
      { eventAt: null, createdAt: daysAgo(7) },
    ];
    expect(currentStageDays(daysAgo(20), transitions)).toBe(3);
  });

  it("prefers eventAt (real-world date) over createdAt", () => {
    const transitions = [
      { eventAt: daysAgo(2), createdAt: daysAgo(9) },
    ];
    expect(currentStageDays(daysAgo(30), transitions)).toBe(2);
  });

  it("ignores a transition backdated before submittedAt", () => {
    // A user fat-fingers an event date older than the submission itself; the
    // stage clock must not run from before the submission existed.
    const transitions = [{ eventAt: daysAgo(40), createdAt: daysAgo(40) }];
    expect(currentStageDays(daysAgo(5), transitions)).toBe(5);
  });
});
