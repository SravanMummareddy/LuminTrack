import { get } from "@vercel/blob";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/server/db";

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
 * Legacy Google-Drive résumés (no blob) redirect to the Drive link.
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

  const { id } = await context.params;
  const resume = await prisma.candidateResume.findUnique({
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

  return new Response(result.stream, {
    headers: {
      "Content-Type": contentType,
      // Blobs are stored gzip-compressed (see uploadPrivateFile); the browser
      // inflates transparently.
      "Content-Encoding": "gzip",
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
