import { describe, it, expect } from "vitest";
import { collectSubmissionGates } from "@/server/submission-gates";

const NO_REASONS = {
  rate: "",
  candidateStatus: "",
  bench: "",
  convert: "",
  duplicate: "",
  ilabor: "",
};

const clean = {
  isConvert: false,
  assignmentOk: true,
  rateWarnings: [] as string[],
  candidateStatusLabel: null as string | null,
  notMarketed: false,
  convertWarnings: [] as string[],
  duplicateExistingId: null as string | null,
  ilaborClosed: false,
  ilaborCap: null as { cap: number; active: number } | null,
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
      notMarketed: true,
      duplicateExistingId: "sub_1",
      ilaborClosed: true,
      ilaborCap: { cap: 30, active: 31 },
    });
    expect(gates.map((g) => g.kind)).toEqual([
      "not_assigned",
      "rate_chain",
      "candidate_status",
      "not_marketing",
      "duplicate",
      "ilabor_closed",
      "ilabor_cap",
    ]);
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
      ilaborCap: { cap: 30, active: 45 },
    });
    expect(gates.find((g) => g.kind === "rate_chain")?.warnings).toEqual([
      "a",
      "b",
    ]);
    expect(
      gates.find((g) => g.kind === "duplicate")?.existingSubmissionId,
    ).toBe("sub_9");
    const cap = gates.find((g) => g.kind === "ilabor_cap");
    expect(cap?.cap).toBe(30);
    expect(cap?.active).toBe(45);
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

  it("iLabor closed and cap share one reason field", () => {
    const base = {
      ...clean,
      ilaborClosed: true,
      ilaborCap: { cap: 30, active: 30 },
    };
    expect(collectSubmissionGates(base).map((g) => g.kind)).toEqual([
      "ilabor_closed",
      "ilabor_cap",
    ]);
    expect(
      collectSubmissionGates({
        ...base,
        reasons: { ...NO_REASONS, ilabor: "CLIENT_APPROVED" },
      }),
    ).toEqual([]);
  });
});
