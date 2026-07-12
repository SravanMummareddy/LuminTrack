import { describe, it, expect } from "vitest";
import { candidateSchema } from "@/lib/validation/candidate";

// A complete, valid candidate. Tests knock one field out to prove each rule.
const full = {
  firstName: "Aditya",
  lastName: "Kulkarni",
  email: "aditya@example.com",
  phone: "+1 469 555 0142",
  currentLocation: "Dallas, TX",
  workAuthorization: "H1B",
  totalExperienceYears: "8",
  technology: "Java",
  skills: ["Java", "Spring Boot", "Kafka"],
  linkedinUrl: "https://linkedin.com/in/aditya",
  isActive: true,
  lastContactedAt: "2026-07-10T14:30",
  referrerId: "ref_1",
  discipline: "IT",
};

describe("candidateSchema — required fields", () => {
  it("accepts a fully-filled candidate (not working)", () => {
    expect(candidateSchema.safeParse(full).success).toBe(true);
  });

  it.each([
    "firstName",
    "lastName",
    "phone",
    "currentLocation",
    "workAuthorization",
    "technology",
    "referrerId",
  ] as const)("requires %s", (field) => {
    expect(candidateSchema.safeParse({ ...full, [field]: "" }).success).toBe(false);
  });

  it("requires a valid email", () => {
    expect(candidateSchema.safeParse({ ...full, email: "" }).success).toBe(false);
    expect(candidateSchema.safeParse({ ...full, email: "not-an-email" }).success).toBe(false);
  });

  it("requires a valid LinkedIn URL", () => {
    expect(candidateSchema.safeParse({ ...full, linkedinUrl: "" }).success).toBe(false);
    expect(candidateSchema.safeParse({ ...full, linkedinUrl: "notaurl" }).success).toBe(false);
  });

  it("requires total experience and a last-contacted date", () => {
    expect(candidateSchema.safeParse({ ...full, totalExperienceYears: "" }).success).toBe(false);
    expect(candidateSchema.safeParse({ ...full, lastContactedAt: "" }).success).toBe(false);
  });

  it("requires at least one skill and a discipline", () => {
    expect(candidateSchema.safeParse({ ...full, skills: [] }).success).toBe(false);
    expect(candidateSchema.safeParse({ ...full, discipline: "" }).success).toBe(false);
  });

  it("composes nothing itself — first + last are the source of truth", () => {
    const r = candidateSchema.safeParse(full);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.firstName).toBe("Aditya");
      expect(r.data.lastName).toBe("Kulkarni");
    }
  });
});

describe("candidateSchema — conditional 'working' fields", () => {
  it("does NOT require company/engagement when not working", () => {
    const r = candidateSchema.safeParse({ ...full, isWorking: false });
    expect(r.success).toBe(true);
  });

  it("requires company + engagement type when working", () => {
    const working = { ...full, isWorking: true };
    expect(candidateSchema.safeParse(working).success).toBe(false); // both blank
    expect(
      candidateSchema.safeParse({ ...working, currentCompany: "Infosys" }).success,
    ).toBe(false); // engagement still blank
    expect(
      candidateSchema.safeParse({
        ...working,
        currentCompany: "Infosys",
        workingType: "C2C",
      }).success,
    ).toBe(true);
  });
});

describe("candidateSchema — featured skills subset", () => {
  it("rejects a featured skill not in the skills list", () => {
    expect(
      candidateSchema.safeParse({ ...full, featuredSkills: ["Python"] }).success,
    ).toBe(false);
  });

  it("accepts featured skills drawn from the skills list", () => {
    expect(
      candidateSchema.safeParse({ ...full, featuredSkills: ["Java", "Kafka"] }).success,
    ).toBe(true);
  });
});
