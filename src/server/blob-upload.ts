import { gzipSync } from "node:zlib";
import { put } from "@vercel/blob";

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
  const blob = await put(pathname, gzipped, {
    access: "private",
    addRandomSuffix: true,
    contentType: file.type || undefined,
  });
  return { pathname: blob.pathname, url: blob.url, size: raw.length };
}

/** gzip a raw buffer for storage (used by the seed to pre-gzip sample PDFs so
 *  they match the Content-Encoding the serve routes always set). */
export function gzipForBlob(raw: Buffer): Buffer {
  return gzipSync(raw);
}
