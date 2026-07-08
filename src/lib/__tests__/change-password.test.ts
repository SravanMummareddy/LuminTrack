import { describe, it, expect } from "vitest";
import { changePasswordSchema } from "@/lib/validation/user";

// Passwords must satisfy the Balanced policy (>=10 chars, 3 of 4 char classes).
const valid = {
  currentPassword: "OldSecret2025",
  newPassword: "NewSecret2026",
  confirmPassword: "NewSecret2026",
};

describe("changePasswordSchema", () => {
  it("accepts a valid change", () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a new password that fails the strength policy", () => {
    const r = changePasswordSchema.safeParse({
      ...valid,
      newPassword: "short1",
      confirmPassword: "short1",
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues.some((i) => i.path[0] === "newPassword")).toBe(true);
  });

  it("rejects when confirmation doesn't match", () => {
    const r = changePasswordSchema.safeParse({
      ...valid,
      confirmPassword: "different1",
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues.some((i) => i.path[0] === "confirmPassword")).toBe(
        true,
      );
  });

  it("rejects when the new password equals the current one", () => {
    const r = changePasswordSchema.safeParse({
      currentPassword: "SameSecret2026",
      newPassword: "SameSecret2026",
      confirmPassword: "SameSecret2026",
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues.some((i) => i.path[0] === "newPassword")).toBe(true);
  });

  it("requires the current password", () => {
    const r = changePasswordSchema.safeParse({ ...valid, currentPassword: "" });
    expect(r.success).toBe(false);
  });
});
