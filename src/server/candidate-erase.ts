import { del } from "@vercel/blob";
import { prisma } from "@/server/db";
import { logActivity } from "@/server/activity";

/** How long a trashed candidate stays recoverable before the scheduled job
 *  permanently erases them. */
export const CANDIDATE_TRASH_RETENTION_DAYS = 30;

/**
 * The actual right-to-be-forgotten erasure: blank the candidate's personal
 * fields, delete their résumé/document rows, and shred the Blob files. The row
 * is kept (anonymized) so linked submissions/placements stay intact.
 *
 * Extracted here (not a "use server" action) so it's callable only from trusted
 * server code — the admin "erase now" action and the scheduled purge job — and
 * never exposed as a client-invokable endpoint. Idempotent: a no-op if the
 * candidate is already erased or gone. `performedById` is the acting admin, or
 * null for the automated job (then attributed to the candidate's creator so the
 * audit row's FK stays valid).
 */
export async function hardEraseCandidate(
  candidateId: string,
  performedById: string | null,
): Promise<boolean> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      seq: true,
      erasedAt: true,
      createdById: true,
      resumes: { select: { blobUrl: true } },
      documents: { select: { blobUrl: true } },
    },
  });
  if (!candidate || candidate.erasedAt) return false;

  const displayId = `CAND-${String(candidate.seq).padStart(3, "0")}`;
  const performer = performedById ?? candidate.createdById;
  const blobUrls = [
    ...candidate.resumes.map((r) => r.blobUrl),
    ...candidate.documents.map((d) => d.blobUrl),
  ].filter((u): u is string => Boolean(u));

  await prisma.$transaction(async (tx) => {
    await tx.candidateResume.deleteMany({ where: { candidateId } });
    await tx.candidateDocument.deleteMany({ where: { candidateId } });
    await tx.candidate.update({
      where: { id: candidateId },
      data: {
        fullName: `Erased candidate #${candidate.seq}`,
        email: null,
        phone: null,
        currentLocation: null,
        workAuthorization: null,
        totalExperienceYears: null,
        currentCompany: null,
        skills: [],
        featuredSkills: [],
        linkedinUrl: null,
        resumeBlobUrl: null,
        notes: null,
        tags: [],
        lastContactedAt: null,
        source: null,
        status: "DO_NOT_CONTACT",
        isActive: false,
        erasedAt: new Date(),
      },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "CANDIDATE_ERASED",
      description: performedById
        ? `Erased personal data + ${blobUrls.length} file(s) for ${displayId}`
        : `Auto-erased from trash (retention expired) — ${blobUrls.length} file(s) for ${displayId}`,
      performedById: performer,
      candidateId,
    });
  });

  // Shred the files AFTER the DB commit — a failed blob delete leaves a harmless
  // orphan rather than blocking the erasure.
  await Promise.allSettled(blobUrls.map((u) => del(u)));
  return true;
}

/**
 * Permanently erase every trashed candidate whose retention window has expired.
 * Returns the number erased. Called by the scheduled purge route.
 */
export async function purgeExpiredTrash(): Promise<number> {
  const cutoff = new Date(
    Date.now() - CANDIDATE_TRASH_RETENTION_DAYS * 86_400_000,
  );
  const expired = await prisma.candidate.findMany({
    where: { deletedAt: { lt: cutoff }, erasedAt: null },
    select: { id: true },
  });
  let count = 0;
  for (const c of expired) {
    if (await hardEraseCandidate(c.id, null)) count += 1;
  }
  return count;
}
