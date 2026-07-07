import { describe, it, expect } from "vitest";
import { changePasswordSchema } from "@/lib/validation/user";

const valid = {
  currentPassword: "oldsecret1",
  newPassword: "newsecret1",
  confirmPassword: "newsecret1",
};

describe("changePasswordSchema", () => {
  it("accepts a valid change", () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a new password shorter than 8 chars", () => {
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
      currentPassword: "samesecret1",
      newPassword: "samesecret1",
      confirmPassword: "samesecret1",
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
