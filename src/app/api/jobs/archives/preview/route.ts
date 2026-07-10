import { getCurrentUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { JOB_ARCHIVE_PREFIX } from "@/server/job-erase";
import { readArchiveSummary } from "@/server/exporters/read-archive-summary";

export const dynamic = "force-dynamic";

/**
 * Admin-only in-app preview of a stored job backup — the requisition +
 * submissions summary parsed from the zip. Mirrors the candidate preview route.
 * Read-only, so not logged as a DATA_EXPORTED row.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!hasFullAccess(user)) return new Response("Forbidden", { status: 403 });

  const pathname = new URL(req.url).searchParams.get("path") ?? "";
  if (!pathname.startsWith(JOB_ARCHIVE_PREFIX)) {
    return new Response("Bad request", { status: 400 });
  }

  const summary = await readArchiveSummary(pathname);
  if (!summary || summary.kind !== "job") {
    return new Response("Not found", { status: 404 });
  }

  return Response.json(summary, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
