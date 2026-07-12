import { describe, it, expect } from "vitest";
import {
  collectSubmissionGates,
  workAuthExpiredOn,
} from "@/server/submission-gates";

const NO_REASONS = {
  rate: "",
  candidateStatus: "",
  workAuth: "",
  originalResume: "",
  bench: "",
  convert: "",
  duplicate: "",
};

const clean = {
  isConvert: false,
  assignmentOk: true,
  rateWarnings: [] as string[],
  candidateStatusLabel: null as string | null,
  workAuthExpiredOn: null as string | null,
  missingOriginalResume: false,
  notMarketed: false,
  convertWarnings: [] as string[],
  duplicateExistingId: null as string | null,
  reasons: NO_REASONS,
};

describe("collectSubmissionGates", () => {
  it("returns no gates when everything is clean", () => {
    expect(collectSubmissionGates(clean)).toEqual([]);
  });

  it("stacks every gate that fires, in render order", () => {
    const gates = collectSubmissionGates({
      ...clean,
      assignmentOk: false,
      rateWarnings: ["pay > bill"],
      candidateStatusLabel: "Do not contact",
      workAuthExpiredOn: "Jan 1, 2026",
      missingOriginalResume: true,
      notMarketed: true,
      duplicateExistingId: "sub_1",
    });
    expect(gates.map((g) => g.kind)).toEqual([
      "not_assigned",
      "rate_chain",
      "candidate_status",
      "work_auth",
      "no_original_resume",
      "not_marketing",
      "duplicate",
    ]);
  });

  it("fires the no_original_resume gate, cleared by a reason", () => {
    const base = { ...clean, missingOriginalResume: true };
    expect(collectSubmissionGates(base).map((g) => g.kind)).toEqual([
      "no_original_resume",
    ]);
    expect(
      collectSubmissionGates({
        ...base,
        reasons: { ...NO_REASONS, originalResume: "client waived it" },
      }),
    ).toEqual([]);
  });

  it("fires the work_auth gate with a dated message, cleared by a reason", () => {
    const base = { ...clean, workAuthExpiredOn: "Jan 1, 2026" };
    const [gate] = collectSubmissionGates(base);
    expect(gate.kind).toBe("work_auth");
    expect(gate.message).toContain("Jan 1, 2026");
    expect(
      collectSubmissionGates({
        ...base,
        reasons: { ...NO_REASONS, workAuth: "renewal pending" },
      }),
    ).toEqual([]);
  });

  it("drops a gate once its reason is supplied", () => {
    const base = {
      ...clean,
      candidateStatusLabel: "Not interested",
      notMarketed: true,
      duplicateExistingId: "sub_1",
    };
    expect(collectSubmissionGates(base).map((g) => g.kind)).toEqual([
      "candidate_status",
      "not_marketing",
      "duplicate",
    ]);
    const withReasons = collectSubmissionGates({
      ...base,
      reasons: {
        ...NO_REASONS,
        candidateStatus: "ok",
        bench: "ending",
        duplicate: "ROLE_REBOOTED",
      },
    });
    expect(withReasons).toEqual([]);
  });

  it("carries the aux data each gate needs", () => {
    const gates = collectSubmissionGates({
      ...clean,
      rateWarnings: ["a", "b"],
      duplicateExistingId: "sub_9",
    });
    expect(gates.find((g) => g.kind === "rate_chain")?.warnings).toEqual([
      "a",
      "b",
    ]);
    expect(
      gates.find((g) => g.kind === "duplicate")?.existingSubmissionId,
    ).toBe("sub_9");
  });

  it("convert warnings collapse into one gate cleared by one reason", () => {
    const base = {
      ...clean,
      isConvert: true,
      convertWarnings: ["placed", "rates pending"],
    };
    const gates = collectSubmissionGates(base);
    expect(gates).toHaveLength(1);
    expect(gates[0].kind).toBe("convert_warn");
    expect(gates[0].warnings).toEqual(["placed", "rates pending"]);
    expect(
      collectSubmissionGates({
        ...base,
        reasons: { ...NO_REASONS, convert: "why" },
      }),
    ).toEqual([]);
  });
});

describe("workAuthExpiredOn", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const past = new Date("2026-01-01T00:00:00Z");
  const future = new Date("2027-01-01T00:00:00Z");

  it("returns null when there are no work-auth documents", () => {
    expect(workAuthExpiredOn([], now)).toBeNull();
  });

  it("returns null when a doc has no expiry (permanent authorization)", () => {
    expect(workAuthExpiredOn([{ expiresAt: null }], now)).toBeNull();
  });

  it("returns null when at least one doc is still valid (renewed)", () => {
    // Old expired doc still in the library + a valid new one → covered.
    expect(
      workAuthExpiredOn([{ expiresAt: past }, { expiresAt: future }], now),
    ).toBeNull();
  });

  it("returns the latest expiry when every doc has expired", () => {
    const earlier = new Date("2025-06-01T00:00:00Z");
    expect(
      workAuthExpiredOn([{ expiresAt: earlier }, { expiresAt: past }], now),
    ).toEqual(past);
  });
});
