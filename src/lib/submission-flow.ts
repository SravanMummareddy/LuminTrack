import type { SubmissionStatus } from "@/generated/prisma/enums";
import { SUBMISSION_STAGE_INDEX, SUBMISSION_STATUS_LABEL } from "@/lib/labels";

/**
 * Submission pipeline transitions for the "advance status" action bar.
 *
 * The visual pipeline (see SUBMISSION_PIPELINE / SUBMISSION_STAGE_INDEX in
 * labels.ts) is: Submitted → Resume picked → Vendor screening → Client
 * interview → Decision → Offer released → Offer accepted → Joined. Stage 4
 * ("Decision") is a fork whose "proceed" outcome is SELECTED; REJECTED / ON_HOLD
 * / BACKED_OUT also live at that stage as branch outcomes.
 *
 * These helpers turn a status into (a) the single obvious next step for the
 * happy path and (b) the branch actions valid from here — so the UI can offer a
 * primary "Advance" button plus first-class Hold / Reject / Backed-out buttons
 * instead of a flat dropdown. Pure + reused by unit tests; no server imports.
 */

// The canonical single status for each linear pipeline stage. Stage 4 resolves
// to SELECTED (the "proceed past the interview" outcome); the negative branch
// outcomes are handled by branchActions(), not here.
const STAGE_STATUS: Record<number, SubmissionStatus> = {
  0: "SUBMITTED",
  1: "RESUME_PICKED",
  2: "VENDOR_SCREENING_CALL",
  3: "CLIENT_INTERVIEW",
  4: "SELECTED",
  5: "OFFER_RELEASED",
  6: "OFFER_ACCEPTED",
  7: "JOINED",
};

/** The canonical status for a given visual pipeline stage index (0..7), or
 *  undefined out of range. Stage 4 ("Decision") resolves to SELECTED. */
export function stageStatus(index: number): SubmissionStatus | undefined {
  return STAGE_STATUS[index];
}

/** Statuses with nowhere further to advance. */
export const TERMINAL_STATUSES: SubmissionStatus[] = [
  "JOINED",
  "REJECTED",
  "BACKED_OUT",
];

export function isTerminal(status: SubmissionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export type PrimaryAdvance = { next: SubmissionStatus; label: string };

/**
 * The single "obvious next step" from `status`, or null when there's nowhere to
 * go (terminal states). The label is the button text.
 */
export function primaryAdvance(status: SubmissionStatus): PrimaryAdvance | null {
  if (isTerminal(status)) return null;

  // On hold rejoins the active pipeline at the client-interview stage.
  if (status === "ON_HOLD")
    return { next: "CLIENT_INTERVIEW", label: "Resume to client interview" };

  const next = STAGE_STATUS[SUBMISSION_STAGE_INDEX[status] + 1];
  if (!next) return null;

  // The interview → decision fork reads as a decision, and the final step reads
  // as a milestone; everything else is a plain "advance to X".
  if (status === "CLIENT_INTERVIEW") return { next, label: "Mark selected" };
  if (next === "JOINED") return { next, label: "Mark joined" };
  return { next, label: `Advance to ${SUBMISSION_STATUS_LABEL[next].toLowerCase()}` };
}

/**
 * Branch (non-advance) outcomes offered from `status`, in display order.
 * Hold + Reject run through the active pipeline; Backed out only makes sense
 * once a candidate has been selected or offered.
 */
export function branchActions(status: SubmissionStatus): SubmissionStatus[] {
  if (isTerminal(status)) return [];

  const stage = SUBMISSION_STAGE_INDEX[status];
  const out: SubmissionStatus[] = [];

  // Put on hold — available while the candidate is still in the active pipeline
  // (through the decision), but not when they're already on hold.
  if (status !== "ON_HOLD" && stage <= 4) out.push("ON_HOLD");

  // Reject is always available from a non-terminal status.
  out.push("REJECTED");

  // Backed out = the candidate walks after being selected / offered.
  if (
    status === "SELECTED" ||
    status === "OFFER_RELEASED" ||
    status === "OFFER_ACCEPTED"
  )
    out.push("BACKED_OUT");

  return out;
}

/**
 * SB-3: whether a status change is a forward move to a later pipeline stage — so
 * it requires a résumé (or an explicit waiver). Branch outcomes (Hold / Reject /
 * Backed out) and backward corrections are NOT advances and never gate. Pure so
 * the résumé-to-advance rule can be unit-tested apart from the action.
 */
export function isForwardAdvance(
  prev: SubmissionStatus,
  next: SubmissionStatus,
): boolean {
  if (next === "ON_HOLD" || next === "REJECTED" || next === "BACKED_OUT")
    return false;
  return SUBMISSION_STAGE_INDEX[next] > SUBMISSION_STAGE_INDEX[prev];
}

/** Whether a submission's résumé is attached, missing, or intentionally waived.
 *  "missing" is the actionable to-do state (flagged + on the worklist); "waived"
 *  is missing-but-intentional and drops it off the worklist. Pure/derived — no
 *  schema state of its own beyond the three fields it reads. */
export type ResumeFlag = "attached" | "missing" | "waived";

export function resumeFlag(s: {
  candidateResumeId: string | null;
  resumeBlobUrl: string | null;
  resumeWaivedAt: Date | string | null;
}): ResumeFlag {
  if (s.candidateResumeId || s.resumeBlobUrl) return "attached";
  return s.resumeWaivedAt ? "waived" : "missing";
}
