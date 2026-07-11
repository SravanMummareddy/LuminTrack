import { put } from "@vercel/blob";
import type { ScopedPrisma } from "@/server/db";
import { logActivity } from "@/server/activity";
import { buildJobArchive } from "@/server/exporters/build-job-archive";

/** How long a trashed job stays recoverable before the scheduled job erases it. */
export const JOB_TRASH_RETENTION_DAYS = 30;

/** Prefix under which permanent-erase job backups live in private Blob. */
export const JOB_ARCHIVE_PREFIX = "archives/jobs/";

/**
 * Build a full archive of the job (requisition + submissions + VPR summary) and
 * store it in private Blob — the recoverable backup that MUST exist before we
 * erase anything. Throws if the upload fails so the caller aborts. Returns the
 * stored pathname.
 */
async function archiveJobToBlob(
  db: ScopedPrisma,
  jobId: string,
  displayId: string,
): Promise<string | null> {
  const archive = await buildJobArchive(db, jobId);
  if (!archive) return null;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const blob = await put(
    `${JOB_ARCHIVE_PREFIX}${displayId}-${stamp}.zip`,
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

/**
 * Permanently erase a job — history-protecting by design (owner decision):
 *   • EMPTY job (0 submissions, 0 placements) → hard-removed (row + its VPRs +
 *     assignments/notes cascade). A clean requisition mistake, fully gone.
 *   • Job WITH history → anonymized "Removed requisition #N" tombstone: the row
 *     and its submissions/analytics survive, only its VPRs are dropped.
 * A backup zip is written to Blob FIRST; if that throws, nothing is scrubbed.
 * Extracted (not a "use server" action) so only trusted code calls it — the
 * admin erase action and the scheduled purge. Idempotent.
 */
export async function hardEraseJob(
  db: ScopedPrisma,
  jobId: string,
  performedById: string | null,
): Promise<boolean> {
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: {
      seq: true,
      erasedAt: true,
      createdById: true,
      _count: { select: { submissions: true, placements: true } },
    },
  });
  if (!job || job.erasedAt) return false;

  const displayId = `JOB-${String(job.seq).padStart(5, "0")}`;
  const performer = performedById ?? job.createdById;
  const empty = job._count.submissions === 0 && job._count.placements === 0;

  // Back up FIRST — never scrub/remove without a recoverable archive.
  const archivedTo = await archiveJobToBlob(db, jobId, displayId);

  await db.$transaction(async (tx) => {
    // VPRs are staging planning records with a Restrict FK — drop them
    // explicitly (their submissions keep their rate snapshots; the FK is SetNull).
    await tx.vendorRequirement.deleteMany({ where: { jobId } });

    if (empty) {
      // Nothing worth keeping — remove the row (cascades assignments/notes and
      // its own activity trail). Log WITHOUT jobId so this audit row survives.
      await tx.job.delete({ where: { id: jobId } });
      await logActivity(tx, {
        entityType: "JOB",
        action: "JOB_ERASED",
        description: `Erased empty ${displayId} — removed${archivedTo ? " · backup archived" : ""}`,
        performedById: performer,
      });
    } else {
      // Tombstone — keep the row + its submissions (recruiter history). Keep the
      // title too (owner decision): erased jobs read "Title (deleted)" in history,
      // the suffix derived at display from erasedAt. Free-text notes are cleared.
      await tx.job.update({
        where: { id: jobId },
        data: {
          description: null,
          notes: null,
          status: "CANCELLED",
          deletedAt: new Date(),
          erasedAt: new Date(),
        },
      });
      await logActivity(tx, {
        entityType: "JOB",
        action: "JOB_ERASED",
        description: `Erased ${displayId} — tombstoned, kept ${job._count.submissions} submission(s)${archivedTo ? " · backup archived" : ""}`,
        performedById: performer,
        jobId,
      });
    }
  });

  return true;
}

/**
 * Permanently erase every trashed job whose retention window has expired.
 * Returns the count erased. Called by the scheduled purge route. One failure
 * (e.g. transient Blob error) leaves that job for the next run.
 */
export async function purgeExpiredTrashedJobs(db: ScopedPrisma): Promise<number> {
  const cutoff = new Date(Date.now() - JOB_TRASH_RETENTION_DAYS * 86_400_000);
  const expired = await db.job.findMany({
    where: { deletedAt: { lt: cutoff }, erasedAt: null },
    select: { id: true },
  });
  let count = 0;
  for (const j of expired) {
    try {
      if (await hardEraseJob(db, j.id, null)) count += 1;
    } catch {
      // Skip — retried next run.
    }
  }
  return count;
}
