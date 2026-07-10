import { describe, it, expect, vi } from "vitest";

// Mock @/server/db before importing the record helper so the Neon adapter is
// never constructed at import time (db.ts builds a PrismaNeon client).
vi.mock("@/server/db", () => ({
  prisma: {},
  isUniqueConstraintError: () => false,
}));

import {
  createSubmissionRecord,
  type SubmissionRecordInput,
} from "@/server/submission-create";

/** Minimal transaction-client mock covering only what createSubmissionRecord
 *  touches on the happy path (no duplicate, no iLabor gate, job already owned,
 *  an existing ACTIVE bench row so the bench sync early-returns). */
function makeTx() {
  const created = { id: "sub_new", seq: 1 };
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    submission: {
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(created),
    },
    jobAssignment: {
      // Already owned → the self-claim upsert branch is skipped.
      findFirst: vi.fn().mockResolvedValue({ id: "asg_1" }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    benchConsultant: {
      findUnique: vi.fn().mockResolvedValue({ id: "bc_1", marketingStatus: "ACTIVE" }),
      update: vi.fn().mockResolvedValue({}),
    },
    candidate: { findUnique: vi.fn().mockResolvedValue(null) },
    activity: { create: vi.fn().mockResolvedValue({}) },
  };
}

function baseInput(over: Partial<SubmissionRecordInput> = {}): SubmissionRecordInput {
  return {
    candidateId: "cand_1",
    jobId: "job_1",
    submittedById: "victim_recruiter",
    submissionNotes: null,
    engagement: null,
    vendorRecruiterName: null,
    jobDuties: null,
    payRate: null,
    billRate: null,
    clientRate: null,
    teamLead: null,
    pickedResume: null,
    duplicateReason: "",
    job: {
      id: "job_1",
      title: "Backend Engineer",
    },
    candidateFullName: "Ada Lovelace",
    actor: { id: "actor_self", fullName: "Ada", isAdmin: false },
    ...over,
  };
}

describe("createSubmissionRecord attribution guard (CR-01)", () => {
  it("forces a non-admin's submission to be credited to themselves, ignoring the form value", async () => {
    const tx = makeTx();
    const res = await createSubmissionRecord(
      tx as never,
      baseInput({
        submittedById: "victim_recruiter", // a colleague the recruiter tried to credit
        actor: { id: "actor_self", fullName: "Ada", isAdmin: false },
      }),
    );

    expect(res).toEqual({ kind: "created", submissionId: "sub_new" });
    // The written submission is attributed to the actor, NOT the form value.
    expect(tx.submission.create).toHaveBeenCalledTimes(1);
    expect(tx.submission.create.mock.calls[0][0].data.submittedById).toBe("actor_self");
    // And the bench-marketing credit follows the same corrected recruiter.
    expect(tx.benchConsultant.findUnique).toHaveBeenCalled();
  });

  it("honours the chosen recruiter for a privileged (admin) actor", async () => {
    const tx = makeTx();
    await createSubmissionRecord(
      tx as never,
      baseInput({
        submittedById: "other_recruiter",
        actor: { id: "manager_1", fullName: "Grace", isAdmin: true },
      }),
    );
    expect(tx.submission.create.mock.calls[0][0].data.submittedById).toBe("other_recruiter");
  });
});
