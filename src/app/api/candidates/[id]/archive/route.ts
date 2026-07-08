import { getCurrentUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { prisma } from "@/server/db";
import { buildCandidateArchive } from "@/server/exporters/build-candidate-archive";

/**
 * Admin-only download of a candidate's personal-data archive (profile +
 * submissions summary + résumé/document files) as a zip. The "download before
 * you erase" safety net for the right-to-be-forgotten flow. Logged as a
 * DATA_EXPORTED audit row since it moves PII off-platform.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!hasFullAccess(user)) return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  const archive = await buildCandidateArchive(id);
  if (!archive) return new Response("Not found", { status: 404 });

  await prisma.activity.create({
    data: {
      entityType: "CANDIDATE",
      action: "DATA_EXPORTED",
      description: `Downloaded personal-data archive for ${archive.displayId}`,
      performedById: user!.id,
      candidateId: id,
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
