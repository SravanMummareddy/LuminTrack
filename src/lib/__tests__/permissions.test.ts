import { describe, it, expect } from "vitest";
import {
  isSensitiveCategory,
  canViewSensitiveDocs,
  canManageSensitiveDocs,
  canViewBenchCredentials,
} from "@/lib/permissions";
import { DocumentCategory, UserRole } from "@/generated/prisma/enums";

const ADMIN = { role: UserRole.ADMIN };
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
    canViewBenchCredentials,
  };

  for (const [name, gate] of Object.entries(gates)) {
    describe(name, () => {
      it("allows admins", () => {
        expect(gate(ADMIN)).toBe(true);
      });
      it("denies recruiters", () => {
        expect(gate(RECRUITER)).toBe(false);
      });
      it("denies null / undefined / role-less viewers", () => {
        expect(gate(null)).toBe(false);
        expect(gate(undefined)).toBe(false);
        // @ts-expect-error — exercising a malformed viewer at runtime
        expect(gate({})).toBe(false);
      });
    });
  }
});
