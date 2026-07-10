import { getCurrentUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { CANDIDATE_ARCHIVE_PREFIX } from "@/server/candidate-erase";
import { readArchiveSummary } from "@/server/exporters/read-archive-summary";

export const dynamic = "force-dynamic";

/**
 * Admin-only in-app preview of a stored candidate backup — the profile +
 * submissions summary parsed from the zip, so the recycle bin can show what a
 * backup contains before it's removed for good. Read-only (no file leaves the
 * server), so unlike Download it is not logged as a DATA_EXPORTED row.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!hasFullAccess(user)) return new Response("Forbidden", { status: 403 });

  const pathname = new URL(req.url).searchParams.get("path") ?? "";
  // Confine to the archive prefix so this can't be turned into a read-any-blob.
  if (!pathname.startsWith(CANDIDATE_ARCHIVE_PREFIX)) {
    return new Response("Bad request", { status: 400 });
  }

  const summary = await readArchiveSummary(pathname);
  if (!summary || summary.kind !== "candidate") {
    return new Response("Not found", { status: 404 });
  }

  return Response.json(summary, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
