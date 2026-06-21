import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @/server/db BEFORE importing the lifecycle so the Neon adapter is never
// constructed (db.ts builds a PrismaNeon client at import time). We keep a real
// isUniqueConstraintError so the P2002 race path is exercised faithfully.
vi.mock("@/server/db", () => ({
  prisma: {},
  isUniqueConstraintError: (e: unknown) =>
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "P2002",
}));

import {
  ensurePlacementOnJoined,
  endOfPlacementCascade,
  terminatePlacementOnRevert,
} from "@/server/placement-lifecycle";

type ExistingPlacement = { id: string; seq: number; status: string } | null;

function makeTx(opts: {
  existing?: ExistingPlacement;
  activeCount?: number;
  createImpl?: () => Promise<{ id: string; seq: number }>;
} = {}) {
  return {
    candidate: { update: vi.fn().mockResolvedValue({}) },
    placement: {
      findUnique: vi.fn().mockResolvedValue(opts.existing ?? null),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn<
        (args: { data: Record<string, unknown> }) => Promise<{ id: string; seq: number }>
      >(opts.createImpl ?? (() => Promise.resolve({ id: "new-placement", seq: 7 }))),
      count: vi.fn().mockResolvedValue(opts.activeCount ?? 0),
    },
    activity: { create: vi.fn().mockResolvedValue({}) },
  };
}

// Collect the `action` of every logActivity call (which lands on activity.create).
const actions = (tx: ReturnType<typeof makeTx>) =>
  tx.activity.create.mock.calls.map((c) => c[0].data.action);

const baseJoinArgs = {
  submissionId: "sub1",
  candidateId: "cand1",
  jobId: "job1",
  candidateRate: null,
  candidateFullName: "Noah Davis",
  jobTitle: ".NET Developer",
  candidateStatus: "AVAILABLE",
  performedById: "user1",
};

describe("ensurePlacementOnJoined — fresh create", () => {
  let tx: ReturnType<typeof makeTx>;
  beforeEach(() => {
    tx = makeTx();
  });

  it("flips an AVAILABLE candidate to PLACED and logs the status change", async () => {
    await ensurePlacementOnJoined(tx as never, baseJoinArgs);
    expect(tx.candidate.update).toHaveBeenCalledWith({
      where: { id: "cand1" },
      data: { status: "PLACED" },
    });
    expect(actions(tx)).toContain("CANDIDATE_STATUS_CHANGED");
    expect(actions(tx)).toContain("PLACEMENT_CREATED");
  });

  it("creates the placement with placementDate defaulting to the start date", async () => {
    const eventAt = new Date("2026-06-15T00:00:00.000Z");
    await ensurePlacementOnJoined(tx as never, { ...baseJoinArgs, eventAt });
    const data = tx.placement.create.mock.calls[0][0].data;
    expect(data.startDate).toEqual(eventAt);
    expect(data.placementDate).toEqual(eventAt); // my lifecycle default
    expect(data.submissionId).toBe("sub1");
  });

  it("seeds bill/pay to 0 when the submission has no candidate rate", async () => {
    await ensurePlacementOnJoined(tx as never, baseJoinArgs);
    const data = tx.placement.create.mock.calls[0][0].data;
    expect(data.billRate).toBe(0);
    expect(data.payRate).toBe(0);
  });

  it("does NOT re-log a status change when the candidate is already PLACED", async () => {
    await ensurePlacementOnJoined(tx as never, {
      ...baseJoinArgs,
      candidateStatus: "PLACED",
    });
    expect(tx.candidate.update).not.toHaveBeenCalled();
    expect(actions(tx)).toEqual(["PLACEMENT_CREATED"]);
  });
});

describe("ensurePlacementOnJoined — idempotency / races", () => {
  it("no-ops on an existing ACTIVE placement (concurrent JOINED race)", async () => {
    const tx = makeTx({ existing: { id: "p9", seq: 9, status: "ACTIVE" } });
    const res = await ensurePlacementOnJoined(tx as never, baseJoinArgs);
    expect(res.placementId).toBe("p9");
    expect(tx.placement.create).not.toHaveBeenCalled();
    expect(tx.placement.update).not.toHaveBeenCalled();
  });

  it("no-ops on an existing EXTENDED placement", async () => {
    const tx = makeTx({ existing: { id: "p9", seq: 9, status: "EXTENDED" } });
    const res = await ensurePlacementOnJoined(tx as never, baseJoinArgs);
    expect(res.placementId).toBe("p9");
    expect(tx.placement.create).not.toHaveBeenCalled();
  });

  it("reactivates a TERMINATED placement instead of creating a new one", async () => {
    const tx = makeTx({ existing: { id: "p9", seq: 9, status: "TERMINATED" } });
    const res = await ensurePlacementOnJoined(tx as never, baseJoinArgs);
    expect(res.placementId).toBe("p9");
    expect(tx.placement.create).not.toHaveBeenCalled();
    expect(tx.placement.update).toHaveBeenCalledWith({
      where: { id: "p9" },
      data: { status: "ACTIVE", endReason: null, endNote: null, endDate: null },
    });
    expect(actions(tx)).toContain("PLACEMENT_UPDATED");
  });

  it("reactivates an ENDED placement too", async () => {
    const tx = makeTx({ existing: { id: "p9", seq: 9, status: "ENDED" } });
    await ensurePlacementOnJoined(tx as never, baseJoinArgs);
    expect(tx.placement.update).toHaveBeenCalled();
    expect(tx.placement.create).not.toHaveBeenCalled();
  });

  it("swallows a P2002 create race and returns a null placementId", async () => {
    const tx = makeTx({
      createImpl: () => Promise.reject({ code: "P2002" }),
    });
    const res = await ensurePlacementOnJoined(tx as never, baseJoinArgs);
    expect(res.placementId).toBeNull();
  });

  it("rethrows a non-unique-constraint create error", async () => {
    const tx = makeTx({
      createImpl: () => Promise.reject({ code: "P2010" }),
    });
    await expect(
      ensurePlacementOnJoined(tx as never, baseJoinArgs),
    ).rejects.toMatchObject({ code: "P2010" });
  });
});

describe("endOfPlacementCascade — candidate AVAILABLE flip", () => {
  const cascadeArgs = {
    candidateId: "cand1",
    candidateFullName: "Noah Davis",
    candidateStatus: "PLACED",
    performedById: "user1",
  };

  it("flips PLACED → AVAILABLE when no active placements remain", async () => {
    const tx = makeTx({ activeCount: 0 });
    await endOfPlacementCascade(tx as never, cascadeArgs);
    expect(tx.candidate.update).toHaveBeenCalledWith({
      where: { id: "cand1" },
      data: { status: "AVAILABLE" },
    });
    expect(actions(tx)).toContain("CANDIDATE_STATUS_CHANGED");
  });

  it("does NOT flip while another active placement exists", async () => {
    const tx = makeTx({ activeCount: 1 });
    await endOfPlacementCascade(tx as never, cascadeArgs);
    expect(tx.candidate.update).not.toHaveBeenCalled();
  });

  it("preserves a NOT_INTERESTED / DO_NOT_CONTACT candidate (only PLACED auto-flips)", async () => {
    const tx = makeTx({ activeCount: 0 });
    await endOfPlacementCascade(tx as never, {
      ...cascadeArgs,
      candidateStatus: "DO_NOT_CONTACT",
    });
    expect(tx.placement.count).not.toHaveBeenCalled();
    expect(tx.candidate.update).not.toHaveBeenCalled();
  });
});

describe("terminatePlacementOnRevert", () => {
  it("marks the placement TERMINATED with a system note and runs the cascade", async () => {
    const tx = makeTx({ activeCount: 0 });
    await terminatePlacementOnRevert(tx as never, {
      placementId: "p9",
      candidateId: "cand1",
      candidateFullName: "Noah Davis",
      candidateStatus: "PLACED",
      newSubmissionStatus: "SELECTED",
      performedById: "user1",
    });
    const update = tx.placement.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "p9" });
    expect(update.data.status).toBe("TERMINATED");
    expect(update.data.endReason).toBe("OTHER");
    expect(update.data.endNote).toContain("SELECTED");
    // PLACEMENT_ENDED, then the cascade's CANDIDATE_STATUS_CHANGED (count was 0).
    expect(actions(tx)).toContain("PLACEMENT_ENDED");
    expect(actions(tx)).toContain("CANDIDATE_STATUS_CHANGED");
  });
});
