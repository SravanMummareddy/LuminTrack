import { describe, it, expect } from "vitest";
import {
  requirementSchema,
  requirementEditSchema,
} from "@/lib/validation/requirement";

// A complete, valid create payload (job + every required field satisfied by a
// value). Individual tests knock one field out to prove the required-or-N/A rule.
const full = {
  jobId: "job1",
  location: "Remote (US)",
  engagement: "C2C",
  vendorRecruiterName: "Priya Nair",
  teamLead: "Sriman Udugula",
  recruiterId: "rec1",
  clientRate: "95",
  billRate: "82",
  payRate: "68",
};

describe("requirementSchema — required fields", () => {
  it("accepts a fully-filled requirement", () => {
    expect(requirementSchema.safeParse(full).success).toBe(true);
  });

  it("requires a job", () => {
    expect(requirementSchema.safeParse({ ...full, jobId: "" }).success).toBe(false);
  });

  it.each(["location", "vendorRecruiterName", "teamLead"] as const)(
    "requires %s (no N/A escape)",
    (field) => {
      expect(requirementSchema.safeParse({ ...full, [field]: "" }).success).toBe(
        false,
      );
    },
  );

  it("requires a valid engagement", () => {
    expect(requirementSchema.safeParse({ ...full, engagement: "" }).success).toBe(
      false,
    );
    expect(
      requirementSchema.safeParse({ ...full, engagement: "FTE" }).success,
    ).toBe(false);
  });
});

describe("requirementSchema — required-or-N/A fields", () => {
  it.each(["clientRate", "billRate", "payRate"] as const)(
    "rejects a blank %s with no N/A flag",
    (field) => {
      expect(requirementSchema.safeParse({ ...full, [field]: "" }).success).toBe(
        false,
      );
    },
  );

  it.each([
    ["clientRate", "clientRateNa"],
    ["billRate", "billRateNa"],
    ["payRate", "payRateNa"],
  ] as const)("accepts a blank %s when its N/A flag is set", (field, naField) => {
    const r = requirementSchema.safeParse({
      ...full,
      [field]: "",
      [naField]: "1",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data[field]).toBeUndefined();
  });

  it("rejects an unassigned recruiter with no N/A flag", () => {
    expect(requirementSchema.safeParse({ ...full, recruiterId: "" }).success).toBe(
      false,
    );
  });

  it("accepts an unassigned recruiter when marked N/A", () => {
    expect(
      requirementSchema.safeParse({
        ...full,
        recruiterId: "",
        recruiterIdNa: "1",
      }).success,
    ).toBe(true);
  });

  it("rejects a negative rate even with a value", () => {
    expect(requirementSchema.safeParse({ ...full, billRate: "-5" }).success).toBe(
      false,
    );
  });
});

describe("requirementEditSchema — same rules, no jobId", () => {
  it("accepts the base fields without a job", () => {
    const { jobId: _jobId, ...noJob } = full;
    expect(requirementEditSchema.safeParse(noJob).success).toBe(true);
  });

  it("still enforces required-or-N/A on the rates", () => {
    const { jobId: _jobId, ...noJob } = full;
    expect(
      requirementEditSchema.safeParse({ ...noJob, payRate: "" }).success,
    ).toBe(false);
  });
});
