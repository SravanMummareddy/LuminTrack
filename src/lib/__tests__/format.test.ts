import { describe, it, expect } from "vitest";
import { deletedSuffix, formatDate, jobDuration } from "@/lib/format";

describe("jobDuration", () => {
  it("returns — with no start date", () => {
    expect(jobDuration(null, "2026-06-01")).toBe("—");
  });
  it("is Ongoing when there's a start but no end", () => {
    expect(jobDuration("2026-01-01", null)).toBe("Ongoing");
  });
  it("computes months between start and end", () => {
    expect(jobDuration("2026-01-01", "2026-07-01")).toBe("~6 months");
  });
  it("uses weeks for short spans", () => {
    expect(jobDuration("2026-01-01", "2026-01-15")).toBe("~2 weeks");
  });
  it("returns — when end precedes start", () => {
    expect(jobDuration("2026-07-01", "2026-01-01")).toBe("—");
  });
  it("appends (est.) when the start is an estimate", () => {
    expect(jobDuration("2026-01-01", "2026-07-01", true)).toBe("~6 months (est.)");
    expect(jobDuration("2026-01-01", null, true)).toBe("Ongoing (est.)");
  });
});

describe("deletedSuffix", () => {
  it("is empty for a live record", () => {
    expect(deletedSuffix({ deletedAt: null, erasedAt: null })).toBe("");
    expect(deletedSuffix({})).toBe("");
  });

  it("marks a trashed record (deletedAt set)", () => {
    expect(deletedSuffix({ deletedAt: new Date(), erasedAt: null })).toBe(
      " (deleted)",
    );
  });

  it("marks an erased record (erasedAt set)", () => {
    expect(deletedSuffix({ deletedAt: null, erasedAt: new Date() })).toBe(
      " (deleted)",
    );
  });

  it("accepts string timestamps too", () => {
    expect(deletedSuffix({ deletedAt: "2026-07-08T00:00:00Z" })).toBe(
      " (deleted)",
    );
  });
});

describe("formatDate", () => {
  it("renders a fixed UTC date regardless of runtime zone", () => {
    // A near-midnight UTC instant must not shift a day (hydration determinism).
    expect(formatDate("2026-01-01T00:30:00Z")).toBe("Jan 1, 2026");
  });
});
