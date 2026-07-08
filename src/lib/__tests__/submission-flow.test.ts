import { describe, it, expect } from "vitest";
import {
  primaryAdvance,
  branchActions,
  isTerminal,
} from "@/lib/submission-flow";

describe("primaryAdvance", () => {
  it("advances one linear stage from Submitted", () => {
    expect(primaryAdvance("SUBMITTED")).toEqual({
      next: "RESUME_PICKED",
      label: "Advance to resume picked",
    });
  });

  it("frames the interview → decision fork as 'Mark selected'", () => {
    expect(primaryAdvance("CLIENT_INTERVIEW")).toEqual({
      next: "SELECTED",
      label: "Mark selected",
    });
  });

  it("advances a selected candidate to offer released", () => {
    expect(primaryAdvance("SELECTED")).toEqual({
      next: "OFFER_RELEASED",
      label: "Advance to offer released",
    });
  });

  it("frames the final step as 'Mark joined'", () => {
    expect(primaryAdvance("OFFER_ACCEPTED")).toEqual({
      next: "JOINED",
      label: "Mark joined",
    });
  });

  it("resumes an on-hold submission back into the pipeline", () => {
    expect(primaryAdvance("ON_HOLD")).toEqual({
      next: "CLIENT_INTERVIEW",
      label: "Resume to client interview",
    });
  });

  it("returns null for terminal statuses", () => {
    expect(primaryAdvance("JOINED")).toBeNull();
    expect(primaryAdvance("REJECTED")).toBeNull();
    expect(primaryAdvance("BACKED_OUT")).toBeNull();
  });
});

describe("branchActions", () => {
  it("offers hold + reject early in the pipeline, no backed-out", () => {
    expect(branchActions("SUBMITTED")).toEqual(["ON_HOLD", "REJECTED"]);
  });

  it("offers backed-out once selected, and still hold + reject", () => {
    expect(branchActions("SELECTED")).toEqual([
      "ON_HOLD",
      "REJECTED",
      "BACKED_OUT",
    ]);
  });

  it("drops hold after an offer is out, keeps reject + backed-out", () => {
    expect(branchActions("OFFER_RELEASED")).toEqual(["REJECTED", "BACKED_OUT"]);
  });

  it("does not offer hold again when already on hold", () => {
    expect(branchActions("ON_HOLD")).toEqual(["REJECTED"]);
  });

  it("offers nothing from a terminal status", () => {
    expect(branchActions("JOINED")).toEqual([]);
    expect(branchActions("REJECTED")).toEqual([]);
  });
});

describe("isTerminal", () => {
  it("flags the three end states", () => {
    expect(isTerminal("JOINED")).toBe(true);
    expect(isTerminal("REJECTED")).toBe(true);
    expect(isTerminal("BACKED_OUT")).toBe(true);
    expect(isTerminal("SUBMITTED")).toBe(false);
    expect(isTerminal("ON_HOLD")).toBe(false);
  });
});
