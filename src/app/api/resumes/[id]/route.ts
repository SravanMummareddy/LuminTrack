import { gunzipSync } from "node:zlib";
import { get } from "@vercel/blob";
import { getCurrentUser, getScopedPrisma } from "@/lib/session";

export const dynamic = "force-dynamic";

const EXT_BY_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

function downloadName(label: string, contentType: string, pathname: string): string {
  const base = label.replace(/[^a-zA-Z0-9._ -]+/g, "-").replace(/"/g, "").trim() || "resume";
  const ext =
    EXT_BY_TYPE[contentType] ?? pathname.split(".").pop()?.toLowerCase() ?? "";
  return ext && !base.toLowerCase().endsWith(`.${ext}`) ? `${base}.${ext}` : base;
}

/**
 * Streams a candidate résumé. Private Vercel Blobs are never fetched directly by
 * the browser — this authenticated route is the only way in: it looks the résumé
 * up, then `get(pathname, { access: 'private' })` and pipes the stream back.
 * A résumé row with no blob (never uploaded) returns 404.
 *
 * `?download=1` forces a download; otherwise it's served inline (so a PDF can be
 * embedded in the preview iframe).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const db = await getScopedPrisma();
  const { id } = await context.params;
  const resume = await db.candidateResume.findUnique({
    where: { id },
    select: {
      blobPathname: true,
      contentType: true,
      label: true,
    },
  });
  if (!resume || !resume.blobPathname) {
    return new Response("Not found", { status: 404 });
  }

  const result = await get(resume.blobPathname, { access: "private" });
  if (result === null || result.statusCode !== 200) {
    return new Response("Not found", { status: 404 });
  }

  const contentType =
    result.blob.contentType || resume.contentType || "application/octet-stream";
  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = downloadName(resume.label, contentType, resume.blobPathname);

  // Blobs are stored gzip-compressed (see uploadPrivateFile). Inflate here and
  // serve the plain bytes rather than passing them through with a manual
  // `Content-Encoding: gzip` — that header is fragile once the dev server /
  // platform also touches compression (the browser can get
  // ERR_CONTENT_DECODING_FAILED, which renders as a blank/black preview iframe).
  // Files are size-capped, so buffering + a synchronous inflate is cheap.
  const body = await inflateBody(result.stream);

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      // RFC 5987 `filename*` carries the (percent-encoded) name; the quoted
      // `filename` stays as an ASCII fallback. Encoding the value keeps the
      // header injection-safe regardless of what the label sanitizer lets
      // through, so a future regex change can't leak a quote/CRLF into it.
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      // Résumés are PII — never cache in shared/proxy caches.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Read a stored blob stream and gunzip it. Falls back to the raw bytes for any
 *  (legacy) blob that wasn't stored gzipped, so serving never corrupts a file.
 *  Returns a fresh Uint8Array (a valid Response body — a Node Buffer is not,
 *  by its type). */
async function inflateBody(stream: ReadableStream | unknown): Promise<ArrayBuffer> {
  const stored = Buffer.from(
    await new Response(stream as BodyInit).arrayBuffer(),
  );
  const isGzip = stored[0] === 0x1f && stored[1] === 0x8b;
  const out = isGzip ? gunzipSync(stored) : stored;
  // Copy into a standalone ArrayBuffer — a concrete Response body, dodging the
  // Uint8Array<ArrayBufferLike> vs <ArrayBuffer> generic mismatch.
  const ab = new ArrayBuffer(out.byteLength);
  new Uint8Array(ab).set(out);
  return ab;
}
