import { describe, it, expect } from "vitest";
import {
  primaryAdvance,
  branchActions,
  isTerminal,
  resumeFlag,
  isForwardAdvance,
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

describe("resumeFlag", () => {
  it("attached when a library résumé is linked", () => {
    expect(
      resumeFlag({ candidateResumeId: "r1", resumeBlobUrl: null, resumeWaivedAt: null }),
    ).toBe("attached");
  });

  it("attached when only a blob snapshot exists", () => {
    expect(
      resumeFlag({ candidateResumeId: null, resumeBlobUrl: "blob://x", resumeWaivedAt: null }),
    ).toBe("attached");
  });

  it("missing when no résumé and not waived", () => {
    expect(
      resumeFlag({ candidateResumeId: null, resumeBlobUrl: null, resumeWaivedAt: null }),
    ).toBe("missing");
  });

  it("waived when no résumé but a waiver is set", () => {
    expect(
      resumeFlag({ candidateResumeId: null, resumeBlobUrl: null, resumeWaivedAt: new Date() }),
    ).toBe("waived");
  });

  it("attachment wins over a stale waiver (attaching clears the flag)", () => {
    expect(
      resumeFlag({ candidateResumeId: "r1", resumeBlobUrl: null, resumeWaivedAt: new Date() }),
    ).toBe("attached");
  });
});

describe("isForwardAdvance", () => {
  it("is true for a forward pipeline move", () => {
    expect(isForwardAdvance("SUBMITTED", "RESUME_PICKED")).toBe(true);
    expect(isForwardAdvance("CLIENT_INTERVIEW", "SELECTED")).toBe(true);
    expect(isForwardAdvance("OFFER_ACCEPTED", "JOINED")).toBe(true);
  });

  it("is false for branch outcomes (Hold / Reject / Backed out)", () => {
    expect(isForwardAdvance("CLIENT_INTERVIEW", "REJECTED")).toBe(false);
    expect(isForwardAdvance("SUBMITTED", "ON_HOLD")).toBe(false);
    expect(isForwardAdvance("SELECTED", "BACKED_OUT")).toBe(false);
  });

  it("is false for a backward correction to an earlier stage", () => {
    expect(isForwardAdvance("CLIENT_INTERVIEW", "SUBMITTED")).toBe(false);
    expect(isForwardAdvance("OFFER_RELEASED", "SELECTED")).toBe(false);
  });
});
