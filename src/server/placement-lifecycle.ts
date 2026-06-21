// R4.2 — placement lifecycle helpers shared between the submission status-
// change action and the placement actions. Every helper expects a Prisma
// transaction client so the caller can compose writes + audit log atomically.

import type { Prisma } from "@/generated/prisma/client";
import { logActivity } from "@/server/activity";
import { isUniqueConstraintError } from "@/server/db";

type Tx = Prisma.TransactionClient;

/**
 * Auto-creates a Placement when a submission flips to JOINED, and flips the
 * candidate's engagement status to PLACED. Idempotent: if a Placement already
 * exists for this submission (P2002 on the unique `submissionId`), it no-ops —
 * this is the concurrent-JOINED race protection mentioned in the plan.
 *
 * Caller must wrap in `prisma.$transaction`.
 */
export async function ensurePlacementOnJoined(
  tx: Tx,
  args: {
    submissionId: string;
    candidateId: string;
    jobId: string;
    candidateRate: Prisma.Decimal | null;
    candidateFullName: string;
    jobTitle: string;
    candidateStatus: string; // CandidateStatus enum value
    performedById: string;
    eventAt?: Date | null;
  },
): Promise<{ placementId: string | null }> {
  // Bump Candidate.status → PLACED unless it's already there.
  if (args.candidateStatus !== "PLACED") {
    await tx.candidate.update({
      where: { id: args.candidateId },
      data: { status: "PLACED" },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "CANDIDATE_STATUS_CHANGED",
      description: `${args.candidateFullName}: status changed from ${args.candidateStatus} to PLACED (placement created)`,
      oldValue: args.candidateStatus,
      newValue: "PLACED",
      performedById: args.performedById,
      candidateId: args.candidateId,
    });
  }

  // Reactivate a pre-existing placement if the submission was previously JOINED
  // → reverted → re-JOINED. Otherwise the placement would stay TERMINATED while
  // the candidate is flagged PLACED, leaving the two out of sync. This must
  // come before the `create` path so we don't trip the `submissionId @unique`.
  const existing = await tx.placement.findUnique({
    where: { submissionId: args.submissionId },
    select: { id: true, seq: true, status: true },
  });
  if (existing) {
    if (existing.status === "ACTIVE" || existing.status === "EXTENDED") {
      // Already live — concurrent JOINED race, no-op.
      return { placementId: existing.id };
    }
    await tx.placement.update({
      where: { id: existing.id },
      data: {
        status: "ACTIVE",
        endReason: null,
        endNote: null,
        endDate: null,
      },
    });
    await logActivity(tx, {
      entityType: "SUBMISSION",
      action: "PLACEMENT_UPDATED",
      description: `Placement PLC-${String(existing.seq).padStart(3, "0")} reactivated (submission re-JOINED)`,
      note: "reactivated",
      performedById: args.performedById,
      submissionId: args.submissionId,
      candidateId: args.candidateId,
      jobId: args.jobId,
    });
    return { placementId: existing.id };
  }

  // Auto-create the Placement. Rates seed from the submission's candidateRate;
  // a $0/$0 placement is acceptable and flagged in the UI as "Rates pending."
  const seedRate = args.candidateRate ?? 0;
  const startDate = args.eventAt ?? new Date();
  try {
    const placement = await tx.placement.create({
      data: {
        submissionId: args.submissionId,
        candidateId: args.candidateId,
        jobId: args.jobId,
        startDate,
        // "Date of Placement" defaults to the JOINED date; recruiter can edit.
        placementDate: startDate,
        billRate: seedRate,
        payRate: seedRate,
      },
      select: { id: true, seq: true },
    });
    await logActivity(tx, {
      entityType: "SUBMISSION",
      action: "PLACEMENT_CREATED",
      description: `Placement PLC-${String(placement.seq).padStart(3, "0")} created for ${args.candidateFullName} on "${args.jobTitle}"`,
      performedById: args.performedById,
      submissionId: args.submissionId,
      candidateId: args.candidateId,
      jobId: args.jobId,
    });
    return { placementId: placement.id };
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      // Race: another tab already created the Placement between our findUnique
      // and create. No-op.
      return { placementId: null };
    }
    throw e;
  }
}

/**
 * Fires when a placement transitions out of ACTIVE/EXTENDED. If the candidate
 * has zero remaining ACTIVE/EXTENDED placements, flips Candidate.status to
 * AVAILABLE (provided current status is PLACED — we don't override
 * NOT_INTERESTED / DO_NOT_CONTACT).
 *
 * Caller must wrap in `prisma.$transaction`.
 */
export async function endOfPlacementCascade(
  tx: Tx,
  args: {
    candidateId: string;
    candidateFullName: string;
    candidateStatus: string;
    performedById: string;
  },
): Promise<void> {
  // Only PLACED candidates are eligible for the auto-flip. If they're already
  // AVAILABLE / NOT_INTERESTED / DO_NOT_CONTACT, the recruiter's intent stays.
  if (args.candidateStatus !== "PLACED") return;

  const stillActive = await tx.placement.count({
    where: {
      candidateId: args.candidateId,
      status: { in: ["ACTIVE", "EXTENDED"] },
    },
  });
  if (stillActive > 0) return;

  await tx.candidate.update({
    where: { id: args.candidateId },
    data: { status: "AVAILABLE" },
  });
  await logActivity(tx, {
    entityType: "CANDIDATE",
    action: "CANDIDATE_STATUS_CHANGED",
    description: `${args.candidateFullName}: status changed from PLACED to AVAILABLE (no active placements)`,
    oldValue: "PLACED",
    newValue: "AVAILABLE",
    performedById: args.performedById,
    candidateId: args.candidateId,
  });
}

/**
 * Reverting away from JOINED (typo recovery, candidate backed out). If the
 * submission has an ACTIVE/EXTENDED placement, mark it TERMINATED with a system
 * note and run the end-of-placement cascade. Preserves the audit trail (no
 * hard-delete, per project norm).
 *
 * Caller must wrap in `prisma.$transaction`.
 */
export async function terminatePlacementOnRevert(
  tx: Tx,
  args: {
    placementId: string;
    candidateId: string;
    candidateFullName: string;
    candidateStatus: string;
    newSubmissionStatus: string;
    performedById: string;
  },
): Promise<void> {
  await tx.placement.update({
    where: { id: args.placementId },
    data: {
      status: "TERMINATED",
      endReason: "OTHER",
      endNote: `Submission status reverted to ${args.newSubmissionStatus}`,
      endDate: new Date(),
    },
  });
  await logActivity(tx, {
    entityType: "CANDIDATE",
    action: "PLACEMENT_ENDED",
    description: `${args.candidateFullName}: placement terminated (submission status reverted to ${args.newSubmissionStatus})`,
    newValue: "TERMINATED",
    note: `Submission status reverted to ${args.newSubmissionStatus}`,
    performedById: args.performedById,
    candidateId: args.candidateId,
  });
  await endOfPlacementCascade(tx, {
    candidateId: args.candidateId,
    candidateFullName: args.candidateFullName,
    candidateStatus: args.candidateStatus,
    performedById: args.performedById,
  });
}
