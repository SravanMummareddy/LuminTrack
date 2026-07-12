import { describe, it, expect } from "vitest";
import { benchConsultantSchema } from "@/lib/validation/bench";

// A complete, valid consultant. Tests knock one field out to prove each rule.
const full = {
  fullName: "Ravi Kumar",
  email: "ravi@example.com",
  phone: "+1 469 555 0100",
  currentLocation: "Dallas, TX",
  workAuthorization: "Green Card",
  mVisa: "H1B",
  aVisa: "GC-EAD",
  marketingExpYears: "10",
  skills: ["Java", "AWS"],
  reference: "LinkedIn",
  company: "Infosys",
  projectType: "Contract",
  leastRateC2C: "70",
  callType: "C2C",
  payrollType: "W2",
  relocationMode: "ANYWHERE",
};

describe("benchConsultantSchema — required fields", () => {
  it("accepts a fully-filled consultant", () => {
    expect(benchConsultantSchema.safeParse(full).success).toBe(true);
  });

  it.each([
    "fullName",
    "phone",
    "currentLocation",
    "workAuthorization",
    "mVisa",
    "reference",
    "company",
    "projectType",
    "callType",
    "payrollType",
  ] as const)("requires %s", (field) => {
    expect(benchConsultantSchema.safeParse({ ...full, [field]: "" }).success).toBe(false);
  });

  it("requires a valid email", () => {
    expect(benchConsultantSchema.safeParse({ ...full, email: "" }).success).toBe(false);
    expect(benchConsultantSchema.safeParse({ ...full, email: "nope" }).success).toBe(false);
  });

  it("requires at least one skill and a marketing-experience value", () => {
    expect(benchConsultantSchema.safeParse({ ...full, skills: [] }).success).toBe(false);
    expect(benchConsultantSchema.safeParse({ ...full, marketingExpYears: "" }).success).toBe(false);
  });

  it("keeps priority / marketing-status defaults + rejects unknown values", () => {
    const r = benchConsultantSchema.safeParse(full);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.priority).toBe("SECOND");
      expect(r.data.marketingStatus).toBe("ACTIVE");
    }
    expect(benchConsultantSchema.safeParse({ ...full, priority: "URGENT" }).success).toBe(false);
    expect(benchConsultantSchema.safeParse({ ...full, marketingStatus: "COLD" }).success).toBe(false);
  });

  it("bounds experience years to 0–80", () => {
    expect(benchConsultantSchema.safeParse({ ...full, marketingExpYears: "81" }).success).toBe(false);
    expect(benchConsultantSchema.safeParse({ ...full, realTimeExpYears: "-1" }).success).toBe(false);
  });
});

describe("benchConsultantSchema — required-or-N/A fields", () => {
  it("A Visa: blank fails, blank+N/A passes", () => {
    expect(benchConsultantSchema.safeParse({ ...full, aVisa: "" }).success).toBe(false);
    expect(benchConsultantSchema.safeParse({ ...full, aVisa: "", aVisaNa: "1" }).success).toBe(true);
  });

  it("Least rate on C2C: blank fails, blank+N/A passes", () => {
    expect(benchConsultantSchema.safeParse({ ...full, leastRateC2C: "" }).success).toBe(false);
    expect(
      benchConsultantSchema.safeParse({ ...full, leastRateC2C: "", leastRateC2CNa: "1" }).success,
    ).toBe(true);
  });
});

describe("benchConsultantSchema — relocation", () => {
  it("requires a relocation option", () => {
    expect(benchConsultantSchema.safeParse({ ...full, relocationMode: "" }).success).toBe(false);
    expect(benchConsultantSchema.safeParse({ ...full, relocationMode: "MAYBE" }).success).toBe(false);
  });

  it("requires cities when 'Specific'", () => {
    expect(benchConsultantSchema.safeParse({ ...full, relocationMode: "SPECIFIC" }).success).toBe(false);
    expect(
      benchConsultantSchema.safeParse({
        ...full,
        relocationMode: "SPECIFIC",
        relocationCities: "Austin, Dallas",
      }).success,
    ).toBe(true);
  });

  it("does not need cities for Anywhere / No", () => {
    expect(benchConsultantSchema.safeParse({ ...full, relocationMode: "NO" }).success).toBe(true);
  });
});

describe("benchConsultantSchema — marketing email format", () => {
  it("allows blank but validates format when present", () => {
    expect(benchConsultantSchema.safeParse({ ...full, marketingEmail: "" }).success).toBe(true);
    expect(benchConsultantSchema.safeParse({ ...full, marketingEmail: "nope" }).success).toBe(false);
  });
});
