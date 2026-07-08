import { describe, it, expect } from "vitest";
import {
  passwordClassCount,
  passwordIssues,
  isStrongPassword,
  passwordRequirements,
  PASSWORD_MIN_LENGTH,
} from "@/lib/password-policy";

describe("password policy (Balanced: >=10 chars, 3 of 4 classes)", () => {
  it("counts character classes", () => {
    expect(passwordClassCount("")).toBe(0);
    expect(passwordClassCount("abcdef")).toBe(1); // lower only
    expect(passwordClassCount("abcABC")).toBe(2); // lower + upper
    expect(passwordClassCount("abcABC1")).toBe(3); // + digit
    expect(passwordClassCount("abcABC1!")).toBe(4); // + symbol
  });

  it("accepts the seeded demo password", () => {
    expect(isStrongPassword("LuminTrack2026!")).toBe(true);
  });

  it("accepts >=10 chars with exactly 3 classes (no symbol required)", () => {
    expect(isStrongPassword("LuminTrack2026")).toBe(true); // upper+lower+digit
    expect(passwordIssues("LuminTrack2026")).toEqual([]);
  });

  it("rejects a too-short password even with 4 classes", () => {
    expect(isStrongPassword("Ab1!")).toBe(false);
    expect(passwordIssues("Ab1!")).toContain(
      `At least ${PASSWORD_MIN_LENGTH} characters`,
    );
  });

  it("rejects a long password with only 2 classes", () => {
    expect(isStrongPassword("recruiterrecruiter")).toBe(false); // lower only
    expect(isStrongPassword("recruiter1recruiter")).toBe(false); // lower+digit = 2
  });

  it("lists both failures for a weak short password", () => {
    expect(passwordIssues("abc")).toHaveLength(2);
  });

  it("exposes a live requirement checklist", () => {
    const reqs = passwordRequirements("short1");
    expect(reqs).toHaveLength(2);
    expect(reqs[0].met).toBe(false); // length
    const strong = passwordRequirements("LuminTrack2026!");
    expect(strong.every((r) => r.met)).toBe(true);
  });
});
