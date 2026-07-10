import { describe, it, expect } from "vitest";
import { collectSubmissionGates } from "@/server/submission-gates";

const NO_REASONS = {
  rate: "",
  candidateStatus: "",
  bench: "",
  convert: "",
  duplicate: "",
};

const clean = {
  isConvert: false,
  assignmentOk: true,
  rateWarnings: [] as string[],
  candidateStatusLabel: null as string | null,
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
      notMarketed: true,
      duplicateExistingId: "sub_1",
    });
    expect(gates.map((g) => g.kind)).toEqual([
      "not_assigned",
      "rate_chain",
      "candidate_status",
      "not_marketing",
      "duplicate",
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
