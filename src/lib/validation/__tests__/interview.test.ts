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

  it("requires mode, interviewer and date — an N/A flag no longer satisfies them", () => {
    expect(
      interviewRoundSchema.safeParse({ ...base, interviewMode: "", interviewModeNa: "1" }).success,
    ).toBe(false);
    expect(
      interviewRoundSchema.safeParse({ ...base, interviewerName: "", interviewerNameNa: "1" }).success,
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
  it.each(["scheduledTimezoneNa", "feedbackNa"] as const)(
    "blank without %s fails",
    (naField) => {
      expect(interviewRoundSchema.safeParse({ ...base, [naField]: "" }).success).toBe(false);
    },
  );

  it("a real value satisfies a required-or-N/A field without its flag", () => {
    expect(
      interviewRoundSchema.safeParse({
        ...base,
        feedbackNa: "",
        feedback: "Strong on system design.",
      }).success,
    ).toBe(true);
  });
});

describe("interviewRoundSchema — video needs platform + link (hard)", () => {
  it("VIDEO mode requires a platform and a meeting link — N/A does not help", () => {
    const video = { ...base, interviewMode: "VIDEO" };
    expect(interviewRoundSchema.safeParse(video).success).toBe(false);
    // N/A flags no longer satisfy the video requirements.
    expect(
      interviewRoundSchema.safeParse({
        ...video,
        interviewPlatformNa: "1",
        meetingLinkNa: "1",
      }).success,
    ).toBe(false);
    // Real platform + link passes.
    expect(
      interviewRoundSchema.safeParse({
        ...video,
        interviewPlatform: "ZOOM",
        meetingLink: "https://zoom.us/j/123",
      }).success,
    ).toBe(true);
  });

  it("a non-video mode needs neither platform nor link", () => {
    expect(interviewRoundSchema.safeParse({ ...base, interviewMode: "PHONE" }).success).toBe(true);
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
