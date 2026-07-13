import type {
  SubmissionStatus,
  InterviewType,
  InterviewResult,
} from "@/generated/prisma/enums";
import { SUBMISSION_STAGE_INDEX, SUBMISSION_STATUS_LABEL } from "@/lib/labels";

/** Reverse of SUBMISSION_STATUS_LABEL — status labels back to their status, so
 *  the activity log's `newValue` (a label string) can be mapped to a stage. */
const LABEL_TO_STATUS = new Map(
  (Object.entries(SUBMISSION_STATUS_LABEL) as [SubmissionStatus, string][]).map(
    ([status, label]) => [label, status],
  ),
);

/**
 * SB-4: the date each visual pipeline stage was first reached, derived from the
 * status-change activity log (no dedicated stage-history table). Each
 * status-change row carries the new status *label* in `newValue` and the
 * real-world time in `eventAt` (falling back to `createdAt`); we map label →
 * status → stage index and keep the earliest time per stage. Stage 0 is seeded
 * from `submittedAt` since the initial SUBMITTED status logs no change row.
 * Pure so the stepper's dates can be unit-tested apart from the query.
 */
export function deriveStageDates(
  entries: { newValue: string | null; eventAt: Date | null; createdAt: Date }[],
  submittedAt: Date,
): Record<number, Date> {
  const dates: Record<number, Date> = { 0: submittedAt };
  for (const e of entries) {
    if (!e.newValue) continue;
    const status = LABEL_TO_STATUS.get(e.newValue);
    if (!status) continue;
    const idx = SUBMISSION_STAGE_INDEX[status];
    const when = e.eventAt ?? e.createdAt;
    if (!dates[idx] || when < dates[idx]) dates[idx] = when;
  }
  return dates;
}

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

/**
 * Model B (rounds-first): the pipeline stage a newly-added interview round moves
 * the submission INTO — a vendor-screening round enters VENDOR_SCREENING_CALL,
 * any client-side round (client / manager / HR / final / other) enters
 * CLIENT_INTERVIEW. Adding a round is what advances the status, so the create
 * action maps the round's type → its entry stage. Pure so the mapping is
 * unit-tested apart from the action.
 */
export function stageForRoundType(type: InterviewType): SubmissionStatus {
  return type === "VENDOR_SCREENING" ? "VENDOR_SCREENING_CALL" : "CLIENT_INTERVIEW";
}

/**
 * The highest interview stage a set of rounds can support (Model B): CLIENT_INTERVIEW
 * if any client-family round exists, else VENDOR_SCREENING_CALL if any vendor round,
 * else null (no interview rounds → no interview stage). Used to revert a submission
 * when deleting the round that had auto-advanced it, so it can't sit at an interview
 * stage with no record (SB-5). Pure + unit-tested.
 */
export function highestInterviewStage(
  rounds: { interviewType: InterviewType }[],
): SubmissionStatus | null {
  if (rounds.some((r) => CLIENT_FAMILY.includes(r.interviewType)))
    return "CLIENT_INTERVIEW";
  if (rounds.some((r) => r.interviewType === "VENDOR_SCREENING"))
    return "VENDOR_SCREENING_CALL";
  return null;
}

/**
 * The furthest pipeline stage a set of rounds *justifies*, reading their results
 * (not just their existence): SELECTED when a client-family round passed,
 * CLIENT_INTERVIEW when a client-family round merely exists, else
 * VENDOR_SCREENING_CALL for a vendor round, else null. Used to pull a submission
 * back when a round is deleted or its result edited down so it can't sit at a
 * stage its records no longer support (SB-5) — including a Selected with no
 * passing round left behind it. Pure + unit-tested.
 */
export function highestSupportedStage(
  rounds: { interviewType: InterviewType; result: InterviewResult }[],
): SubmissionStatus | null {
  const clientRounds = rounds.filter((r) => CLIENT_FAMILY.includes(r.interviewType));
  if (clientRounds.some((r) => PASS_RESULTS.includes(r.result))) return "SELECTED";
  if (clientRounds.length) return "CLIENT_INTERVIEW";
  if (rounds.some((r) => r.interviewType === "VENDOR_SCREENING"))
    return "VENDOR_SCREENING_CALL";
  return null;
}

/**
 * SB-6: the single stage a submission moves back to for a correction. Controlled
 * transitions mean corrections step back exactly one visual stage (never an
 * arbitrary jump); the Decision-branch statuses (Rejected / Hold / Backed-out,
 * all stage 4) reopen to Client interview. Returns null at the first stage.
 */
export function previousStage(status: SubmissionStatus): SubmissionStatus | null {
  const idx = SUBMISSION_STAGE_INDEX[status];
  if (idx <= 0) return null;
  return stageStatus(idx - 1) ?? null;
}

/**
 * SB-6: whether a status move is a backward *correction* that must carry a
 * reason. A lower stage index than the current one, excluding the On-hold resume
 * (which legitimately re-enters at an earlier stage) and the branch outcomes
 * (Reject / Hold / Backed-out capture their own reason). Pure so the
 * reason-required rule can be unit-tested apart from the action.
 */
export function isBackwardCorrection(
  prev: SubmissionStatus,
  next: SubmissionStatus,
): boolean {
  if (prev === "ON_HOLD") return false;
  if (next === "REJECTED" || next === "ON_HOLD" || next === "BACKED_OUT")
    return false;
  return SUBMISSION_STAGE_INDEX[next] < SUBMISSION_STAGE_INDEX[prev];
}

export type RoundLite = {
  interviewType: InterviewType;
  result: InterviewResult;
  roundOrder: number;
};

/** Client-interview results that count as "passed" — the only one that lets a
 *  submission be marked Selected. `COMPLETED` was dropped here (H2): with the
 *  result→status coupling, a passing outcome is logged explicitly as `SELECTED`
 *  (which drives the submission to Selected). `COMPLETED` stays a valid enum
 *  value for legacy rows but is no longer offered in the Log-result picker and
 *  no longer unlocks Selected on its own. */
const PASS_RESULTS: InterviewResult[] = ["SELECTED"];

/**
 * H2 result→status coupling: the submission status that logging a given
 * interview result drives the submission to, or `null` when the outcome keeps
 * the submission in its current stage (WAITING = awaiting decision,
 * NEED_ANOTHER_ROUND = add another round, NO_SHOW / CANCELLED = didn't happen,
 * COMPLETED = legacy neutral). SELECTED / REJECTED / ON_HOLD are the decisive
 * outcomes that move the submission. Pure so the mapping is unit-tested apart
 * from the action; the caller enforces the résumé / terminal / same-status
 * guards (see applyResultCoupling in submission-status.ts).
 */
export function statusForResult(
  result: InterviewResult,
): SubmissionStatus | null {
  if (result === "SELECTED") return "SELECTED";
  if (result === "REJECTED") return "REJECTED";
  if (result === "ON_HOLD") return "ON_HOLD";
  return null;
}

/**
 * H2: the submission status that logging `result` should drive a submission at
 * `status` to — or `null` when the move is a no-op / not valid from here. Gates
 * the coupling by the SAME rules the manual pipeline uses so the two routes
 * agree: SELECTED only as a *forward* advance (never dragging an offer-stage
 * submission back to Selected, and never bypassing the SB-6 backward-reason);
 * REJECTED / ON_HOLD only where they're valid branch outcomes (e.g. ON_HOLD not
 * past the decision stage). Terminal and same-status are no-ops. Pure +
 * unit-tested; the caller still applies the SB-3 résumé gate on the forward move.
 */
export function resolveCouplingTarget(
  status: SubmissionStatus,
  result: InterviewResult,
): SubmissionStatus | null {
  const target = statusForResult(result);
  if (!target || isTerminal(status) || target === status) return null;
  if (target === "SELECTED")
    return isForwardAdvance(status, target) ? target : null;
  // REJECTED / ON_HOLD are branch outcomes — valid only where the pipeline
  // offers them from here.
  return branchActions(status).includes(target) ? target : null;
}

/** The latest round of a given type (highest roundOrder), or undefined. */
function latestOfType(
  rounds: RoundLite[],
  type: InterviewType,
): RoundLite | undefined {
  return rounds
    .filter((r) => r.interviewType === type)
    .sort((a, b) => a.roundOrder - b.roundOrder)
    .at(-1);
}

/** The interview types that live at the CLIENT_INTERVIEW pipeline stage — a
 *  client interview and every later panel. `stageForRoundType` sends every
 *  non-vendor type (including OTHER) into CLIENT_INTERVIEW, so this family must
 *  match it exactly, or a submission whose only client-side round is a
 *  Manager/HR/Final/Other round can never reach Selected (the F7 dead-end — OTHER
 *  was the last type still missing here). */
const CLIENT_FAMILY: InterviewType[] = [
  "CLIENT_INTERVIEW",
  "MANAGER_ROUND",
  "HR_ROUND",
  "FINAL_ROUND",
  "OTHER",
];

/** The latest client-stage round (any CLIENT_FAMILY type), or undefined. */
function latestClientRound(rounds: RoundLite[]): RoundLite | undefined {
  return rounds
    .filter((r) => CLIENT_FAMILY.includes(r.interviewType))
    .sort((a, b) => a.roundOrder - b.roundOrder)
    .at(-1);
}

/**
 * SB-5 strict gate: the reason a forward advance is blocked, or `null` if it's
 * allowed. The owner's rule — "if it's lenient, recruiters won't do the job" —
 * so a stage can't be reached without its record:
 *   • Vendor screening / Client interview require the matching InterviewRound.
 *   • You can't progress past a stage whose scheduled interview is still WAITING
 *     — record an outcome first (a "didn't happen" No-show / Cancelled counts).
 *   • Selected requires a *passing* client-interview result (WAITING /
 *     NEED_ANOTHER_ROUND / No-show block it — the latter enforces IV-2).
 *   • Offer accepted needs an expected join date; Joined needs an actual one.
 * Branch outcomes (Hold / Reject / Backed-out) and corrections never gate.
 * Pure so every rule is unit-tested apart from the action.
 */
export function advanceBlock(
  prev: SubmissionStatus,
  next: SubmissionStatus,
  rounds: RoundLite[],
  opts: { hasExpectedJoinDate?: boolean; hasActualJoinDate?: boolean } = {},
): string | null {
  if (!isForwardAdvance(prev, next)) return null;

  // Enter-gates: the stage's record must exist.
  if (next === "VENDOR_SCREENING_CALL" && !latestOfType(rounds, "VENDOR_SCREENING"))
    return "Record the vendor screening call first — or skip it as client-waived.";
  if (next === "CLIENT_INTERVIEW" && !latestClientRound(rounds))
    return "Schedule the client interview first.";

  // Leave-gates: no progressing past a scheduled event with no outcome yet.
  if (prev === "VENDOR_SCREENING_CALL") {
    const vs = latestOfType(rounds, "VENDOR_SCREENING");
    if (vs && vs.result === "WAITING")
      return "Record the vendor screening outcome before moving on.";
  }
  if (prev === "CLIENT_INTERVIEW") {
    const ci = latestClientRound(rounds);
    if (ci && ci.result === "WAITING")
      return "Record the interview result before moving on.";
  }

  // Selected must mean the interview passed (also blocks "needs another round").
  if (next === "SELECTED") {
    const ci = latestClientRound(rounds);
    if (!ci || !PASS_RESULTS.includes(ci.result))
      return "Record a passing interview result — or add the next round — before marking the candidate selected.";
  }

  if (next === "OFFER_ACCEPTED" && !opts.hasExpectedJoinDate)
    return "Add the expected join date before marking the offer accepted.";
  if (next === "JOINED" && !opts.hasActualJoinDate)
    return "Add the actual join date before marking the candidate joined.";

  return null;
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
