import { get } from "@vercel/blob";
import { getCurrentUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { CANDIDATE_ARCHIVE_PREFIX } from "@/server/candidate-erase";

export const dynamic = "force-dynamic";

/**
 * Admin-only download of a stored permanent-delete backup, streamed from the
 * private Blob store. The archive zips are NOT gzipped (a zip is already
 * compressed), so no Content-Encoding here — unlike the résumé/document routes.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!hasFullAccess(user)) return new Response("Forbidden", { status: 403 });

  const pathname = new URL(req.url).searchParams.get("path") ?? "";
  // Confine to the archive prefix so this can't be turned into a read-any-blob.
  if (!pathname.startsWith(CANDIDATE_ARCHIVE_PREFIX)) {
    return new Response("Bad request", { status: 400 });
  }

  const result = await get(pathname, { access: "private" });
  if (result === null || result.statusCode !== 200) {
    return new Response("Not found", { status: 404 });
  }

  const filename = pathname.split("/").pop() || "candidate-archive.zip";
  return new Response(result.stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
