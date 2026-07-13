import { describe, it, expect } from "vitest";
import {
  isSensitiveCategory,
  canViewSensitiveDocs,
  canManageSensitiveDocs,
  canViewBenchCredentials,
  canManageRequirements,
  canEditJobRatesAndAssignment,
  hasFullAccess,
  isManagerTier,
  canManageOrgEntities,
  canManageUsers,
  canQuickAddOrgEntities,
} from "@/lib/permissions";
import { DocumentCategory, UserRole } from "@/generated/prisma/enums";

const MANAGER = { role: UserRole.MANAGER };
const TEAM_LEAD = { role: UserRole.TEAM_LEAD };
const RECRUITER = { role: UserRole.RECRUITER };

describe("permissions — sensitive document categories", () => {
  it("classifies Identity and Work Auth as sensitive", () => {
    expect(isSensitiveCategory("IDENTITY")).toBe(true);
    expect(isSensitiveCategory("WORK_AUTH")).toBe(true);
  });

  it("classifies Education, Employment, Other as NOT sensitive", () => {
    expect(isSensitiveCategory("EDUCATION")).toBe(false);
    expect(isSensitiveCategory("EMPLOYMENT")).toBe(false);
    expect(isSensitiveCategory("OTHER")).toBe(false);
  });

  // Meta-test: every DocumentCategory must be classifiable without throwing, so a
  // future category addition forces a conscious sensitive/not-sensitive decision.
  it("classifies every DocumentCategory deterministically", () => {
    for (const cat of Object.values(DocumentCategory)) {
      expect(typeof isSensitiveCategory(cat)).toBe("boolean");
    }
  });
});

describe("permissions — gates default to deny", () => {
  // The credential-wipe bug taught us: the boundary must live in the gate, and a
  // null/undefined/role-less viewer must NEVER pass. These assertions lock that in.
  const gates = {
    canViewSensitiveDocs,
    canManageSensitiveDocs,
    canManageRequirements,
    canEditJobRatesAndAssignment,
    hasFullAccess,
  };

  for (const [name, gate] of Object.entries(gates)) {
    describe(name, () => {
      it("allows managers", () => {
        expect(gate(MANAGER)).toBe(true);
      });
      it("allows team leads", () => {
        expect(gate(TEAM_LEAD)).toBe(true);
      });
      it("denies recruiters", () => {
        // canManageRequirements now ALLOWS recruiters (owner decision 2026-07-13
        // — recruiters create/edit VPRs); every other gate here still denies them.
        expect(gate(RECRUITER)).toBe(name === "canManageRequirements");
      });
      it("denies null / undefined / role-less viewers", () => {
        expect(gate(null)).toBe(false);
        expect(gate(undefined)).toBe(false);
        expect(gate({})).toBe(false);
      });
    });
  }

  // Bench credentials are the exception: ANY signed-in user (incl. recruiters)
  // may view/edit them so they can reach out to and market consultants (owner
  // decision 2026-07-08). Still denies null/undefined/role-less viewers.
  describe("canViewBenchCredentials", () => {
    it("allows managers, team leads, AND recruiters", () => {
      expect(canViewBenchCredentials(MANAGER)).toBe(true);
      expect(canViewBenchCredentials(TEAM_LEAD)).toBe(true);
      expect(canViewBenchCredentials(RECRUITER)).toBe(true);
    });
    it("denies null / undefined / role-less viewers", () => {
      expect(canViewBenchCredentials(null)).toBe(false);
      expect(canViewBenchCredentials(undefined)).toBe(false);
      expect(canViewBenchCredentials({})).toBe(false);
    });
  });
});

// Wave 1a (owner 2026-07-11): the nav/financial/analytics boundary is narrower
// than hasFullAccess — team leads are RESTRICTED here alongside recruiters. The
// Settings-only powers (org-entity curation, user admin) move to this tier too.
describe("permissions — manager-tier gates DENY team leads", () => {
  const managerOnly = { isManagerTier, canManageOrgEntities, canManageUsers };
  for (const [name, gate] of Object.entries(managerOnly)) {
    describe(name, () => {
      it("allows managers", () => {
        expect(gate(MANAGER)).toBe(true);
      });
      it("DENIES team leads (the key Wave 1a shift)", () => {
        expect(gate(TEAM_LEAD)).toBe(false);
      });
      it("denies recruiters", () => {
        expect(gate(RECRUITER)).toBe(false);
      });
      it("denies null / undefined / role-less viewers", () => {
        expect(gate(null)).toBe(false);
        expect(gate(undefined)).toBe(false);
        expect(gate({})).toBe(false);
      });
    });
  }

  // A team lead stays in the restricted nav tier but KEEPS its operational
  // powers — chiefly VPR management (Vendor Portal is in their nav).
  it("team leads keep canManageRequirements despite losing the manager tier", () => {
    expect(isManagerTier(TEAM_LEAD)).toBe(false);
    expect(canManageRequirements(TEAM_LEAD)).toBe(true);
  });
});

// Quick-add is the escape hatch: recruiters/TL can CREATE a client/vendor inline
// while working, even though curation is manager-only.
describe("canQuickAddOrgEntities", () => {
  it("allows managers, team leads, AND recruiters", () => {
    expect(canQuickAddOrgEntities(MANAGER)).toBe(true);
    expect(canQuickAddOrgEntities(TEAM_LEAD)).toBe(true);
    expect(canQuickAddOrgEntities(RECRUITER)).toBe(true);
  });
  it("denies null / undefined / role-less viewers", () => {
    expect(canQuickAddOrgEntities(null)).toBe(false);
    expect(canQuickAddOrgEntities(undefined)).toBe(false);
    expect(canQuickAddOrgEntities({})).toBe(false);
  });
});
