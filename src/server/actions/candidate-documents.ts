"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/server/activity";
import { candidateDocumentSchema } from "@/lib/validation/candidate-document";
import { toFieldErrors } from "@/lib/validation/common";
import {
  canManageSensitiveDocs,
  isSensitiveCategory,
} from "@/lib/permissions";
import type { FormState } from "@/lib/form-state";

const CATEGORY_LABEL: Record<string, string> = {
  IDENTITY: "Identity",
  WORK_AUTH: "Work auth",
  EDUCATION: "Education",
  EMPLOYMENT: "Employment",
  OTHER: "Other",
};

function readDocument(formData: FormData) {
  return candidateDocumentSchema.safeParse({
    candidateId: formData.get("candidateId") ?? "",
    category: formData.get("category") ?? "",
    label: formData.get("label") ?? "",
    driveLink: formData.get("driveLink") ?? "",
    issuedAt: formData.get("issuedAt") ?? "",
    expiresAt: formData.get("expiresAt") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

export async function createCandidateDocument(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = readDocument(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  if (isSensitiveCategory(d.category) && !canManageSensitiveDocs(user)) {
    return { error: "Only admins can add Identity or Work Authorization documents." };
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: d.candidateId },
    select: { id: true },
  });
  if (!candidate) return { error: "This candidate no longer exists." };

  await prisma.$transaction(async (tx) => {
    const created = await tx.candidateDocument.create({
      data: {
        candidateId: d.candidateId,
        category: d.category,
        label: d.label,
        driveLink: d.driveLink,
        issuedAt: d.issuedAt ?? null,
        expiresAt: d.expiresAt ?? null,
        notes: d.notes ?? null,
        uploadedById: user.id,
      },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "CANDIDATE_DOCUMENT_ADDED",
      description: `${CATEGORY_LABEL[created.category]} doc "${created.label}" added`,
      performedById: user.id,
      candidateId: d.candidateId,
    });
  });

  revalidatePath(`/candidates/${d.candidateId}`);
  return { ok: true };
}

export async function updateCandidateDocument(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const docId = String(formData.get("id") ?? "").trim();
  if (!docId) return { error: "Missing document reference." };

  const parsed = readDocument(formData);
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const d = parsed.data;

  const existing = await prisma.candidateDocument.findUnique({
    where: { id: docId },
  });
  if (!existing) return { error: "This document no longer exists." };

  // Gate on the *destination* category — moving a doc INTO a sensitive
  // category requires admin, regardless of where it came from.
  if (
    (isSensitiveCategory(existing.category) || isSensitiveCategory(d.category)) &&
    !canManageSensitiveDocs(user)
  ) {
    return { error: "Only admins can edit Identity or Work Authorization documents." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.candidateDocument.update({
      where: { id: docId },
      data: {
        category: d.category,
        label: d.label,
        driveLink: d.driveLink,
        issuedAt: d.issuedAt ?? null,
        expiresAt: d.expiresAt ?? null,
        notes: d.notes ?? null,
      },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "CANDIDATE_DOCUMENT_UPDATED",
      description: `${CATEGORY_LABEL[d.category]} doc "${d.label}" updated`,
      performedById: user.id,
      candidateId: existing.candidateId,
    });
  });

  revalidatePath(`/candidates/${existing.candidateId}`);
  return { ok: true };
}

export async function deleteCandidateDocument(formData: FormData): Promise<void> {
  const user = await requireUser();
  const docId = String(formData.get("id") ?? "").trim();
  if (!docId) return;

  const existing = await prisma.candidateDocument.findUnique({
    where: { id: docId },
  });
  if (!existing) return;

  if (isSensitiveCategory(existing.category) && !canManageSensitiveDocs(user)) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.candidateDocument.delete({ where: { id: docId } });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "CANDIDATE_DOCUMENT_REMOVED",
      description: `${CATEGORY_LABEL[existing.category]} doc "${existing.label}" removed`,
      performedById: user.id,
      candidateId: existing.candidateId,
    });
  });

  revalidatePath(`/candidates/${existing.candidateId}`);
}
