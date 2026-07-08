import { list } from "@vercel/blob";
import { CANDIDATE_ARCHIVE_PREFIX } from "@/server/candidate-erase";

export type CandidateArchiveEntry = {
  /** Blob key — the handle for download + delete. */
  pathname: string;
  url: string;
  /** Bytes. */
  size: number;
  /** ISO timestamp the backup was written. */
  uploadedAt: string;
  /** e.g. "CAND-001" (parsed from the key). */
  displayId: string;
};

/**
 * The permanent-delete backups, newest first. Listed straight from the private
 * Blob prefix — the scrubbed candidate row keeps no queryable PII, so the Blob
 * store is the (privacy-correct) source of truth for "what was deleted".
 */
export async function listCandidateArchives(): Promise<CandidateArchiveEntry[]> {
  const { blobs } = await list({ prefix: CANDIDATE_ARCHIVE_PREFIX });
  return blobs
    .map((b) => {
      const name = b.pathname.slice(CANDIDATE_ARCHIVE_PREFIX.length);
      const displayId = name.match(/^(CAND-\d+)/)?.[1] ?? name.replace(/\.zip$/, "");
      return {
        pathname: b.pathname,
        url: b.url,
        size: b.size,
        uploadedAt: b.uploadedAt.toISOString(),
        displayId,
      };
    })
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
}
