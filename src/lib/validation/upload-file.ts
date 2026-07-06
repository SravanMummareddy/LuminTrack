/**
 * Shared validation for uploaded files (résumés and candidate documents) —
 * PDF or Word only, with a size cap. Meaningful compression of these already-
 * compressed formats isn't feasible server-side, so oversize files are rejected
 * rather than shrunk.
 */

/** ~8 MB cap. */
export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

/** Accepted formats — matched by MIME type, with a filename-extension fallback
 *  (some browsers send an empty `type`). */
export const UPLOAD_ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const UPLOAD_ALLOWED_EXTS = [".pdf", ".doc", ".docx"];

/** The `accept` attribute for a file input. */
export const UPLOAD_ACCEPT = [...UPLOAD_ALLOWED_EXTS, ...UPLOAD_ALLOWED_TYPES].join(",");

/** Validates an uploaded file; returns an error message or null. */
export function uploadFileError(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  if (!file || file.size === 0) return "Choose a file to upload.";
  if (file.size > UPLOAD_MAX_BYTES)
    return `File is too large — the limit is ${Math.round(
      UPLOAD_MAX_BYTES / (1024 * 1024),
    )} MB.`;
  const name = file.name.toLowerCase();
  const okType = UPLOAD_ALLOWED_TYPES.includes(file.type);
  const okExt = UPLOAD_ALLOWED_EXTS.some((ext) => name.endsWith(ext));
  if (!okType && !okExt)
    return "Upload a PDF or Word document (.pdf, .doc, .docx).";
  return null;
}
