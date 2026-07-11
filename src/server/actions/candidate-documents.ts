"use server";

import { del } from "@vercel/blob";
import { uploadPrivateFile } from "@/server/blob-upload";
import { revalidatePath } from "next/cache";
import { getScopedPrisma, requireUser } from "@/lib/session";
import { logActivity } from "@/server/activity";
import { candidateDocumentSchema } from "@/lib/validation/candidate-document";
import { uploadFileError } from "@/lib/validation/upload-file";
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

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "document";
}

function readDocument(formData: FormData) {
  return candidateDocumentSchema.safeParse({
    candidateId: formData.get("candidateId") ?? "",
    category: formData.get("category") ?? "",
    label: formData.get("label") ?? "",
    issuedAt: formData.get("issuedAt") ?? "",
    expiresAt: formData.get("expiresAt") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

/** Uploads a document file to private Blob (gzip-compressed) and records it.
 *  Sensitive categories (Identity / Work auth) are admin-only. Upload happens
 *  before the DB write so a row never points at a failed upload. */
export async function createCandidateDocument(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const db = await getScopedPrisma();
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

  const file = formData.get("file");
  if (!(file instanceof File))
    return {
      error: "Choose a file to upload.",
      fieldErrors: { file: "Choose a file to upload." },
    };
  const fileErr = uploadFileError(file);
  if (fileErr) return { error: fileErr, fieldErrors: { file: fileErr } };

  const candidate = await db.candidate.findUnique({
    where: { id: d.candidateId },
    select: { id: true },
  });
  if (!candidate) return { error: "This candidate no longer exists." };

  const blob = await uploadPrivateFile(
    `documents/${d.candidateId}/${safeFileName(file.name)}`,
    file,
  );

  await db.$transaction(async (tx) => {
    const created = await tx.candidateDocument.create({
      data: {
        candidateId: d.candidateId,
        category: d.category,
        label: d.label,
        blobPathname: blob.pathname,
        blobUrl: blob.url,
        sizeBytes: blob.size,
        contentType: file.type || null,
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

/** Edits a document's metadata (category, label, dates, notes). The uploaded
 *  file can't be swapped in place — add a new document for a new file. */
export async function updateCandidateDocument(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const db = await getScopedPrisma();
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

  const existing = await db.candidateDocument.findUnique({
    where: { id: docId },
    select: { id: true, category: true, candidateId: true },
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

  await db.$transaction(async (tx) => {
    await tx.candidateDocument.update({
      where: { id: docId },
      data: {
        category: d.category,
        label: d.label,
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
  const db = await getScopedPrisma();
  const user = await requireUser();
  const docId = String(formData.get("id") ?? "").trim();
  if (!docId) return;

  const existing = await db.candidateDocument.findUnique({
    where: { id: docId },
    select: {
      id: true,
      category: true,
      label: true,
      candidateId: true,
      blobUrl: true,
    },
  });
  if (!existing) return;

  if (isSensitiveCategory(existing.category) && !canManageSensitiveDocs(user)) {
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.candidateDocument.delete({ where: { id: docId } });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "CANDIDATE_DOCUMENT_REMOVED",
      description: `${CATEGORY_LABEL[existing.category]} doc "${existing.label}" removed`,
      performedById: user.id,
      candidateId: existing.candidateId,
    });
  });

  // Free the Blob storage once the row is gone (best-effort).
  if (existing.blobUrl) {
    try {
      await del(existing.blobUrl);
    } catch {
      // Orphaned blob; safe to ignore.
    }
  }

  revalidatePath(`/candidates/${existing.candidateId}`);
}
