"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/server/activity";
import { interviewRoundSchema } from "@/lib/validation/interview";
import { toFieldErrors } from "@/lib/validation/common";
import { INTERVIEW_TYPE_LABEL, INTERVIEW_RESULT_LABEL } from "@/lib/labels";
import type { FormState } from "@/lib/form-state";

function readRound(formData: FormData) {
  return interviewRoundSchema.safeParse({
    submissionId: formData.get("submissionId") ?? "",
    roundName: formData.get("roundName") ?? "",
    interviewType: formData.get("interviewType") ?? "",
    result: formData.get("result") ?? "WAITING",
    interviewerName: formData.get("interviewerName") ?? "",
    interviewMode: formData.get("interviewMode") ?? "",
    interviewPlatform: formData.get("interviewPlatform") ?? "",
    scheduledAt: formData.get("scheduledAt") ?? "",
    feedback: formData.get("feedback") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

export async function createInterviewRound(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = readRound(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const submission = await prisma.submission.findUnique({
    where: { id: d.submissionId },
    select: { id: true },
  });
  if (!submission) return { error: "This submission no longer exists." };

  // Rounds are unlimited and ordered — the next round continues the sequence.
  const last = await prisma.interviewRound.findFirst({
    where: { submissionId: d.submissionId },
    orderBy: { roundOrder: "desc" },
    select: { roundOrder: true },
  });
  const roundOrder = (last?.roundOrder ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
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
        scheduledAt: d.scheduledAt ?? null,
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

  const existing = await prisma.interviewRound.findUnique({
    where: { id: roundId },
  });
  if (!existing) return { error: "This interview round no longer exists." };

  const resultChanged = existing.result !== d.result;
  const feedbackChanged =
    String(existing.feedback ?? "") !== String(d.feedback ?? "");

  await prisma.$transaction(async (tx) => {
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
        scheduledAt: d.scheduledAt ?? null,
        feedback: d.feedback ?? null,
        notes: d.notes ?? null,
        updatedById: user.id,
      },
    });
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
