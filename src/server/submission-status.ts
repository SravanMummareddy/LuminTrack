// H2 — the single audited submission-status transition, shared by the manual
// status-change action (`changeSubmissionStatus`) and the round-driven
// result→status coupling (`logInterviewResult` + the interview add/edit paths).
// Extracting it means both routes run the SAME update + placement lifecycle +
// audit row, so the round `result` and the `SubmissionStatus` can never drift.
//
// Not a "use server" module: it takes a Prisma transaction client, which isn't
// a serializable server-action argument. Callers compose it inside their own
// `$transaction`.

import type { Prisma } from "@/generated/prisma/client";
import type {
  ActivityAction,
  SubmissionStatus,
  InterviewResult,
} from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";
import { logActivity } from "@/server/activity";
import {
  ensurePlacementOnJoined,
  terminatePlacementOnRevert,
} from "@/server/placement-lifecycle";
import { SUBMISSION_STATUS_LABEL, SUBMISSION_STAGE_INDEX } from "@/lib/labels";
import {
  resolveCouplingTarget,
  advanceBlock,
  resumeFlag,
  isForwardAdvance,
  highestSupportedStage,
  type RoundLite,
} from "@/lib/submission-flow";

/** The submission shape every transition needs — the rate trio for the
 *  placement seed, the candidate/job for the audit description, the placement
 *  for the revert path, and the three résumé fields for the SB-3 gate. */
export type SubmissionForStatus = {
  id: string;
  status: SubmissionStatus;
  candidateId: string;
  jobId: string;
  payRate: Prisma.Decimal | null;
  billRate: Prisma.Decimal | null;
  clientRate: Prisma.Decimal | null;
  candidateResumeId: string | null;
  resumeBlobUrl: string | null;
  resumeWaivedAt: Date | null;
  candidate: { fullName: string; status: string };
  job: { title: string };
  placement: { id: string; status: string } | null;
};

/** The most specific audited action for each milestone status. */
function statusAction(next: SubmissionStatus): ActivityAction {
  switch (next) {
    case "SELECTED":
      return "CANDIDATE_SELECTED";
    case "REJECTED":
      return "CANDIDATE_REJECTED";
    case "OFFER_RELEASED":
      return "OFFER_RELEASED";
    case "OFFER_ACCEPTED":
      return "OFFER_ACCEPTED";
    case "JOINED":
      return "CANDIDATE_JOINED";
    default:
      return "SUBMISSION_STATUS_CHANGED";
  }
}

/**
 * Apply a submission status transition inside an open transaction: update the
 * status (+ rejectionReason / join dates where they apply), write the audit row,
 * and run the placement lifecycle (create on JOINED, terminate on JOINED-revert).
 * Returns the placement's display seq when JOINED created/reactivated one.
 *
 * Policy gates (advanceBlock, résumé, backward-correction reason) live in the
 * callers — this helper is the mechanical transition they all funnel through.
 */
export async function applySubmissionStatus(
  tx: Tx,
  submission: SubmissionForStatus,
  next: SubmissionStatus,
  opts: {
    actorId: string;
    note?: string | null;
    /** STATUS_CHANGE_REASONS category, for the manual path. */
    reason?: string | null;
    eventAt?: Date | null;
    expectedJoinDate?: Date | null;
    actualJoinDate?: Date | null;
    /** SB-6: a backward correction — changes the audit wording only. */
    backward?: boolean;
  },
): Promise<{ placementSeq: number | null }> {
  const prev = submission.status;

  // §C2: expected join date attaches to OFFER_ACCEPTED, actual to JOINED; a
  // value for the wrong target is ignored so it can't stick to the row.
  const joinDates: { expectedJoinDate?: Date; actualJoinDate?: Date } = {};
  if (next === "OFFER_ACCEPTED" && opts.expectedJoinDate)
    joinDates.expectedJoinDate = opts.expectedJoinDate;
  if (next === "JOINED" && opts.actualJoinDate)
    joinDates.actualJoinDate = opts.actualJoinDate;

  await tx.submission.update({
    where: { id: submission.id },
    data: {
      status: next,
      // The note carries the free-text detail; on a rejection it also lands in
      // the dedicated column the detail page reads.
      ...(next === "REJECTED" ? { rejectionReason: opts.note ?? null } : {}),
      ...joinDates,
    },
  });

  await logActivity(tx, {
    entityType: "SUBMISSION",
    action: statusAction(next),
    description: `${submission.candidate.fullName} on "${submission.job.title}": status ${opts.backward ? "corrected back" : "changed"} from ${SUBMISSION_STATUS_LABEL[prev]} to ${SUBMISSION_STATUS_LABEL[next]}`,
    oldValue: SUBMISSION_STATUS_LABEL[prev],
    newValue: SUBMISSION_STATUS_LABEL[next],
    eventAt: opts.eventAt ?? null,
    note: opts.note ?? null,
    reason: opts.reason ?? null,
    performedById: opts.actorId,
    submissionId: submission.id,
  });

  let placementSeq: number | null = null;
  if (next === "JOINED" && prev !== "JOINED") {
    const placement = await ensurePlacementOnJoined(tx, {
      submissionId: submission.id,
      candidateId: submission.candidateId,
      jobId: submission.jobId,
      payRate: submission.payRate,
      billRate: submission.billRate,
      clientRate: submission.clientRate,
      candidateFullName: submission.candidate.fullName,
      jobTitle: submission.job.title,
      candidateStatus: submission.candidate.status,
      performedById: opts.actorId,
      eventAt: opts.actualJoinDate ?? opts.eventAt ?? null,
    });
    placementSeq = placement.placementSeq;
  } else if (
    prev === "JOINED" &&
    next !== "JOINED" &&
    submission.placement &&
    (submission.placement.status === "ACTIVE" ||
      submission.placement.status === "EXTENDED")
  ) {
    await terminatePlacementOnRevert(tx, {
      placementId: submission.placement.id,
      candidateId: submission.candidateId,
      candidateFullName: submission.candidate.fullName,
      candidateStatus: submission.candidate.status,
      newSubmissionStatus: SUBMISSION_STATUS_LABEL[next],
      performedById: opts.actorId,
    });
  }

  return { placementSeq };
}

/** The outcome of coupling an interview result to the submission status. */
export type CouplingOutcome = {
  /** The status the submission was driven to, or null when it stayed put. */
  coupled: SubmissionStatus | null;
  /** SELECTED was blocked because the submission has no résumé (SB-3). The round
   *  result is still recorded; the caller surfaces this as a notice. */
  blockedNoResume: boolean;
  /** A decisive result resolved to a valid forward target but `advanceBlock`
   *  refused it (e.g. a later client round is still WAITING, so this isn't the
   *  latest passing round). The result is recorded but the submission stays put;
   *  the caller surfaces this reason so the move isn't a silent no-op. */
  blockedAdvance?: string | null;
};

/**
 * H2 coupling: given an interview result just logged on a round, drive the
 * submission's status when the result is decisive (SELECTED / REJECTED /
 * ON_HOLD). Keeps the submission put for the in-stage outcomes (awaiting
 * decision / need another round / didn't happen).
 *
 * Coupling is gated by the SAME rules the manual pipeline runs, so the two routes
 * can't disagree (`resolveCouplingTarget` handles terminal / same-status /
 * backward-SELECTED / invalid-branch). For a forward advance to SELECTED it also
 * runs the SB-3 résumé gate (soft: the result is still recorded, the advance is
 * skipped with a notice) and the SB-5 `advanceBlock` — so a passing client-family
 * round must be on file. A vendor-screening round set "Selected" therefore stays
 * put rather than jumping past the client interview.
 *
 * Coupling only ever drives the submission FORWARD to its decision; a genuine
 * reversal (un-select, un-reject) is a manual status correction, so a
 * decisive→non-decisive result edit is a deliberate no-op here (the two can
 * briefly differ until the recruiter corrects the status).
 *
 * `rounds` is the submission's full round set AFTER the result write, so
 * `advanceBlock` sees the just-logged outcome.
 */
export async function applyResultCoupling(
  tx: Tx,
  submission: SubmissionForStatus,
  result: InterviewResult,
  rounds: RoundLite[],
  opts: { actorId: string; reasonNote?: string | null; eventAt?: Date | null },
): Promise<CouplingOutcome> {
  const target = resolveCouplingTarget(submission.status, result);
  if (!target) return { coupled: null, blockedNoResume: false };

  // Only SELECTED is a forward advance (REJECTED / ON_HOLD are branch outcomes).
  if (isForwardAdvance(submission.status, target)) {
    if (resumeFlag(submission) === "missing")
      return { coupled: null, blockedNoResume: true };
    // SB-5: the same record/pass gate the manual advance enforces. The round
    // result just written is the passing evidence when it's a client-family
    // round; without one on file, stay put — but carry the reason so the caller
    // can tell the recruiter why the result didn't move the submission.
    const blocked = advanceBlock(submission.status, target, rounds);
    if (blocked) return { coupled: null, blockedNoResume: false, blockedAdvance: blocked };
  }

  await applySubmissionStatus(tx, submission, target, {
    actorId: opts.actorId,
    // REJECTED / ON_HOLD carry the recruiter's reason as the audit note (and,
    // for a rejection, into the submission's rejectionReason column).
    note:
      target === "REJECTED" || target === "ON_HOLD"
        ? (opts.reasonNote ?? null)
        : null,
    eventAt: opts.eventAt ?? null,
  });
  return { coupled: target, blockedNoResume: false };
}

/** The stages whose validity is derived from interview rounds — the only ones a
 *  round delete / result-downgrade may pull back. An offer/joined stage a manual
 *  advance reached is out of range and never reconciled. */
const ROUND_DERIVED_STAGES: SubmissionStatus[] = [
  "VENDOR_SCREENING_CALL",
  "CLIENT_INTERVIEW",
  "SELECTED",
];

/**
 * Keep the submission from sitting at a round-derived stage its rounds no longer
 * support after a round was deleted or its result edited down (the mirror of the
 * forward coupling). If the furthest stage the current rounds justify is earlier
 * than where the submission sits — and it sits in the round-derived range — pull
 * it back to that stage (or Résumé-picked when no round remains) and audit it.
 * Never touches an offer/joined stage. Call after the round write, inside the tx.
 */
export async function reconcileSubmissionStage(
  tx: Tx,
  submissionId: string,
  actorId: string,
): Promise<void> {
  const sub = await tx.submission.findUnique({
    where: { id: submissionId },
    select: {
      status: true,
      candidate: { select: { fullName: true } },
      job: { select: { title: true } },
    },
  });
  if (!sub || !ROUND_DERIVED_STAGES.includes(sub.status)) return;

  const rounds = await tx.interviewRound.findMany({
    where: { submissionId },
    select: { interviewType: true, result: true },
  });
  const supported = highestSupportedStage(rounds);
  const supportedIdx = supported
    ? SUBMISSION_STAGE_INDEX[supported]
    : SUBMISSION_STAGE_INDEX["RESUME_PICKED"];
  if (supportedIdx >= SUBMISSION_STAGE_INDEX[sub.status]) return;

  const revertTo = supported ?? "RESUME_PICKED";
  await tx.submission.update({
    where: { id: submissionId },
    data: { status: revertTo },
  });
  await logActivity(tx, {
    entityType: "SUBMISSION",
    action: "SUBMISSION_STATUS_CHANGED",
    description: `${sub.candidate.fullName} on "${sub.job.title}": status reverted from ${SUBMISSION_STATUS_LABEL[sub.status]} to ${SUBMISSION_STATUS_LABEL[revertTo]} (interview record no longer supports it)`,
    oldValue: SUBMISSION_STATUS_LABEL[sub.status],
    newValue: SUBMISSION_STATUS_LABEL[revertTo],
    performedById: actorId,
    submissionId,
  });
}
