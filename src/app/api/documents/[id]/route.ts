import { get } from "@vercel/blob";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/server/db";
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
 * gzip-compressed (see uploadPrivateFile); we set Content-Encoding: gzip so the
 * browser inflates. `?download=1` forces a download.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await context.params;
  const doc = await prisma.candidateDocument.findUnique({
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

  return new Response(result.stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Encoding": "gzip",
      // RFC 5987 `filename*` carries the (percent-encoded) name; the quoted
      // `filename` stays as an ASCII fallback. Encoding keeps the header
      // injection-safe regardless of what the label sanitizer lets through.
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
