"use server";

import { revalidatePath } from "next/cache";
import { getScopedPrisma, requireUser } from "@/lib/session";
import { logActivity } from "@/server/activity";
import { hashPair } from "@/server/submission-create";
import { interviewRoundSchema, logResultSchema } from "@/lib/validation/interview";
import { toFieldErrors } from "@/lib/validation/common";
import {
  applyResultCoupling,
  reconcileSubmissionStage,
  type CouplingOutcome,
  type SubmissionForStatus,
} from "@/server/submission-status";
import type { InterviewResult } from "@/generated/prisma/enums";
import {
  INTERVIEW_TYPE_LABEL,
  INTERVIEW_RESULT_LABEL,
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STAGE_INDEX,
} from "@/lib/labels";
import {
  stageForRoundType,
  isTerminal,
  resumeFlag,
  statusForResult,
} from "@/lib/submission-flow";
import { formatDateTime } from "@/lib/format";
import type { FormState } from "@/lib/form-state";

function readRound(formData: FormData) {
  return interviewRoundSchema.safeParse({
    submissionId: formData.get("submissionId") ?? "",
    roundName: formData.get("roundName") ?? "",
    interviewType: formData.get("interviewType") ?? "",
    result: formData.get("result") ?? "WAITING",
    interviewerName: formData.get("interviewerName") ?? "",
    interviewerNameNa: formData.get("interviewerName__na") ?? "",
    interviewMode: formData.get("interviewMode") ?? "",
    interviewModeNa: formData.get("interviewMode__na") ?? "",
    interviewPlatform: formData.get("interviewPlatform") ?? "",
    interviewPlatformNa: formData.get("interviewPlatform__na") ?? "",
    meetingLink: formData.get("meetingLink") ?? "",
    meetingLinkNa: formData.get("meetingLink__na") ?? "",
    scheduledAt: formData.get("scheduledAt") ?? "",
    scheduledAtNa: formData.get("scheduledAt__na") ?? "",
    scheduledTimezone: formData.get("scheduledTimezone") ?? "",
    scheduledTimezoneNa: formData.get("scheduledTimezone__na") ?? "",
    // Checkbox: "on" when ticked, absent otherwise.
    supportNeeded: formData.get("supportNeeded") === "on",
    supportProviderId: formData.get("supportProviderId") ?? "",
    supportProviderIdNa: formData.get("supportProviderId__na") ?? "",
    supportMethod: formData.get("supportMethod") ?? "",
    supportMethodNa: formData.get("supportMethod__na") ?? "",
    feedback: formData.get("feedback") ?? "",
    feedbackNa: formData.get("feedback__na") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

/** Resolve the support fields: only kept when "done with support" is ticked, so
 *  unchecking clears the provider + method. */
function supportFields(d: {
  supportNeeded: boolean;
  supportProviderId?: string;
  supportMethod?: string;
}) {
  return {
    supportNeeded: d.supportNeeded,
    supportProviderId: d.supportNeeded ? (d.supportProviderId ?? null) : null,
    supportMethod: d.supportNeeded ? (d.supportMethod ?? null) : null,
  };
}

/** The submission fields the H2 result→status coupling needs — the rate trio for
 *  the placement seed, candidate/job for the audit line, placement for the revert
 *  path, and the three résumé fields for the SB-3 gate. Shared by the log-result,
 *  edit, and add-round-when-done paths so they hydrate `SubmissionForStatus`
 *  identically. */
const SUBMISSION_COUPLING_SELECT = {
  id: true,
  status: true,
  candidateId: true,
  jobId: true,
  payRate: true,
  billRate: true,
  clientRate: true,
  candidateResumeId: true,
  resumeBlobUrl: true,
  resumeWaivedAt: true,
  candidate: { select: { fullName: true, status: true } },
  job: { select: { title: true } },
  placement: { select: { id: true, status: true } },
} as const;

/** The eventAt for a round-driven status change: the interview's own time when it
 *  already happened (so a backfilled Selected/Rejected dates to the interview,
 *  not to "now"), otherwise null (the decision is being made now). */
function couplingEventAt(scheduledAt: Date | null): Date | null {
  return scheduledAt && scheduledAt < new Date() ? scheduledAt : null;
}

/** The success toast for a logged result — names what the coupling did so the
 *  recruiter knows whether to add a round, reschedule, or that it's done. */
function logResultToast(
  result: InterviewResult,
  outcome: CouplingOutcome,
): { title: string; description?: string } {
  if (outcome.blockedNoResume)
    return {
      title: "Result logged — candidate not yet Selected",
      description:
        "Attach a résumé (or waive it) on the submission to mark the candidate Selected.",
    };
  // Report what the coupling ACTUALLY did (outcome.coupled), not just the chosen
  // result — a decisive result that wasn't a valid move (terminal submission,
  // already past that stage, vendor round) falls through to a neutral notice.
  if (outcome.coupled === "SELECTED")
    return { title: "Candidate marked Selected" };
  if (outcome.coupled === "REJECTED") return { title: "Candidate rejected" };
  if (outcome.coupled === "ON_HOLD")
    return { title: "Submission put on hold" };
  switch (result) {
    case "NEED_ANOTHER_ROUND":
      return { title: "Result logged", description: "Add the next round to continue." };
    case "WAITING":
      return { title: "Saved — still awaiting the decision" };
    case "NO_SHOW":
    case "CANCELLED":
      return {
        title: "Marked as didn't happen",
        description: "Reschedule by adding a new round.",
      };
    default:
      return { title: "Result recorded" };
  }
}

/**
 * H2 — the focused "Log result" action. Records the outcome + feedback on a round
 * and drives the submission status through the shared coupling
 * (`applyResultCoupling`): SELECTED → Selected, REJECTED → Rejected (reason),
 * ON_HOLD → On hold; the in-stage outcomes (awaiting / need-another-round /
 * didn't-happen) keep the submission put. One transaction, so the round result
 * and the submission status can never drift.
 */
export async function logInterviewResult(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const db = await getScopedPrisma();
  const user = await requireUser();
  const parsed = logResultSchema.safeParse({
    roundId: formData.get("roundId") ?? "",
    result: formData.get("result") ?? "",
    feedback: formData.get("feedback") ?? "",
    feedbackNa: formData.get("feedback__na") ?? "",
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const round = await db.interviewRound.findUnique({
    where: { id: d.roundId },
    select: {
      id: true,
      roundName: true,
      result: true,
      scheduledAt: true,
      submission: { select: SUBMISSION_COUPLING_SELECT },
    },
  });
  if (!round) return { error: "This interview round no longer exists." };
  const submission = round.submission as SubmissionForStatus;
  const result = d.result as InterviewResult;
  const prevResult = round.result;
  const feedbackText = d.feedback ?? null;
  // The focused dialog hides Feedback for the didn't-happen outcomes, so a
  // NO_SHOW / CANCELLED post carries no feedback — don't let a blank overwrite an
  // interim read the recruiter saved earlier.
  const touchesFeedback = result !== "NO_SHOW" && result !== "CANCELLED";
  // Date the decision at the interview when it already happened (backdated), so
  // the Selected/Rejected timeline entry lines up with the round, not "now".
  const eventAt = couplingEventAt(round.scheduledAt);

  let outcome: CouplingOutcome = { coupled: null, blockedNoResume: false };

  await db.$transaction(async (tx) => {
    await tx.interviewRound.update({
      where: { id: d.roundId },
      data: {
        result,
        ...(touchesFeedback ? { feedback: feedbackText } : {}),
        updatedById: user.id,
      },
    });
    if (prevResult !== result)
      await logActivity(tx, {
        entityType: "INTERVIEW_ROUND",
        action: "INTERVIEW_RESULT_UPDATED",
        description: `Result for round "${round.roundName}" changed from ${INTERVIEW_RESULT_LABEL[prevResult]} to ${INTERVIEW_RESULT_LABEL[result]}`,
        oldValue: INTERVIEW_RESULT_LABEL[prevResult],
        newValue: INTERVIEW_RESULT_LABEL[result],
        performedById: user.id,
        interviewRoundId: d.roundId,
      });
    if (touchesFeedback && feedbackText)
      await logActivity(tx, {
        entityType: "INTERVIEW_ROUND",
        action: "FEEDBACK_ADDED",
        description: `Feedback added to round "${round.roundName}"`,
        performedById: user.id,
        interviewRoundId: d.roundId,
      });

    // advanceBlock (inside the coupling) needs the round set AS WRITTEN, so load
    // it after the update above.
    const rounds = await tx.interviewRound.findMany({
      where: { submissionId: submission.id },
      select: { interviewType: true, result: true, roundOrder: true },
    });
    outcome = await applyResultCoupling(tx, submission, result, rounds, {
      actorId: user.id,
      reasonNote: d.reason ?? null,
      eventAt,
    });
  });

  revalidatePath(`/submissions/${submission.id}`);
  revalidatePath("/submissions");
  revalidatePath(`/jobs/${submission.jobId}`);
  revalidatePath(`/candidates/${submission.candidateId}`);
  revalidatePath("/interviews");

  return { ok: true, toast: logResultToast(result, outcome) };
}

export async function createInterviewRound(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const db = await getScopedPrisma();
  const user = await requireUser();
  const parsed = readRound(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const submission = await db.submission.findUnique({
    where: { id: d.submissionId },
    select: { id: true, status: true, jobId: true, candidateId: true },
  });
  if (!submission) return { error: "This submission no longer exists." };
  // Don't log new interviews on a closed submission — reopen it first.
  if (isTerminal(submission.status))
    return {
      error: `This submission is closed (${SUBMISSION_STATUS_LABEL[submission.status]}). Reopen it before adding interview rounds.`,
    };

  // Set when the round is added but the status can't advance because no résumé is
  // attached — surfaced as a notice so the recruiter isn't left guessing.
  let advanceSkippedNoResume = false;
  // H2: a round added in "Already happened" mode may carry a decisive result;
  // captured out here so the return can report what the coupling did.
  let couplingOutcome: CouplingOutcome = { coupled: null, blockedNoResume: false };
  let couplingResult: InterviewResult = "WAITING";

  await db.$transaction(async (tx) => {
    // Serialize concurrent "Add round" submits for the same submission so two
    // don't read the same max and create duplicate roundOrder values (there is
    // no @@unique([submissionId, roundOrder]) to fall back on). Same pattern as
    // createSubmissionRecord. Lock auto-releases at tx end.
    const lock = hashPair(d.submissionId, "interview-round");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lock.a}::int, ${lock.b}::int)`;

    // Rounds are unlimited and ordered — the next round continues the sequence.
    const last = await tx.interviewRound.findFirst({
      where: { submissionId: d.submissionId },
      orderBy: { roundOrder: "desc" },
      select: { roundOrder: true },
    });
    const roundOrder = (last?.roundOrder ?? 0) + 1;

    const created = await tx.interviewRound.create({
      data: {
        submissionId: d.submissionId,
        roundOrder,
        roundName: d.roundName,
        interviewType: d.interviewType,
        result: d.result,
        interviewerName: d.interviewerName ?? null,
        interviewMode: d.interviewMode ?? null,
        interviewPlatform:
          d.interviewMode === "VIDEO" ? (d.interviewPlatform ?? null) : null,
        // Like interviewPlatform, a meeting link only belongs on a VIDEO round —
        // null it otherwise so a crafted post can't attach a join link to a
        // phone/in-person round (the UI already unmounts the field).
        meetingLink: d.interviewMode === "VIDEO" ? (d.meetingLink ?? null) : null,
        scheduledAt: d.scheduledAt ?? null,
        scheduledTimezone: d.scheduledTimezone ?? null,
        ...supportFields(d),
        feedback: d.feedback ?? null,
        notes: d.notes ?? null,
        updatedById: user.id,
      },
    });
    await logActivity(tx, {
      entityType: "INTERVIEW_ROUND",
      action: "INTERVIEW_ROUND_ADDED",
      description: `Interview round "${created.roundName}" added (${INTERVIEW_TYPE_LABEL[created.interviewType]})`,
      performedById: user.id,
      interviewRoundId: created.id,
    });

    // Rounds-first (Model B): adding a round advances the submission INTO that
    // interview stage — forward only, on an active (non-terminal) submission that
    // already carries a résumé (preserves the SB-3 résumé-before-advance rule).
    const target = stageForRoundType(created.interviewType);
    const sub = await tx.submission.findUnique({
      where: { id: d.submissionId },
      select: {
        status: true,
        candidateResumeId: true,
        resumeBlobUrl: true,
        resumeWaivedAt: true,
      },
    });
    if (
      sub &&
      !isTerminal(sub.status) &&
      SUBMISSION_STAGE_INDEX[target] > SUBMISSION_STAGE_INDEX[sub.status]
    ) {
      if (resumeFlag(sub) === "missing") {
        advanceSkippedNoResume = true;
      } else {
        // Stamp the stage-entry time at the interview date for a round that
        // already happened (backdated) — else the manual "now" would skew
        // time-in-stage/time-to-fill. A future-scheduled round enters the stage now.
        const now = new Date();
        const eventAt =
          created.scheduledAt && created.scheduledAt < now
            ? created.scheduledAt
            : now;
        await tx.submission.update({
          where: { id: d.submissionId },
          data: { status: target },
        });
        await logActivity(tx, {
          entityType: "SUBMISSION",
          action: "SUBMISSION_STATUS_CHANGED",
          description: `Status changed from ${SUBMISSION_STATUS_LABEL[sub.status]} to ${SUBMISSION_STATUS_LABEL[target]} (interview round added)`,
          oldValue: SUBMISSION_STATUS_LABEL[sub.status],
          newValue: SUBMISSION_STATUS_LABEL[target],
          eventAt,
          performedById: user.id,
          submissionId: d.submissionId,
        });
      }
    }

    // H2: a round added in "Already happened" mode may carry a decisive result
    // (Selected / Rejected / On hold). Drive the submission through the same
    // coupling the Log-result dialog uses, so backfilling a past interview and
    // its outcome moves the submission — no drift. Reads the submission fresh so
    // it sees the stage advance just applied above.
    if (statusForResult(created.result)) {
      couplingResult = created.result;
      const full = await tx.submission.findUnique({
        where: { id: d.submissionId },
        select: SUBMISSION_COUPLING_SELECT,
      });
      if (full) {
        const rounds = await tx.interviewRound.findMany({
          where: { submissionId: d.submissionId },
          select: { interviewType: true, result: true, roundOrder: true },
        });
        couplingOutcome = await applyResultCoupling(
          tx,
          full as SubmissionForStatus,
          created.result,
          rounds,
          {
            actorId: user.id,
            reasonNote: null,
            eventAt: couplingEventAt(created.scheduledAt),
          },
        );
      }
    }
  });

  // A round-driven status change shows on the submissions list + the job's and
  // candidate's pages too — revalidate them like the manual advance does.
  revalidatePath(`/submissions/${d.submissionId}`);
  revalidatePath("/submissions");
  revalidatePath(`/jobs/${submission.jobId}`);
  revalidatePath(`/candidates/${submission.candidateId}`);

  // A decisive result on a just-added round reports what the coupling did,
  // taking precedence over the plain "round added" / résumé-skip notices.
  if (couplingOutcome.coupled || couplingOutcome.blockedNoResume)
    return { ok: true, toast: logResultToast(couplingResult, couplingOutcome) };
  if (advanceSkippedNoResume)
    return {
      ok: true,
      toast: {
        title: "Round added — status not advanced",
        description:
          "Attach a résumé (or waive it) to move this submission into the interview stage.",
      },
    };
  return { ok: true };
}

export async function updateInterviewRound(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const db = await getScopedPrisma();
  const user = await requireUser();
  const roundId = String(formData.get("id") ?? "").trim();
  if (!roundId) return { error: "Missing interview round reference." };

  const parsed = readRound(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const existing = await db.interviewRound.findUnique({
    where: { id: roundId },
    select: {
      result: true,
      feedback: true,
      scheduledAt: true,
      submission: { select: SUBMISSION_COUPLING_SELECT },
    },
  });
  if (!existing) return { error: "This interview round no longer exists." };

  const resultChanged = existing.result !== d.result;
  const feedbackChanged =
    String(existing.feedback ?? "") !== String(d.feedback ?? "");
  // Compare scheduledAt at minute resolution — `datetime-local` inputs drop
  // seconds, so a round-trip through the form would otherwise log a no-op
  // reschedule.
  const prevSched = existing.scheduledAt
    ? Math.floor(existing.scheduledAt.getTime() / 60000)
    : null;
  const nextSched = d.scheduledAt
    ? Math.floor(d.scheduledAt.getTime() / 60000)
    : null;
  const scheduledChanged = prevSched !== nextSched;

  // H2: editing a round's result to a decisive outcome drives the submission too,
  // so the full-edit path can't drift from the submission the way the old
  // record-in-two-places flow did.
  let outcome: CouplingOutcome = { coupled: null, blockedNoResume: false };

  await db.$transaction(async (tx) => {
    await tx.interviewRound.update({
      where: { id: roundId },
      data: {
        roundName: d.roundName,
        interviewType: d.interviewType,
        result: d.result,
        interviewerName: d.interviewerName ?? null,
        interviewMode: d.interviewMode ?? null,
        interviewPlatform:
          d.interviewMode === "VIDEO" ? (d.interviewPlatform ?? null) : null,
        // Like interviewPlatform, a meeting link only belongs on a VIDEO round —
        // null it otherwise so a crafted post can't attach a join link to a
        // phone/in-person round (the UI already unmounts the field).
        meetingLink: d.interviewMode === "VIDEO" ? (d.meetingLink ?? null) : null,
        scheduledAt: d.scheduledAt ?? null,
        scheduledTimezone: d.scheduledTimezone ?? null,
        ...supportFields(d),
        feedback: d.feedback ?? null,
        notes: d.notes ?? null,
        updatedById: user.id,
      },
    });
    if (scheduledChanged) {
      const from = existing.scheduledAt
        ? formatDateTime(existing.scheduledAt)
        : "unscheduled";
      const to = d.scheduledAt ? formatDateTime(d.scheduledAt) : "unscheduled";
      await logActivity(tx, {
        entityType: "INTERVIEW_ROUND",
        action: "INTERVIEW_RESCHEDULED",
        description: `Round "${d.roundName}" rescheduled from ${from} to ${to}`,
        oldValue: from,
        newValue: to,
        performedById: user.id,
        interviewRoundId: roundId,
      });
    }
    if (resultChanged)
      await logActivity(tx, {
        entityType: "INTERVIEW_ROUND",
        action: "INTERVIEW_RESULT_UPDATED",
        description: `Result for round "${d.roundName}" changed from ${INTERVIEW_RESULT_LABEL[existing.result]} to ${INTERVIEW_RESULT_LABEL[d.result]}`,
        oldValue: INTERVIEW_RESULT_LABEL[existing.result],
        newValue: INTERVIEW_RESULT_LABEL[d.result],
        performedById: user.id,
        interviewRoundId: roundId,
      });
    if (feedbackChanged && d.feedback)
      await logActivity(tx, {
        entityType: "INTERVIEW_ROUND",
        action: "FEEDBACK_ADDED",
        description: `Feedback added to round "${d.roundName}"`,
        performedById: user.id,
        interviewRoundId: roundId,
      });

    // The full edit form has no dedicated reject/hold reason field — that reason
    // is captured on the focused Log-result dialog. A rejection made through this
    // path lands reason-less (same as the manual pipeline's optional reason).
    if (resultChanged) {
      const rounds = await tx.interviewRound.findMany({
        where: { submissionId: existing.submission.id },
        select: { interviewType: true, result: true, roundOrder: true },
      });
      outcome = await applyResultCoupling(
        tx,
        existing.submission as SubmissionForStatus,
        d.result,
        rounds,
        {
          actorId: user.id,
          reasonNote: null,
          eventAt: couplingEventAt(d.scheduledAt ?? null),
        },
      );
      // Editing a decided result DOWN (e.g. Selected → Waiting) doesn't advance,
      // so it can't leave the submission ahead of what the rounds now support —
      // pull it back if the edit stranded it. (Coupling above handles the forward
      // case; this is its mirror.)
      if (!outcome.coupled)
        await reconcileSubmissionStage(tx, existing.submission.id, user.id);
    }
  });

  revalidatePath(`/submissions/${d.submissionId}`);
  revalidatePath("/submissions");
  revalidatePath(`/jobs/${existing.submission.jobId}`);
  revalidatePath(`/candidates/${existing.submission.candidateId}`);
  if (outcome.coupled || outcome.blockedNoResume)
    return { ok: true, toast: logResultToast(d.result, outcome) };
  return { ok: true };
}

export async function deleteInterviewRound(formData: FormData): Promise<void> {
  const db = await getScopedPrisma();
  const user = await requireUser();
  const roundId = String(formData.get("id") ?? "").trim();
  if (!roundId) return;

  const existing = await db.interviewRound.findUnique({
    where: { id: roundId },
    select: {
      id: true,
      submissionId: true,
      roundName: true,
      roundOrder: true,
      submission: {
        select: { status: true, jobId: true, candidateId: true },
      },
    },
  });
  if (!existing) return;

  await db.$transaction(async (tx) => {
    await tx.interviewRound.delete({ where: { id: roundId } });
    await logActivity(tx, {
      entityType: "SUBMISSION",
      action: "INTERVIEW_ROUND_DELETED",
      description: `Round ${existing.roundOrder} · "${existing.roundName}" deleted`,
      performedById: user.id,
      submissionId: existing.submissionId,
    });

    // A submission must not sit at an interview/decision stage its remaining
    // rounds no longer support (SB-5) — including a Selected whose only passing
    // client round was just deleted. reconcile pulls it back if so.
    await reconcileSubmissionStage(tx, existing.submissionId, user.id);
  });

  revalidatePath(`/submissions/${existing.submissionId}`);
  revalidatePath("/submissions");
  revalidatePath(`/jobs/${existing.submission.jobId}`);
  revalidatePath(`/candidates/${existing.submission.candidateId}`);
}
