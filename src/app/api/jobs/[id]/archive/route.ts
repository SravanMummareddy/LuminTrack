import { getCurrentUser, getScopedPrisma } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { buildJobArchive } from "@/server/exporters/build-job-archive";

/**
 * Admin-only download of a job's archive (requisition + submissions + VPR
 * summary) as a zip — the "download before you erase" safety net for the job
 * trash/erase flow. Mirrors the candidate archive route.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!hasFullAccess(user)) return new Response("Forbidden", { status: 403 });

  const db = await getScopedPrisma();
  const { id } = await params;
  const archive = await buildJobArchive(db, id);
  if (!archive) return new Response("Not found", { status: 404 });

  await db.activity.create({
    data: {
      entityType: "JOB",
      action: "DATA_EXPORTED",
      description: `Downloaded archive for ${archive.displayId}`,
      performedById: user!.id,
      jobId: id,
    },
  });

  return new Response(new Uint8Array(archive.zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${archive.displayId}-archive.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
