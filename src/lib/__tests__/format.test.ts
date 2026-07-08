import { describe, it, expect } from "vitest";
import { deletedSuffix, formatDate } from "@/lib/format";

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
