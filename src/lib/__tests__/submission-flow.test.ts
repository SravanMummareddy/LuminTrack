import { describe, it, expect } from "vitest";
import type { InterviewResult } from "@/generated/prisma/enums";
import type { RoundLite } from "@/lib/submission-flow";
import {
  primaryAdvance,
  branchActions,
  isTerminal,
  resumeFlag,
  isForwardAdvance,
  deriveStageDates,
  previousStage,
  isBackwardCorrection,
  advanceBlock,
  stageForRoundType,
  highestInterviewStage,
  statusForResult,
  resolveCouplingTarget,
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

describe("deriveStageDates", () => {
  const submittedAt = new Date("2026-06-24T09:00:00Z");

  it("seeds stage 0 from submittedAt and maps status labels to stages", () => {
    const dates = deriveStageDates(
      [
        { newValue: "Resume Picked", eventAt: new Date("2026-06-26T10:00:00Z"), createdAt: new Date("2026-06-26T11:00:00Z") },
        { newValue: "Client Interview", eventAt: new Date("2026-07-08T10:00:00Z"), createdAt: new Date("2026-07-08T10:00:00Z") },
      ],
      submittedAt,
    );
    expect(dates[0]).toEqual(submittedAt);
    expect(dates[1]).toEqual(new Date("2026-06-26T10:00:00Z")); // eventAt wins over createdAt
    expect(dates[3]).toEqual(new Date("2026-07-08T10:00:00Z"));
    expect(dates[2]).toBeUndefined(); // vendor screen never reached
  });

  it("keeps the earliest time when a stage is entered more than once", () => {
    const dates = deriveStageDates(
      [
        { newValue: "Client Interview", eventAt: new Date("2026-07-10T10:00:00Z"), createdAt: new Date("2026-07-10T10:00:00Z") },
        { newValue: "Client Interview", eventAt: new Date("2026-07-08T10:00:00Z"), createdAt: new Date("2026-07-08T10:00:00Z") },
      ],
      submittedAt,
    );
    expect(dates[3]).toEqual(new Date("2026-07-08T10:00:00Z"));
  });

  it("falls back to createdAt when eventAt is null and ignores unknown labels", () => {
    const dates = deriveStageDates(
      [
        { newValue: "Resume Picked", eventAt: null, createdAt: new Date("2026-06-26T11:00:00Z") },
        { newValue: "Note added", eventAt: null, createdAt: new Date("2026-06-27T11:00:00Z") },
      ],
      submittedAt,
    );
    expect(dates[1]).toEqual(new Date("2026-06-26T11:00:00Z"));
    expect(Object.keys(dates)).toEqual(["0", "1"]);
  });
});

describe("previousStage", () => {
  it("steps back one visual stage on the linear path", () => {
    expect(previousStage("CLIENT_INTERVIEW")).toBe("VENDOR_SCREENING_CALL");
    expect(previousStage("JOINED")).toBe("OFFER_ACCEPTED");
  });

  it("reopens a decision-branch outcome to client interview", () => {
    expect(previousStage("REJECTED")).toBe("CLIENT_INTERVIEW");
    expect(previousStage("BACKED_OUT")).toBe("CLIENT_INTERVIEW");
  });

  it("returns null at the first stage", () => {
    expect(previousStage("SUBMITTED")).toBeNull();
  });
});

describe("isBackwardCorrection", () => {
  it("is true for a genuine step back", () => {
    expect(isBackwardCorrection("CLIENT_INTERVIEW", "VENDOR_SCREENING_CALL")).toBe(true);
    expect(isBackwardCorrection("REJECTED", "CLIENT_INTERVIEW")).toBe(true);
    expect(isBackwardCorrection("JOINED", "OFFER_ACCEPTED")).toBe(true);
  });

  it("is false for the on-hold resume (re-enters earlier legitimately)", () => {
    expect(isBackwardCorrection("ON_HOLD", "CLIENT_INTERVIEW")).toBe(false);
  });

  it("is false for branch outcomes and forward moves", () => {
    expect(isBackwardCorrection("CLIENT_INTERVIEW", "REJECTED")).toBe(false);
    expect(isBackwardCorrection("SUBMITTED", "RESUME_PICKED")).toBe(false);
  });
});

describe("advanceBlock (SB-5 strict gate)", () => {
  const vs = (
    result: InterviewResult = "COMPLETED",
    roundOrder = 1,
  ): RoundLite => ({ interviewType: "VENDOR_SCREENING", result, roundOrder });
  const ci = (
    result: InterviewResult = "WAITING",
    roundOrder = 2,
  ): RoundLite => ({ interviewType: "CLIENT_INTERVIEW", result, roundOrder });

  it("blocks reaching vendor screening without a screening round", () => {
    expect(advanceBlock("RESUME_PICKED", "VENDOR_SCREENING_CALL", [])).toMatch(
      /vendor screening call first/i,
    );
    expect(
      advanceBlock("RESUME_PICKED", "VENDOR_SCREENING_CALL", [vs("WAITING")]),
    ).toBeNull();
  });

  it("blocks reaching client interview without an interview round (incl. the vendor-screen skip)", () => {
    expect(advanceBlock("VENDOR_SCREENING_CALL", "CLIENT_INTERVIEW", [vs()])).toMatch(
      /schedule the client interview/i,
    );
    // The vendor-screen skip is a Resume-picked → Client-interview advance, so it
    // hits the same gate — no orphan state.
    expect(advanceBlock("RESUME_PICKED", "CLIENT_INTERVIEW", [])).toMatch(
      /schedule the client interview/i,
    );
    expect(
      advanceBlock("RESUME_PICKED", "CLIENT_INTERVIEW", [ci("WAITING")]),
    ).toBeNull();
  });

  it("won't leave a stage whose scheduled interview is still WAITING", () => {
    expect(
      advanceBlock("VENDOR_SCREENING_CALL", "CLIENT_INTERVIEW", [vs("WAITING"), ci("WAITING")]),
    ).toMatch(/vendor screening outcome/i);
    // A "didn't happen" outcome counts as recorded — clears the leave-gate.
    expect(
      advanceBlock("VENDOR_SCREENING_CALL", "CLIENT_INTERVIEW", [vs("NO_SHOW"), ci("WAITING")]),
    ).toBeNull();
  });

  it("requires a passing interview result to mark Selected", () => {
    // WAITING is caught by the leave-gate first; NEED_ANOTHER_ROUND falls to the
    // Selected pass-check. Either way Selected is blocked.
    expect(advanceBlock("CLIENT_INTERVIEW", "SELECTED", [ci("WAITING")])).toMatch(
      /interview result/i,
    );
    expect(
      advanceBlock("CLIENT_INTERVIEW", "SELECTED", [ci("NEED_ANOTHER_ROUND")]),
    ).toMatch(/passing interview result/i);
    expect(advanceBlock("CLIENT_INTERVIEW", "SELECTED", [ci("SELECTED")])).toBeNull();
  });

  it("requires join dates for offer-accepted and joined", () => {
    expect(advanceBlock("OFFER_RELEASED", "OFFER_ACCEPTED", [])).toMatch(/expected join date/i);
    expect(
      advanceBlock("OFFER_RELEASED", "OFFER_ACCEPTED", [], { hasExpectedJoinDate: true }),
    ).toBeNull();
    expect(advanceBlock("OFFER_ACCEPTED", "JOINED", [])).toMatch(/actual join date/i);
    expect(
      advanceBlock("OFFER_ACCEPTED", "JOINED", [], { hasActualJoinDate: true }),
    ).toBeNull();
  });

  it("never gates branch outcomes or backward corrections", () => {
    expect(advanceBlock("CLIENT_INTERVIEW", "REJECTED", [])).toBeNull();
    expect(advanceBlock("CLIENT_INTERVIEW", "ON_HOLD", [])).toBeNull();
    expect(advanceBlock("CLIENT_INTERVIEW", "VENDOR_SCREENING_CALL", [])).toBeNull();
  });

  it("lets an OTHER-type client round reach Selected (F10 — OTHER is client-family)", () => {
    // OTHER enters CLIENT_INTERVIEW via stageForRoundType, so the client-stage
    // gates must accept it too — else an OTHER-only submission dead-ends short of
    // Selected, the same class of bug F7 fixed for Manager/HR/Final.
    const other = (result: InterviewResult): RoundLite => ({
      interviewType: "OTHER",
      result,
      roundOrder: 1,
    });
    expect(
      advanceBlock("RESUME_PICKED", "CLIENT_INTERVIEW", [other("WAITING")]),
    ).toBeNull();
    expect(
      advanceBlock("CLIENT_INTERVIEW", "SELECTED", [other("SELECTED")]),
    ).toBeNull();
    expect(highestInterviewStage([{ interviewType: "OTHER" }])).toBe(
      "CLIENT_INTERVIEW",
    );
  });

  it("no longer treats COMPLETED as a passing result (H2)", () => {
    const ci: RoundLite = {
      interviewType: "CLIENT_INTERVIEW",
      result: "COMPLETED",
      roundOrder: 1,
    };
    expect(advanceBlock("CLIENT_INTERVIEW", "SELECTED", [ci])).toMatch(
      /passing interview result/i,
    );
  });
});

describe("statusForResult (H2 coupling)", () => {
  it("maps the decisive outcomes to their submission status", () => {
    expect(statusForResult("SELECTED")).toBe("SELECTED");
    expect(statusForResult("REJECTED")).toBe("REJECTED");
    expect(statusForResult("ON_HOLD")).toBe("ON_HOLD");
  });

  it("keeps the submission put for the in-stage / legacy outcomes", () => {
    for (const r of [
      "WAITING",
      "NEED_ANOTHER_ROUND",
      "NO_SHOW",
      "CANCELLED",
      "COMPLETED",
    ] as InterviewResult[])
      expect(statusForResult(r)).toBeNull();
  });
});

describe("resolveCouplingTarget (H2 coupling validity gate)", () => {
  it("drives SELECTED forward from an interview stage", () => {
    expect(resolveCouplingTarget("CLIENT_INTERVIEW", "SELECTED")).toBe(
      "SELECTED",
    );
    expect(resolveCouplingTarget("VENDOR_SCREENING_CALL", "SELECTED")).toBe(
      "SELECTED",
    );
  });

  it("never drags an offer-stage submission BACK to Selected (correctness #1)", () => {
    expect(resolveCouplingTarget("OFFER_RELEASED", "SELECTED")).toBeNull();
    expect(resolveCouplingTarget("OFFER_ACCEPTED", "SELECTED")).toBeNull();
  });

  it("allows Reject from any live stage but not once terminal", () => {
    expect(resolveCouplingTarget("CLIENT_INTERVIEW", "REJECTED")).toBe(
      "REJECTED",
    );
    expect(resolveCouplingTarget("OFFER_RELEASED", "REJECTED")).toBe("REJECTED");
    expect(resolveCouplingTarget("JOINED", "REJECTED")).toBeNull();
    expect(resolveCouplingTarget("REJECTED", "REJECTED")).toBeNull();
  });

  it("allows Hold through the decision stage but not past it (correctness #2)", () => {
    expect(resolveCouplingTarget("CLIENT_INTERVIEW", "ON_HOLD")).toBe("ON_HOLD");
    expect(resolveCouplingTarget("SELECTED", "ON_HOLD")).toBe("ON_HOLD");
    // Past the decision the manual pipeline offers no Hold, so coupling won't either.
    expect(resolveCouplingTarget("OFFER_RELEASED", "ON_HOLD")).toBeNull();
    expect(resolveCouplingTarget("ON_HOLD", "ON_HOLD")).toBeNull();
  });

  it("is a no-op for the non-decisive outcomes", () => {
    for (const r of [
      "WAITING",
      "NEED_ANOTHER_ROUND",
      "NO_SHOW",
      "CANCELLED",
      "COMPLETED",
    ] as InterviewResult[])
      expect(resolveCouplingTarget("CLIENT_INTERVIEW", r)).toBeNull();
  });
});

describe("stageForRoundType (Model B rounds-first)", () => {
  it("a vendor-screening round enters the vendor-screening stage", () => {
    expect(stageForRoundType("VENDOR_SCREENING")).toBe("VENDOR_SCREENING_CALL");
  });

  it("every client-side round type enters the client-interview stage", () => {
    for (const t of [
      "CLIENT_INTERVIEW",
      "MANAGER_ROUND",
      "HR_ROUND",
      "FINAL_ROUND",
      "OTHER",
    ] as const) {
      expect(stageForRoundType(t)).toBe("CLIENT_INTERVIEW");
    }
  });
});

describe("advanceBlock — Selected accepts any client-family round (F7 dead-end fix)", () => {
  it("a passing Manager/HR/Final/Client round unblocks Selected", () => {
    for (const t of ["CLIENT_INTERVIEW", "MANAGER_ROUND", "HR_ROUND", "FINAL_ROUND"] as const) {
      const rounds: RoundLite[] = [{ interviewType: t, result: "SELECTED", roundOrder: 1 }];
      expect(advanceBlock("CLIENT_INTERVIEW", "SELECTED", rounds)).toBeNull();
    }
  });

  it("still blocks Selected when the only round is a vendor screen", () => {
    const rounds: RoundLite[] = [
      { interviewType: "VENDOR_SCREENING", result: "SELECTED", roundOrder: 1 },
    ];
    expect(advanceBlock("CLIENT_INTERVIEW", "SELECTED", rounds)).not.toBeNull();
  });
});

describe("highestInterviewStage (delete-revert helper)", () => {
  it("any client-family round → CLIENT_INTERVIEW", () => {
    expect(highestInterviewStage([{ interviewType: "HR_ROUND" }])).toBe("CLIENT_INTERVIEW");
  });
  it("only a vendor round → VENDOR_SCREENING_CALL", () => {
    expect(highestInterviewStage([{ interviewType: "VENDOR_SCREENING" }])).toBe(
      "VENDOR_SCREENING_CALL",
    );
  });
  it("no rounds → null", () => {
    expect(highestInterviewStage([])).toBeNull();
  });
});
