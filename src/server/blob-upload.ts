import { gzipSync } from "node:zlib";
import { put } from "@vercel/blob";

/**
 * Thrown when the Blob `put()` fails (transient network, storage quota, a
 * missing/rotated `BLOB_READ_WRITE_TOKEN`). Callers catch this to return a
 * friendly form error instead of letting it escape to the error boundary and
 * blow away a half-filled form.
 */
export class UploadFailedError extends Error {
  constructor(cause?: unknown) {
    super("File upload failed");
    this.name = "UploadFailedError";
    this.cause = cause;
  }
}

/**
 * Uploads a file to **private** Vercel Blob, gzip-compressed to save storage
 * against the free-tier cap. The stored bytes are gzipped; the serving route
 * sets `Content-Encoding: gzip` so the browser transparently inflates them.
 *
 * Every upload path goes through here (résumés, documents, the seed samples via
 * `putSampleBlob`), so every blob is gzipped — the serve routes can set the
 * encoding header unconditionally. Savings are real but modest: ~10–30% on
 * text PDFs, ~0% on DOCX (already a ZIP) and image/scanned PDFs.
 *
 * Returns the blob's stored `pathname` (the key for `get()`), its `url`, and the
 * **original** (pre-gzip) byte size for display.
 */
export async function uploadPrivateFile(
  pathname: string,
  file: File,
): Promise<{ pathname: string; url: string; size: number }> {
  const raw = Buffer.from(await file.arrayBuffer());
  const gzipped = gzipSync(raw);
  let blob;
  try {
    blob = await put(pathname, gzipped, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type || undefined,
    });
  } catch (err) {
    // Log the real reason (quota, token, network) for ops; hand callers a typed
    // error so they can surface a friendly retry instead of crashing the page.
    console.error("[blob-upload] put failed for", pathname, "-", err);
    throw new UploadFailedError(err);
  }
  return { pathname: blob.pathname, url: blob.url, size: raw.length };
}

/** gzip a raw buffer for storage (used by the seed to pre-gzip sample PDFs so
 *  they match the Content-Encoding the serve routes always set). */
export function gzipForBlob(raw: Buffer): Buffer {
  return gzipSync(raw);
}
