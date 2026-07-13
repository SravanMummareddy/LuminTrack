import { describe, it, expect } from "vitest";
import { can } from "@/lib/permissions";
import {
  PERMISSION_KEYS,
  SYSTEM_ROLE_GRANTS,
  permissionsForRole,
  deriveEnumTier,
} from "@/lib/permission-catalog";

// Locks the catalog ↔ system-role-template mapping so seeded roles reproduce
// today's grants exactly, and the can() bridge (hydrated set vs enum fallback).
describe("permission catalog + templates", () => {
  it("Manager grants every permission in the catalog", () => {
    expect(new Set(SYSTEM_ROLE_GRANTS.MANAGER)).toEqual(new Set(PERMISSION_KEYS));
  });

  it("Recruiter grants the any-signed-in capabilities + VPR management", () => {
    expect(SYSTEM_ROLE_GRANTS.RECRUITER.sort()).toEqual(
      ["bench:view_credentials", "orgentity:quickadd", "requirement:manage"].sort(),
    );
  });

  it("Team Lead is recruiter + the full-tier cluster, but not the manager tier", () => {
    const tl = new Set(SYSTEM_ROLE_GRANTS.TEAM_LEAD);
    expect(tl.has("tier:full")).toBe(true);
    expect(tl.has("requirement:manage")).toBe(true);
    expect(tl.has("document:view_sensitive")).toBe(true);
    expect(tl.has("tier:manager")).toBe(false);
    expect(tl.has("user:manage")).toBe(false);
    expect(tl.has("role:manage")).toBe(false);
    // Everything the recruiter has, a team lead also has.
    for (const k of SYSTEM_ROLE_GRANTS.RECRUITER) expect(tl.has(k)).toBe(true);
  });
});

describe("can() bridge", () => {
  it("reads a hydrated permission set when present", () => {
    const viewer = { role: "RECRUITER" as const, permissions: new Set(["role:manage"]) };
    // The hydrated set wins over the enum fallback.
    expect(can(viewer, "role:manage")).toBe(true);
    expect(can(viewer, "tier:full")).toBe(false);
  });

  it("falls back to the enum template when no permission set is hydrated", () => {
    expect(can({ role: "MANAGER" }, "tier:manager")).toBe(true);
    expect(can({ role: "TEAM_LEAD" }, "tier:full")).toBe(true);
    expect(can({ role: "TEAM_LEAD" }, "tier:manager")).toBe(false);
    expect(can({ role: "RECRUITER" }, "tier:full")).toBe(false);
  });

  it("accepts a permission array as well as a Set", () => {
    expect(can({ permissions: ["financials:view"] }, "financials:view")).toBe(true);
  });

  it("denies null / empty viewers", () => {
    expect(can(null, "tier:full")).toBe(false);
    expect(can({}, "tier:full")).toBe(false);
  });

  it("permissionsForRole matches the template exactly", () => {
    expect(permissionsForRole("TEAM_LEAD")).toEqual(
      new Set(SYSTEM_ROLE_GRANTS.TEAM_LEAD),
    );
    expect(permissionsForRole(null).size).toBe(0);
  });
});

describe("deriveEnumTier — legacy enum from a role's permissions", () => {
  it("maps the three system-role templates back to their enum", () => {
    expect(deriveEnumTier(SYSTEM_ROLE_GRANTS.MANAGER)).toBe("MANAGER");
    expect(deriveEnumTier(SYSTEM_ROLE_GRANTS.TEAM_LEAD)).toBe("TEAM_LEAD");
    expect(deriveEnumTier(SYSTEM_ROLE_GRANTS.RECRUITER)).toBe("RECRUITER");
  });

  it("classifies a custom role by its highest tier", () => {
    expect(deriveEnumTier(["tier:manager", "job:edit_rates"])).toBe("MANAGER");
    expect(deriveEnumTier(["tier:full", "requirement:manage"])).toBe("TEAM_LEAD");
    expect(deriveEnumTier(["orgentity:quickadd"])).toBe("RECRUITER");
    expect(deriveEnumTier([])).toBe("RECRUITER");
  });
});
