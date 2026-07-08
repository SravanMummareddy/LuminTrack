import { list } from "@vercel/blob";
import { JOB_ARCHIVE_PREFIX } from "@/server/job-erase";

export type JobArchiveEntry = {
  pathname: string;
  url: string;
  size: number;
  uploadedAt: string;
  /** e.g. "JOB-00123" (parsed from the key). */
  displayId: string;
};

/**
 * The permanent-erase job backups, newest first. Listed straight from the
 * private Blob prefix (mirrors listCandidateArchives).
 */
export async function listJobArchives(): Promise<JobArchiveEntry[]> {
  const { blobs } = await list({ prefix: JOB_ARCHIVE_PREFIX });
  return blobs
    .map((b) => {
      const name = b.pathname.slice(JOB_ARCHIVE_PREFIX.length);
      const displayId = name.match(/^(JOB-\d+)/)?.[1] ?? name.replace(/\.zip$/, "");
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
