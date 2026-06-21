import { describe, it, expect } from "vitest";
import { benchConsultantSchema } from "@/lib/validation/bench";

describe("benchConsultantSchema", () => {
  it("requires a full name", () => {
    expect(benchConsultantSchema.safeParse({}).success).toBe(false);
    expect(
      benchConsultantSchema.safeParse({ fullName: "   " }).success,
      "whitespace-only name should fail",
    ).toBe(false);
  });

  it("applies sensible defaults for an otherwise-bare consultant", () => {
    const r = benchConsultantSchema.safeParse({ fullName: "Ravi Kumar" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.priority).toBe("SECOND");
      expect(r.data.marketingStatus).toBe("ACTIVE");
      expect(r.data.relocation).toBe(false);
      expect(r.data.isActive).toBe(true);
      expect(r.data.skills).toEqual([]);
    }
  });

  it("bounds experience years to a sane 0–80 range", () => {
    expect(
      benchConsultantSchema.safeParse({ fullName: "X", marketingExpYears: "81" })
        .success,
    ).toBe(false);
    expect(
      benchConsultantSchema.safeParse({ fullName: "X", marketingExpYears: "12" })
        .success,
    ).toBe(true);
    expect(
      benchConsultantSchema.safeParse({ fullName: "X", realTimeExpYears: "-1" })
        .success,
    ).toBe(false);
  });

  it("validates marketing email format but allows it to be blank", () => {
    expect(
      benchConsultantSchema.safeParse({ fullName: "X", marketingEmail: "" })
        .success,
    ).toBe(true);
    expect(
      benchConsultantSchema.safeParse({
        fullName: "X",
        marketingEmail: "not-an-email",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown priority / marketing status", () => {
    expect(
      benchConsultantSchema.safeParse({ fullName: "X", priority: "URGENT" })
        .success,
    ).toBe(false);
    expect(
      benchConsultantSchema.safeParse({ fullName: "X", marketingStatus: "COLD" })
        .success,
    ).toBe(false);
  });
});
