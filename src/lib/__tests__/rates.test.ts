import { describe, it, expect } from "vitest";
import { rateChainWarnings } from "@/lib/rates";

describe("rateChainWarnings", () => {
  it("flags pay above bill (negative margin)", () => {
    const w = rateChainWarnings({ payRate: "90", billRate: "80" });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/Pay rate.*above.*Bill rate.*negative/);
  });

  it("flags bill above client", () => {
    const w = rateChainWarnings({ billRate: "110", clientRate: "100" });
    expect(w[0]).toMatch(/Bill rate.*above.*Client rate/);
  });

  it("flags pay above client when no bill rung is present", () => {
    const w = rateChainWarnings({ payRate: "120", clientRate: "100" });
    expect(w[0]).toMatch(/Pay rate.*above.*Client rate/);
  });

  it("does NOT double-flag pay vs client when a bill rung exists", () => {
    // pay > bill is flagged, but pay-vs-client is suppressed (bill is the rung).
    const w = rateChainWarnings({ payRate: "120", billRate: "115", clientRate: "100" });
    expect(w.some((m) => /Pay rate.*Client rate/.test(m))).toBe(false);
  });

  it("is silent for a healthy chain", () => {
    expect(
      rateChainWarnings({
        payRate: "80",
        billRate: "95",
        clientRate: "110",
      }),
    ).toEqual([]);
  });

  it("treats equal rungs as fine (only strictly-greater warns)", () => {
    expect(rateChainWarnings({ payRate: "80", billRate: "80" })).toEqual([]);
  });

  it("ignores blank / missing / non-positive values", () => {
    expect(rateChainWarnings({})).toEqual([]);
    expect(rateChainWarnings({ payRate: "", billRate: "  " })).toEqual([]);
    expect(rateChainWarnings({ payRate: "90", billRate: null })).toEqual([]);
    expect(rateChainWarnings({ payRate: "abc", billRate: "80" })).toEqual([]);
    expect(rateChainWarnings({ payRate: "0", billRate: "80" })).toEqual([]);
  });

  it("accepts numbers as well as strings", () => {
    const w = rateChainWarnings({ payRate: 90, billRate: 80 });
    expect(w).toHaveLength(1);
  });

  it("can surface multiple violations at once", () => {
    const w = rateChainWarnings({
      payRate: "120",
      billRate: "110",
      clientRate: "100",
    });
    // pay>bill and bill>client → 2 warnings.
    expect(w).toHaveLength(2);
  });
});
