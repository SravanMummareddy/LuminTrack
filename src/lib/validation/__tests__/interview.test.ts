import { describe, it, expect } from "vitest";
import { interviewRoundSchema } from "@/lib/validation/interview";

// Minimal valid round — everything else on the schema is optional.
const base = {
  submissionId: "sub_1",
  roundName: "Technical round",
  interviewType: "OTHER" as const,
  result: "WAITING" as const,
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
