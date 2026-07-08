import { get } from "@vercel/blob";
import { getCurrentUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { JOB_ARCHIVE_PREFIX } from "@/server/job-erase";

export const dynamic = "force-dynamic";

/**
 * Admin-only download of a stored permanent-erase job backup, streamed from the
 * private Blob store. Mirrors the candidate archive download route.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!hasFullAccess(user)) return new Response("Forbidden", { status: 403 });

  const pathname = new URL(req.url).searchParams.get("path") ?? "";
  if (!pathname.startsWith(JOB_ARCHIVE_PREFIX)) {
    return new Response("Bad request", { status: 400 });
  }

  const result = await get(pathname, { access: "private" });
  if (result === null || result.statusCode !== 200) {
    return new Response("Not found", { status: 404 });
  }

  const filename = pathname.split("/").pop() || "job-archive.zip";
  return new Response(result.stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
