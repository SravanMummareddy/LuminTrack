import { gunzipSync } from "node:zlib";
import { get } from "@vercel/blob";
import { getCurrentUser, getScopedPrisma } from "@/lib/session";
import { canViewSensitiveDocs, isSensitiveCategory } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const EXT_BY_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

function downloadName(label: string, contentType: string, pathname: string): string {
  const base = label.replace(/[^a-zA-Z0-9._ -]+/g, "-").replace(/"/g, "").trim() || "document";
  const ext =
    EXT_BY_TYPE[contentType] ?? pathname.split(".").pop()?.toLowerCase() ?? "";
  return ext && !base.toLowerCase().endsWith(`.${ext}`) ? `${base}.${ext}` : base;
}

/**
 * Streams a candidate document from private Blob. Identity / Work-auth documents
 * are admin-only — the same gate the query layer applies. Stored bytes are
 * gzip-compressed (see uploadPrivateFile); we inflate here and serve plain bytes
 * (a manual Content-Encoding: gzip is fragile — see the résumé route).
 * `?download=1` forces a download.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const db = await getScopedPrisma();
  const { id } = await context.params;
  const doc = await db.candidateDocument.findUnique({
    where: { id },
    select: {
      category: true,
      blobPathname: true,
      contentType: true,
      label: true,
    },
  });
  if (!doc || !doc.blobPathname) {
    return new Response("Not found", { status: 404 });
  }
  if (isSensitiveCategory(doc.category) && !canViewSensitiveDocs(user)) {
    return new Response("Forbidden", { status: 403 });
  }

  const result = await get(doc.blobPathname, { access: "private" });
  if (result === null || result.statusCode !== 200) {
    return new Response("Not found", { status: 404 });
  }

  const contentType =
    result.blob.contentType || doc.contentType || "application/octet-stream";
  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = downloadName(doc.label, contentType, doc.blobPathname);

  const stored = Buffer.from(
    await new Response(result.stream as BodyInit).arrayBuffer(),
  );
  const out =
    stored[0] === 0x1f && stored[1] === 0x8b ? gunzipSync(stored) : stored;
  // Copy into a standalone ArrayBuffer (a concrete Response body — a Node Buffer
  // / Uint8Array<ArrayBufferLike> isn't accepted by its type).
  const body = new ArrayBuffer(out.byteLength);
  new Uint8Array(body).set(out);

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      // RFC 5987 `filename*` carries the (percent-encoded) name; the quoted
      // `filename` stays as an ASCII fallback. Encoding keeps the header
      // injection-safe regardless of what the label sanitizer lets through.
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
