"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/server/activity";
import { candidateResumeSchema } from "@/lib/validation/resume";
import { toFieldErrors } from "@/lib/validation/common";
import type { FormState } from "@/lib/form-state";

function readResume(formData: FormData) {
  return candidateResumeSchema.safeParse({
    candidateId: formData.get("candidateId") ?? "",
    label: formData.get("label") ?? "",
    driveLink: formData.get("driveLink") ?? "",
  });
}

/** Adds a résumé to a candidate's library. */
export async function createCandidateResume(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = readResume(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const candidate = await prisma.candidate.findUnique({
    where: { id: d.candidateId },
    select: { id: true },
  });
  if (!candidate) return { error: "This candidate no longer exists." };

  await prisma.$transaction(async (tx) => {
    const created = await tx.candidateResume.create({
      data: {
        candidateId: d.candidateId,
        label: d.label,
        driveLink: d.driveLink,
      },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "RESUME_ADDED",
      description: `Resume "${created.label}" added`,
      performedById: user.id,
      candidateId: d.candidateId,
    });
  });

  revalidatePath(`/candidates/${d.candidateId}`);
  return { ok: true };
}

/** Edits a résumé's label or link. The change does not re-sync past submissions. */
export async function updateCandidateResume(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const resumeId = String(formData.get("id") ?? "").trim();
  if (!resumeId) return { error: "Missing résumé reference." };

  const parsed = readResume(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const existing = await prisma.candidateResume.findUnique({
    where: { id: resumeId },
  });
  if (!existing) return { error: "This résumé no longer exists." };

  const linkChanged = existing.driveLink !== d.driveLink;
  const labelChanged = existing.label !== d.label;
  const labelPart = labelChanged
    ? `"${existing.label}" → "${d.label}"`
    : `"${d.label}"`;
  const linkPart = linkChanged ? "link changed" : "link unchanged";

  await prisma.$transaction(async (tx) => {
    await tx.candidateResume.update({
      where: { id: resumeId },
      data: { label: d.label, driveLink: d.driveLink },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "RESUME_UPDATED",
      description: `Resume ${labelPart} updated · ${linkPart}`,
      oldValue: linkChanged ? existing.driveLink : null,
      newValue: linkChanged ? d.driveLink : null,
      performedById: user.id,
      candidateId: existing.candidateId,
    });
  });

  revalidatePath(`/candidates/${existing.candidateId}`);
  return { ok: true };
}

/**
 * Archives a résumé (soft delete). The row stays, so any submission that used
 * it keeps its live `candidateResumeId` link *and* its snapshot. Archived
 * résumés drop out of the library's active list and the submit picker until
 * restored. This is the default "remove" action.
 */
export async function archiveCandidateResume(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const resumeId = String(formData.get("id") ?? "").trim();
  if (!resumeId) return;

  const existing = await prisma.candidateResume.findUnique({
    where: { id: resumeId },
    select: { id: true, label: true, candidateId: true, isActive: true },
  });
  if (!existing || !existing.isActive) return;

  await prisma.$transaction(async (tx) => {
    await tx.candidateResume.update({
      where: { id: resumeId },
      data: { isActive: false },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "RESUME_ARCHIVED",
      description: `Resume "${existing.label}" archived`,
      performedById: user.id,
      candidateId: existing.candidateId,
    });
  });

  revalidatePath(`/candidates/${existing.candidateId}`);
}

/** Restores an archived résumé back into the active library. */
export async function restoreCandidateResume(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const resumeId = String(formData.get("id") ?? "").trim();
  if (!resumeId) return;

  const existing = await prisma.candidateResume.findUnique({
    where: { id: resumeId },
    select: { id: true, label: true, candidateId: true, isActive: true },
  });
  if (!existing || existing.isActive) return;

  await prisma.$transaction(async (tx) => {
    await tx.candidateResume.update({
      where: { id: resumeId },
      data: { isActive: true },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "RESUME_RESTORED",
      description: `Resume "${existing.label}" restored`,
      performedById: user.id,
      candidateId: existing.candidateId,
    });
  });

  revalidatePath(`/candidates/${existing.candidateId}`);
}

/**
 * Permanently deletes a résumé. Guarded: only allowed when nothing references
 * it (0 submissions) — a used résumé can only be archived, never hard-deleted,
 * so submission history is never severed. The UI only offers this for unused
 * résumés; this count check is the server-side backstop.
 */
export async function deleteCandidateResume(formData: FormData): Promise<void> {
  const user = await requireUser();
  const resumeId = String(formData.get("id") ?? "").trim();
  if (!resumeId) return;

  const existing = await prisma.candidateResume.findUnique({
    where: { id: resumeId },
    include: { _count: { select: { submissions: true } } },
  });
  if (!existing) return;
  // Backstop: never hard-delete a résumé still referenced by a submission.
  if (existing._count.submissions > 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.candidateResume.delete({ where: { id: resumeId } });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "RESUME_DELETED",
      description: `Resume "${existing.label}" permanently deleted`,
      performedById: user.id,
      candidateId: existing.candidateId,
    });
  });

  revalidatePath(`/candidates/${existing.candidateId}`);
}
