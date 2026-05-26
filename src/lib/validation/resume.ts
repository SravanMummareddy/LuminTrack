import { z } from "zod";

/** A saved résumé in a candidate's library — label + a Google Drive link. */
export const candidateResumeSchema = z.object({
  candidateId: z.string().min(1, "Missing candidate reference."),
  label: z.string().trim().min(1, "Give this resume a label.").max(120),
  driveLink: z.url("Enter a valid Google Drive link."),
});

export type CandidateResumeInput = z.infer<typeof candidateResumeSchema>;

/**
 * Returns `true` if the URL looks like a Google Drive / Docs link. Used by
 * form UIs to surface a non-blocking warning when a recruiter pastes a link
 * from somewhere else (Dropbox, raw S3 URL, etc.) — we still accept it, but
 * the inline résumé preview only works for Drive.
 */
export function isLikelyDriveUrl(value: string): boolean {
  if (!value) return true; // empty → no warning yet
  try {
    const host = new URL(value).host.toLowerCase();
    return (
      host === "drive.google.com" ||
      host === "docs.google.com" ||
      host.endsWith(".google.com")
    );
  } catch {
    return true; // malformed URL — let Zod handle it with the field error
  }
}

export const DRIVE_LINK_WARNING =
  "This doesn't look like a Google Drive link. It will still be saved, but the inline résumé preview only works for Drive URLs.";
