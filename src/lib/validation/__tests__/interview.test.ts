import { describe, it, expect } from "vitest";
import { interviewRoundSchema } from "@/lib/validation/interview";

// Minimal valid round — hard-required identity/outcome, every other field marked
// N/A. Individual tests knock a flag out or supply a real value instead.
const base = {
  submissionId: "sub_1",
  roundName: "Technical round",
  interviewType: "OTHER" as const,
  result: "WAITING" as const,
  interviewModeNa: "1",
  interviewerNameNa: "1",
  meetingLinkNa: "1",
  scheduledAtNa: "1",
  scheduledTimezoneNa: "1",
  feedbackNa: "1",
  supportProviderIdNa: "1",
  supportMethodNa: "1",
};

function parseSupport(v: unknown): boolean {
  const r = interviewRoundSchema.safeParse({ ...base, supportNeeded: v });
  if (!r.success)
    throw new Error(
      "unexpected parse failure: " + JSON.stringify(r.error.issues),
    );
  return r.data.supportNeeded;
}

describe("interviewRoundSchema.supportNeeded (WR-12)", () => {
  it("treats explicit truthy checkbox values as true", () => {
    expect(parseSupport("on")).toBe(true); // native checkbox
    expect(parseSupport(true)).toBe(true); // action pre-converts today
    expect(parseSupport("true")).toBe(true);
  });

  it("treats everything else as false — crucially the string 'false'", () => {
    // z.coerce.boolean() would have made all of these `true`.
    expect(parseSupport("false")).toBe(false);
    expect(parseSupport("off")).toBe(false);
    expect(parseSupport(false)).toBe(false);
    expect(parseSupport(undefined)).toBe(false); // unchecked / absent
  });
});

describe("interviewRoundSchema — required fields", () => {
  it("requires roundName, interviewType, result (no N/A escape)", () => {
    expect(interviewRoundSchema.safeParse({ ...base, roundName: "" }).success).toBe(false);
    expect(interviewRoundSchema.safeParse({ ...base, interviewType: "" }).success).toBe(false);
    expect(interviewRoundSchema.safeParse({ ...base, result: "" }).success).toBe(false);
  });
});

describe("interviewRoundSchema — required-or-N/A fields", () => {
  it("the all-N/A base is valid", () => {
    expect(interviewRoundSchema.safeParse(base).success).toBe(true);
  });

  it.each([
    "interviewModeNa",
    "interviewerNameNa",
    "meetingLinkNa",
    "scheduledAtNa",
    "scheduledTimezoneNa",
    "feedbackNa",
  ] as const)("blank without %s fails", (naField) => {
    expect(interviewRoundSchema.safeParse({ ...base, [naField]: "" }).success).toBe(false);
  });

  it("a real value satisfies a field without its N/A flag", () => {
    const r = interviewRoundSchema.safeParse({
      ...base,
      interviewerNameNa: "",
      interviewerName: "Meghan Carter",
    });
    expect(r.success).toBe(true);
  });
});

describe("interviewRoundSchema — conditional required-or-N/A", () => {
  it("VIDEO mode requires a platform or its N/A flag", () => {
    const video = { ...base, interviewModeNa: "", interviewMode: "VIDEO" };
    expect(interviewRoundSchema.safeParse(video).success).toBe(false);
    expect(
      interviewRoundSchema.safeParse({ ...video, interviewPlatformNa: "1" }).success,
    ).toBe(true);
    expect(
      interviewRoundSchema.safeParse({ ...video, interviewPlatform: "ZOOM" }).success,
    ).toBe(true);
  });

  it("a non-video mode does not require a platform", () => {
    expect(
      interviewRoundSchema.safeParse({
        ...base,
        interviewModeNa: "",
        interviewMode: "PHONE",
      }).success,
    ).toBe(true);
  });

  it("support requires provider + method or their N/A flags", () => {
    const withSupport = {
      ...base,
      supportNeeded: "on",
      supportProviderIdNa: "",
      supportMethodNa: "",
    };
    expect(interviewRoundSchema.safeParse(withSupport).success).toBe(false);
    expect(
      interviewRoundSchema.safeParse({
        ...withSupport,
        supportProviderIdNa: "1",
        supportMethodNa: "1",
      }).success,
    ).toBe(true);
  });
});
