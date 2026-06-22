import { describe, it, expect } from "vitest";
import {
  placementUpdateSchema,
  placementExtendSchema,
  placementEndSchema,
} from "@/lib/validation/placement";

describe("placementUpdateSchema", () => {
  const base = { id: "p1", startDate: "2026-06-01" };

  it("accepts the minimal update (id + start date)", () => {
    expect(placementUpdateSchema.safeParse(base).success).toBe(true);
  });

  it("requires an id and a start date", () => {
    expect(placementUpdateSchema.safeParse({ ...base, id: "" }).success).toBe(false);
    expect(
      placementUpdateSchema.safeParse({ ...base, startDate: "" }).success,
    ).toBe(false);
  });

  it("leaves empty rates undefined so a non-rate edit can't zero them", () => {
    const r = placementUpdateSchema.safeParse({ ...base, billRate: "", payRate: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.billRate).toBeUndefined();
      expect(r.data.payRate).toBeUndefined();
    }
  });

  it("rejects a negative rate", () => {
    expect(
      placementUpdateSchema.safeParse({ ...base, billRate: "-1" }).success,
    ).toBe(false);
  });

  it("accepts the Bench-Sales sheet fields (organisation/lead/dates/remarks)", () => {
    const r = placementUpdateSchema.safeParse({
      ...base,
      organisation: "USEI Technologies",
      teamLead: "Sriman Udugula",
      interviewDate: "2026-05-20",
      placementDate: "2026-06-01",
      remarks: "Net-30 terms",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.organisation).toBe("USEI Technologies");
      expect(r.data.interviewDate).toBeInstanceOf(Date);
    }
  });
});

describe("placementExtendSchema — overlap guard", () => {
  const base = { id: "p1", startDate: "2026-06-01", endDate: "2026-09-01" };

  it("accepts an extension whose end is after its start", () => {
    expect(placementExtendSchema.safeParse(base).success).toBe(true);
  });

  it("rejects end == start (zero-length extension)", () => {
    expect(
      placementExtendSchema.safeParse({
        ...base,
        endDate: "2026-06-01",
      }).success,
    ).toBe(false);
  });

  it("rejects end before start", () => {
    expect(
      placementExtendSchema.safeParse({
        ...base,
        startDate: "2026-09-01",
        endDate: "2026-06-01",
      }).success,
    ).toBe(false);
  });
});

describe("placementEndSchema", () => {
  it("requires a valid end reason and an end date", () => {
    expect(
      placementEndSchema.safeParse({
        id: "p1",
        endReason: "COMPLETED",
        endDate: "2026-08-01",
      }).success,
    ).toBe(true);
    expect(
      placementEndSchema.safeParse({
        id: "p1",
        endReason: "COMPLETED",
        endDate: "",
      }).success,
    ).toBe(false);
    expect(
      placementEndSchema.safeParse({
        id: "p1",
        endReason: "QUIT",
        endDate: "2026-08-01",
      }).success,
    ).toBe(false);
  });

  it("treats an empty replacement submission id as absent", () => {
    const r = placementEndSchema.safeParse({
      id: "p1",
      endReason: "RESIGNED",
      endDate: "2026-08-01",
      replacementSubmissionId: "",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.replacementSubmissionId).toBeUndefined();
  });
});
