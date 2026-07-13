"use server";

import { revalidatePath } from "next/cache";
import { getScopedPrisma, requireUser } from "@/lib/session";
import { logActivity } from "@/server/activity";
import { hashPair } from "@/server/submission-create";
import { interviewRoundSchema } from "@/lib/validation/interview";
import { toFieldErrors } from "@/lib/validation/common";
import { INTERVIEW_TYPE_LABEL, INTERVIEW_RESULT_LABEL } from "@/lib/labels";
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
    select: { id: true },
  });
  if (!submission) return { error: "This submission no longer exists." };

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
  });

  revalidatePath(`/submissions/${d.submissionId}`);
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
  });

  revalidatePath(`/submissions/${d.submissionId}`);
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
  });

  revalidatePath(`/submissions/${existing.submissionId}`);
}
