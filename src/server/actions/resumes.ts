"use server";

import { del } from "@vercel/blob";
import { uploadPrivateFile } from "@/server/blob-upload";
import { revalidatePath } from "next/cache";
import { getScopedPrisma, requireUser } from "@/lib/session";
import { logActivity } from "@/server/activity";
import {
  resumeUploadMetaSchema,
  resumeLabelSchema,
  resumeFileError,
} from "@/lib/validation/resume";
import { toFieldErrors } from "@/lib/validation/common";
import type { FormState } from "@/lib/form-state";

/** Turn a filename into a safe blob path segment (put() adds a random suffix
 *  for uniqueness, so this only needs to be filesystem-friendly). */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "resume";
}

/**
 * Uploads a résumé file to private Vercel Blob and adds it to the candidate's
 * library. The upload (a network call) happens BEFORE the DB transaction —
 * upload first, then write the row that points at it, so we never commit a row
 * referencing a blob that failed to land. Returns the created résumé so an
 * inline caller (the submission form) can select it right away.
 */
export async function uploadCandidateResume(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const db = await getScopedPrisma();
  const user = await requireUser();

  const parsed = resumeUploadMetaSchema.safeParse({
    candidateId: formData.get("candidateId") ?? "",
    label: formData.get("label") ?? "",
    kind: formData.get("kind") ?? undefined,
  });
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const { candidateId, label, kind } = parsed.data;

  const file = formData.get("file");
  if (!(file instanceof File))
    return {
      error: "Choose a file to upload.",
      fieldErrors: { file: "Choose a file to upload." },
    };
  const fileErr = resumeFileError(file);
  if (fileErr)
    return { error: fileErr, fieldErrors: { file: fileErr } };

  const candidate = await db.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true },
  });
  if (!candidate) return { error: "This candidate no longer exists." };

  // Private, gzip-compressed blob — never fetched directly by the browser;
  // served via /api/resumes/[id]. blob.pathname is the actual stored key.
  const blob = await uploadPrivateFile(
    `resumes/${candidateId}/${safeFileName(file.name)}`,
    file,
  );

  const created = await db.$transaction(async (tx) => {
    const row = await tx.candidateResume.create({
      data: {
        candidateId,
        label,
        kind,
        blobPathname: blob.pathname,
        blobUrl: blob.url,
        sizeBytes: blob.size,
        contentType: file.type || null,
      },
      select: { id: true, label: true },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "RESUME_ADDED",
      description: `Resume "${row.label}" uploaded`,
      performedById: user.id,
      candidateId,
    });
    return row;
  });

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true, createdResume: { id: created.id, label: created.label } };
}

/** Renames a résumé. The file itself can't be swapped in place — upload a new
 *  résumé for that. The change does not re-sync past submissions. */
export async function updateCandidateResume(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const db = await getScopedPrisma();
  const user = await requireUser();
  const resumeId = String(formData.get("id") ?? "").trim();
  if (!resumeId) return { error: "Missing résumé reference." };

  const parsed = resumeLabelSchema.safeParse({
    label: formData.get("label") ?? "",
    kind: formData.get("kind") ?? undefined,
  });
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  const { label, kind } = parsed.data;

  const existing = await db.candidateResume.findUnique({
    where: { id: resumeId },
    select: { id: true, label: true, kind: true, candidateId: true },
  });
  if (!existing) return { error: "This résumé no longer exists." };

  if (existing.label !== label || existing.kind !== kind) {
    const kindChanged = existing.kind !== kind;
    await db.$transaction(async (tx) => {
      await tx.candidateResume.update({
        where: { id: resumeId },
        data: { label, kind },
      });
      await logActivity(tx, {
        entityType: "CANDIDATE",
        action: "RESUME_UPDATED",
        description: kindChanged
          ? `Resume "${label}" marked ${kind === "ORIGINAL" ? "Original" : "Marketing"}`
          : `Resume "${existing.label}" → "${label}"`,
        performedById: user.id,
        candidateId: existing.candidateId,
      });
    });
  }

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
  const db = await getScopedPrisma();
  const user = await requireUser();
  const resumeId = String(formData.get("id") ?? "").trim();
  if (!resumeId) return;

  const existing = await db.candidateResume.findUnique({
    where: { id: resumeId },
    select: { id: true, label: true, candidateId: true, isActive: true },
  });
  if (!existing || !existing.isActive) return;

  await db.$transaction(async (tx) => {
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
  const db = await getScopedPrisma();
  const user = await requireUser();
  const resumeId = String(formData.get("id") ?? "").trim();
  if (!resumeId) return;

  const existing = await db.candidateResume.findUnique({
    where: { id: resumeId },
    select: { id: true, label: true, candidateId: true, isActive: true },
  });
  if (!existing || existing.isActive) return;

  await db.$transaction(async (tx) => {
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
  const db = await getScopedPrisma();
  const user = await requireUser();
  const resumeId = String(formData.get("id") ?? "").trim();
  if (!resumeId) return;

  const existing = await db.candidateResume.findUnique({
    where: { id: resumeId },
    select: {
      id: true,
      label: true,
      candidateId: true,
      blobUrl: true,
      _count: { select: { submissions: true } },
    },
  });
  if (!existing) return;
  // Backstop: never hard-delete a résumé still referenced by a submission.
  if (existing._count.submissions > 0) return;

  await db.$transaction(async (tx) => {
    await tx.candidateResume.delete({ where: { id: resumeId } });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "RESUME_DELETED",
      description: `Resume "${existing.label}" permanently deleted`,
      performedById: user.id,
      candidateId: existing.candidateId,
    });
  });

  // Free the Blob storage once the row is gone (best-effort — a failed cleanup
  // shouldn't surface an error to the user; the DB row is already deleted).
  if (existing.blobUrl) {
    try {
      await del(existing.blobUrl);
    } catch {
      // Orphaned blob; safe to ignore (no broken references).
    }
  }

  revalidatePath(`/candidates/${existing.candidateId}`);
}
