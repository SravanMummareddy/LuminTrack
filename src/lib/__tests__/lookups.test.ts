import { describe, it, expect } from "vitest";
import {
  LOOKUP_CATEGORIES,
  LOOKUP_DEFAULTS,
  mergeLookupValues,
} from "@/lib/lookups";

describe("lookup defaults (field-definition cleanup)", () => {
  it("defines a curated list for every category", () => {
    for (const cat of LOOKUP_CATEGORIES) {
      expect(LOOKUP_DEFAULTS[cat].length).toBeGreaterThan(0);
    }
  });

  it("has the bench type categories with their defined values", () => {
    expect(LOOKUP_CATEGORIES).toContain("PROJECT_TYPE");
    expect(LOOKUP_DEFAULTS.PROJECT_TYPE).toEqual([
      "Contract",
      "Contract-to-Hire",
      "Full-time",
      "Part-time",
    ]);
    expect(LOOKUP_DEFAULTS.CALL_TYPE).toContain("1099");
    expect(LOOKUP_DEFAULTS.PAYROLL_TYPE).toEqual(["W2", "C2C", "1099"]);
  });
});

describe("mergeLookupValues", () => {
  it("keeps defaults first, appends learned extras, dedupes case-insensitively", () => {
    expect(
      mergeLookupValues(["Contract", "Full-time"], ["contract", "Internship"]),
    ).toEqual(["Contract", "Full-time", "Internship"]);
  });
});
