import { describe, it, expect } from "vitest";
import { interviewRoundSchema } from "@/lib/validation/interview";

// Minimal valid round (Wave 4 strict): mode / interviewer / date are now HARD
// required, so the base fills them with a non-video interview; time zone,
// feedback and the support pair stay required-or-N/A and are marked N/A here.
const base = {
  submissionId: "sub_1",
  roundName: "Technical round",
  interviewType: "OTHER" as const,
  result: "WAITING" as const,
  interviewMode: "PHONE",
  interviewerName: "Meghan Carter",
  scheduledAt: "2026-07-15T10:00",
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

describe("interviewRoundSchema — the minimal valid round parses", () => {
  it("accepts the strict base (mode/interviewer/date filled)", () => {
    expect(interviewRoundSchema.safeParse(base).success).toBe(true);
  });
});

describe("interviewRoundSchema — hard-required fields (no N/A escape)", () => {
  it("requires roundName, interviewType, result", () => {
    expect(interviewRoundSchema.safeParse({ ...base, roundName: "" }).success).toBe(false);
    expect(interviewRoundSchema.safeParse({ ...base, interviewType: "" }).success).toBe(false);
    expect(interviewRoundSchema.safeParse({ ...base, result: "" }).success).toBe(false);
  });

  it("requires mode and date — an N/A flag no longer satisfies them", () => {
    expect(
      interviewRoundSchema.safeParse({ ...base, interviewMode: "", interviewModeNa: "1" }).success,
    ).toBe(false);
    expect(
      interviewRoundSchema.safeParse({ ...base, scheduledAt: "", scheduledAtNa: "1" }).success,
    ).toBe(false);
  });

  it("accepts the new didn't-happen outcomes", () => {
    expect(interviewRoundSchema.safeParse({ ...base, result: "NO_SHOW" }).success).toBe(true);
    expect(interviewRoundSchema.safeParse({ ...base, result: "CANCELLED" }).success).toBe(true);
  });
});

describe("interviewRoundSchema — required-or-N/A fields", () => {
  it("blank time zone without its N/A flag fails", () => {
    expect(interviewRoundSchema.safeParse({ ...base, scheduledTimezoneNa: "" }).success).toBe(false);
  });

  it("a real time-zone value satisfies it without the flag", () => {
    expect(
      interviewRoundSchema.safeParse({
        ...base,
        scheduledTimezoneNa: "",
        scheduledTimezone: "America/Chicago",
      }).success,
    ).toBe(true);
  });
});

describe("interviewRoundSchema — Model B: interviewer required-or-TBD", () => {
  it("blank interviewer with no TBD flag fails", () => {
    expect(
      interviewRoundSchema.safeParse({ ...base, interviewerName: "", interviewerNameNa: "" }).success,
    ).toBe(false);
  });

  it("TBD (N/A flag) satisfies a blank interviewer", () => {
    expect(
      interviewRoundSchema.safeParse({ ...base, interviewerName: "", interviewerNameNa: "1" }).success,
    ).toBe(true);
  });
});

describe("interviewRoundSchema — Model B: feedback only once the result is logged", () => {
  it("a still-Waiting (scheduled) round needs no feedback", () => {
    // result WAITING + no feedback + no feedback N/A flag → still valid.
    expect(
      interviewRoundSchema.safeParse({ ...base, result: "WAITING", feedbackNa: "" }).success,
    ).toBe(true);
  });

  it("a logged result requires feedback or its N/A flag", () => {
    const done = { ...base, result: "SELECTED" as const, feedbackNa: "" };
    expect(interviewRoundSchema.safeParse(done).success).toBe(false);
    expect(
      interviewRoundSchema.safeParse({ ...done, feedback: "Cleared all rounds." }).success,
    ).toBe(true);
    expect(interviewRoundSchema.safeParse({ ...done, feedbackNa: "1" }).success).toBe(true);
  });
});

describe("interviewRoundSchema — video platform + link are optional", () => {
  it("VIDEO mode with no platform or link is valid (both optional)", () => {
    expect(
      interviewRoundSchema.safeParse({ ...base, interviewMode: "VIDEO" }).success,
    ).toBe(true);
  });

  it("VIDEO with a real platform + link is valid", () => {
    expect(
      interviewRoundSchema.safeParse({
        ...base,
        interviewMode: "VIDEO",
        interviewPlatform: "ZOOM",
        meetingLink: "https://zoom.us/j/123",
      }).success,
    ).toBe(true);
  });

  it("a platform on a non-video mode is still rejected (applies to video only)", () => {
    expect(
      interviewRoundSchema.safeParse({
        ...base,
        interviewMode: "PHONE",
        interviewPlatform: "ZOOM",
      }).success,
    ).toBe(false);
  });
});

describe("interviewRoundSchema — support pair required-or-N/A", () => {
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
