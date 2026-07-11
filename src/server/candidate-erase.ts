import { del, put } from "@vercel/blob";
import type { ScopedPrisma } from "@/server/db";
import { logActivity } from "@/server/activity";
import { buildCandidateArchive } from "@/server/exporters/build-candidate-archive";

/** Prefix under which permanent-delete backups live in private Blob. The admin
 *  "Deleted candidates" screen lists this prefix. */
export const CANDIDATE_ARCHIVE_PREFIX = "archives/candidates/";

/**
 * Build a full personal-data archive of the candidate and store it in private
 * Blob — the recoverable backup that MUST exist before we scrub anything. Throws
 * if the upload fails, so the caller aborts the erase rather than destroying
 * data with no backup. Returns the stored pathname.
 */
async function archiveCandidateToBlob(
  db: ScopedPrisma,
  candidateId: string,
  displayId: string,
): Promise<string | null> {
  // strict: if any file can't be read, this throws and the erase aborts (the
  // caller runs this BEFORE the destructive transaction) — never shred a file
  // that didn't make it into the recoverable backup.
  const archive = await buildCandidateArchive(db, candidateId, { strict: true });
  if (!archive) return null;
  // Sortable, human-readable key: archives/candidates/CAND-001-2026-07-08-01-40-00.zip
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const blob = await put(
    `${CANDIDATE_ARCHIVE_PREFIX}${displayId}-${stamp}.zip`,
    archive.zip,
    {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/zip",
    },
  );
  return blob.pathname;
}

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
  db: ScopedPrisma,
  candidateId: string,
  performedById: string | null,
): Promise<boolean> {
  const candidate = await db.candidate.findUnique({
    where: { id: candidateId },
    select: {
      seq: true,
      erasedAt: true,
      deletedAt: true,
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

  // Back up FIRST — never scrub without a recoverable archive in Blob. If this
  // throws (e.g. Blob misconfigured), the erase aborts and the data is intact.
  const archivedTo = await archiveCandidateToBlob(db, candidateId, displayId);

  await db.$transaction(async (tx) => {
    await tx.candidateResume.deleteMany({ where: { candidateId } });
    await tx.candidateDocument.deleteMany({ where: { candidateId } });
    // Take the (now erased) person off the marketing bench for good.
    await tx.benchConsultant.updateMany({
      where: { candidateId, marketingStatus: { in: ["ACTIVE", "PAUSED"] } },
      data: { marketingStatus: "INACTIVE" },
    });
    await tx.candidate.update({
      where: { id: candidateId },
      data: {
        // Keep the real name (owner decision): erased records read "Name (deleted)"
        // in history — the `(deleted)` suffix is derived at display from erasedAt.
        // Everything else identifying is still scrubbed + files shredded below.
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
        // Erasing a LIVE candidate (never trashed) must also set deletedAt, or
        // the scrubbed tombstone stays in listCandidates ({deletedAt:null}), is
        // invisible to the Trash view, and — worse — is still offered by
        // listCandidateOptions in the submission/VPR/bench pickers. Mirrors
        // job-erase.ts, which sets both fields.
        deletedAt: candidate.deletedAt ?? new Date(),
        erasedAt: new Date(),
      },
    });
    await logActivity(tx, {
      entityType: "CANDIDATE",
      action: "CANDIDATE_ERASED",
      description:
        (performedById
          ? `Erased personal data + ${blobUrls.length} file(s) for ${displayId}`
          : `Auto-erased from trash (retention expired) — ${blobUrls.length} file(s) for ${displayId}`) +
        (archivedTo ? " · backup archived" : ""),
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
export async function purgeExpiredTrash(db: ScopedPrisma): Promise<number> {
  const cutoff = new Date(
    Date.now() - CANDIDATE_TRASH_RETENTION_DAYS * 86_400_000,
  );
  const expired = await db.candidate.findMany({
    where: { deletedAt: { lt: cutoff }, erasedAt: null },
    select: { id: true },
  });
  let count = 0;
  for (const c of expired) {
    try {
      if (await hardEraseCandidate(db, c.id, null)) count += 1;
    } catch {
      // A failed archive/erase (e.g. transient Blob error) leaves this candidate
      // untouched for the next run rather than aborting the whole purge.
    }
  }
  return count;
}
